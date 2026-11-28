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
  fonts,
  lightColors,
  type ResolvedMode,
  type ThemeColors,
  type ThemeMode,
} from '../theme';
import { useAuth } from './AuthContext';

const THEME_STORAGE_KEY = 'darklink:theme-preference';
const FONT_STORAGE_KEY = 'darklink:font-size';
export const WALLPAPER_KEY = 'darklink:chat-wallpaper';

export type FontSize = 'small' | 'medium' | 'large';
/** خلفية الشات: افتراضي (حسب الثيم) / صورة فاتحة / صورة غامقة / من غير صورة */
export type ChatWallpaper = 'default' | 'light' | 'dark' | 'none';

const FONT_SCALES: Record<FontSize, number> = {
  small: 0.88,
  medium: 1,
  large: 1.16,
};

/** مقاسات الخط الأصلية — بيتعمل منها نسخة مكبّرة/مصغّرة على حسب الاختيار */
const BASE_SIZES: Record<string, number> = { ...fonts.sizes };

/** بيطبّق مقياس الخط على fonts.sizes نفسها (اللي كل الشاشات بتقرأ منها)،
 *  فالاختيار بيسري على التطبيق كله من غير ما كل ملف يتعدّل. */
function applyFontScale(scale: number) {
  const sizes = fonts.sizes as unknown as Record<string, number>;
  for (const k of Object.keys(BASE_SIZES)) {
    sizes[k] = Math.max(8, Math.round(BASE_SIZES[k] * scale));
  }
}

export async function loadChatWallpaper(): Promise<ChatWallpaper> {
  try {
    const v = await AsyncStorage.getItem(WALLPAPER_KEY);
    if (v === 'light' || v === 'dark' || v === 'none' || v === 'default') return v;
  } catch {
    // تجاهل — الافتراضي
  }
  return 'default';
}

export async function saveChatWallpaper(w: ChatWallpaper): Promise<void> {
  try {
    await AsyncStorage.setItem(WALLPAPER_KEY, w);
  } catch {
    // تجاهل
  }
}

function isFontSize(v: string | null | undefined): v is FontSize {
  return v === 'small' || v === 'medium' || v === 'large';
}

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedMode;
  colors: ThemeColors;
  ready: boolean;
  setMode: (m: ThemeMode) => Promise<void>;
  fontSize: FontSize;
  fontScale: number;
  setFontSize: (s: FontSize) => Promise<void>;
}

const Ctx = createContext<ThemeState>({
  mode: 'system',
  resolved: 'dark',
  colors: darkColors,
  ready: false,
  setMode: async () => {},
  fontSize: 'medium',
  fontScale: 1,
  setFontSize: async () => {},
});

export const useTheme = () => useContext(Ctx);

function isThemeMode(v: string | null | undefined): v is ThemeMode {
  return v === 'light' || v === 'dark' || v === 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [fontSize, setFontSizeState] = useState<FontSize>('medium');
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
      try {
        const fs = await AsyncStorage.getItem(FONT_STORAGE_KEY);
        if (isFontSize(fs)) {
          setFontSizeState(fs);
          applyFontScale(FONT_SCALES[fs]);
        }
      } catch {
        // تجاهل — الحجم الافتراضي
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

  const setFontSize = useCallback(async (s: FontSize) => {
    setFontSizeState(s);
    applyFontScale(FONT_SCALES[s]);
    try {
      await AsyncStorage.setItem(FONT_STORAGE_KEY, s);
    } catch {
      // التخزين المحلي غير متاح — الاختيار يفضل للجلسة الحالية
    }
  }, []);

  const fontScale = FONT_SCALES[fontSize];

  const resolved: ResolvedMode =
    mode === 'system' ? systemScheme : mode;
  // نسخة جديدة من لوحة الألوان لما يتغيّر مقياس الخط — عشان كل
  // useMemo(makeStyles(colors)) يعيد الحساب بالمقاسات الجديدة.
  // fontScale هنا عمدًا: تغييره لازم يعيد بناء الألوان حتى لو قيم
  // الألوان نفسها متغيرتش.
  const colors: ThemeColors = useMemo(() => {
    void fontScale;
    return { ...(resolved === 'light' ? lightColors : darkColors) };
  }, [resolved, fontScale]);

  const value = useMemo<ThemeState>(
    () => ({ mode, resolved, colors, ready, setMode, fontSize, fontScale, setFontSize }),
    [mode, resolved, colors, ready, setMode, fontSize, fontScale, setFontSize],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
