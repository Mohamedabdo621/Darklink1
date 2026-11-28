import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { fetchMyProfileResult } from '../services/profile';
import { registerPushToken, unregisterPushToken } from '../services/push';

/** آخر ملف معروف للمستخدم، محفوظ محليًا — احتياطي لبوابة إكمال
 *  البيانات: لو جلب الملف فشل/اتأخر، البوابة بتستخدم تاريخ الميلاد
 *  المحفوظ هنا بدل ما تحوّل المستخدم لصفحة إكمال البيانات كل مرة. */
export const CACHED_PROFILE_KEY = 'darklink:cached-profile';

export async function getCachedProfile(): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Profile;
  } catch {
    return null;
  }
}

async function cacheProfile(p: Profile | null): Promise<void> {
  try {
    if (p) await AsyncStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(p));
    else await AsyncStorage.removeItem(CACHED_PROFILE_KEY);
  } catch {
    // التخزين المحلي فشل — مش حاجب؛ الجلب من السيرفر هو الأساس.
  }
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** آخر جلب للملف فشل (شبكة/قاعدة) — غير "مفيش ملف أصلًا" */
  profileError: boolean;
  /** بترجع true لو الجلب نجح — عشان المتصل مينتقلش غير بعد نجاح التحديث */
  refreshProfile: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  profileError: false,
  refreshProfile: async () => false,
  signOut: async () => {},
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string | null) => {
    userIdRef.current = userId;
    if (!userId) {
      setProfile(null);
      setProfileError(false);
      void cacheProfile(null);
      return;
    }
    const { profile: p, error } = await fetchMyProfileResult(userId);
    setProfileError(error);
    if (error) {
      setProfile(null);
      return;
    }
    if (p?.is_suspended) {
      // حساب موقوف من الإدارة — تسجيل خروج فوري
      await supabase.auth.signOut();
      setProfile(null);
      return;
    }
    setProfile(p);
    // احفظ آخر نسخة ناجحة — احتياطي لبوابة إكمال البيانات.
    void cacheProfile(p);
    registerPushToken(userId);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id ?? null);
      if (mounted) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      if (s?.user.id !== userIdRef.current) await loadProfile(s?.user.id ?? null);
      setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async (): Promise<boolean> => {
    if (!userIdRef.current) return false;
    const { profile: p, error } = await fetchMyProfileResult(userIdRef.current);
    setProfileError(error);
    if (error) return false;
    setProfile(p);
    void cacheProfile(p);
    return true;
  }, []);

  // نبض الحضور: تحديث آخر ظهور دوريًا أثناء استخدام التطبيق
  useEffect(() => {
    if (!profile?.id) return;
    const uid = profile.id;
    const beat = () => {
      supabase
        .from('profiles')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', uid)
        .then(() => {});
    };
    beat();
    const iv = setInterval(beat, 45000);
    return () => clearInterval(iv);
  }, [profile?.id]);

  const signOut = useCallback(async () => {
    if (userIdRef.current) await unregisterPushToken(userIdRef.current);
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    void cacheProfile(null);
  }, []);

  return (
    <Ctx.Provider
      value={{ session, profile, loading, profileError, refreshProfile, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
