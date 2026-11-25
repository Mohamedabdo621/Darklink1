import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';
import { fetchMyProfile } from '../services/profile';
import { registerPushToken, unregisterPushToken } from '../services/push';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string | null) => {
    userIdRef.current = userId;
    if (!userId) {
      setProfile(null);
      return;
    }
    const p = await fetchMyProfile(userId);
    if (p?.is_suspended) {
      // حساب موقوف من الإدارة — تسجيل خروج فوري
      await supabase.auth.signOut();
      setProfile(null);
      return;
    }
    setProfile(p);
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

  const refreshProfile = useCallback(async () => {
    if (userIdRef.current) setProfile(await fetchMyProfile(userIdRef.current));
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
  }, []);

  return (
    <Ctx.Provider value={{ session, profile, loading, refreshProfile, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
