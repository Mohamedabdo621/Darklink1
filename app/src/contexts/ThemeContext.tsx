// DARKLINK — نظام الثيمات (فاتح / داكن / حسب النظام) — v1.6.0
// الاختيار يتحفظ محليًا (AsyncStorage) ويُزامَن مع profiles.theme_preference
// عشان يتبع المستخدم على أي جهاز. لو العمود لسه مش موجود في القاعدة
// (قبل تطبيق الـ migration) المزامنة بتفشل بصمت والاختيار المحلي بيكفي.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import {
  darkColors,
  lightColors,
  type ResolvedMode,
  type ThemeColors,
  type ThemeMode,
} from '../theme';
import { useAuth } from './AuthContext';

const THEME_STORAGE_KEY = 'darklink:theme-preference';

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedMode;
  colors: ThemeColors;
  ready: boolean;
  setMode: (m: ThemeMode) => Promise<void>;
}

const Ctx = createContext<ThemeState>({
  mode: 'system',
  resolved: 'dark',
  colors: darkColors,
  ready: false,
  setMode: async () => {},
});

export const useTheme = () => useContext(Ctx);

function isThemeMode(v: string | null | undefined): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [ready, setReady] = useState(false);
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(
    Appearance.getColorScheme() === 'light' ? 'light' : 'dark',
  );
  const localChoiceRef = useRef<boolean | null>(null);
  const profileId = profile?.id;

  // تحميل الاختيار المحفوظ (أولوية للمحلي، ثم بروفايل المستخدم)
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (isThemeMode(stored)) {
          localChoiceRef.current = true;
          setModeState(stored);
        } else {
          localChoiceRef.current = false;
        }
      } catch {
        localChoiceRef.current = false;
      }
      setReady(true);
    })();
  }, []);

  // لو مفيش اختيار محلي والبروفايل فيه تفضيل، اعتمده
  const profilePref = profile?.theme_preference;
  useEffect(() => {
    if (!ready || localChoiceRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isThemeMode(profilePref)) setModeState(profilePref);
  }, [ready, profilePref]);

  // تتبع تغيير نظام الجهاز لما الوضع "حسب النظام"
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, []);

  const setMode = useCallback(
    async (m: ThemeMode) => {
      setModeState(m);
      localChoiceRef.current = true;
      try {
        await AsyncStorage.setItem(THEME_STORAGE_KEY, m);
      } catch {
        // التخزين المحلي غير متاح — الاختيار يفضل للجلسة الحالية
      }
      if (profileId) {
        // فشل صامت لو العمود لسه مش موجود (قبل الـ migration)
        try {
          await supabase
            .from('profiles')
            .update({ theme_preference: m })
            .eq('id', profileId);
        } catch {
          // تجاهل — الاختيار المحلي كافي
        }
      }
    },
    [profileId],
  );

  const resolved: ResolvedMode =
    mode === 'system' ? systemScheme : mode;
  const colors: ThemeColors = resolved === 'light' ? lightColors : darkColors;

  const value = useMemo<ThemeState>(
    () => ({ mode, resolved, colors, ready, setMode }),
    [mode, resolved, colors, ready, setMode],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
