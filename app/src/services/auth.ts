import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

// تأكيد البريد عندنا بلينك (مش كود): الخطة المجانية في Supabase لا تسمح
// بتعديل قوالب الإيميل مع المرسل الافتراضي، فاخترنا تدفق اللينك (قرار Alex 2026-11-24).
// اللينك يفتح التطبيق على darklink://auth-callback ونكمل الجلسة من هناك.
export type AuthResult =
  | { ok: true; needsConfirm: boolean }
  | { ok: false; errorKey: string };

export type AuthLinkIntent = 'signup' | 'recovery';
export type LinkResult =
  | { ok: true; intent: AuthLinkIntent }
  | { ok: false; errorKey: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isValidEmail = (e: string) => EMAIL_RE.test(e.trim());

const INTENT_KEY = 'darklink.authLinkIntent';

export const authCallbackUrl = () => Linking.createURL('auth-callback');

async function setIntent(intent: AuthLinkIntent): Promise<void> {
  try {
    await AsyncStorage.setItem(INTENT_KEY, intent);
  } catch {
    // التخزين اختياري هنا — أسوأ حالة نتعامل مع اللينك كتأكيد حساب
  }
}

async function getIntent(): Promise<AuthLinkIntent> {
  try {
    const v = await AsyncStorage.getItem(INTENT_KEY);
    return v === 'recovery' ? 'recovery' : 'signup';
  } catch {
    return 'signup';
  }
}

function mapError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'auth.invalidCredentials';
  if (m.includes('email not confirmed')) return 'auth.emailNotConfirmed';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'auth.emailInUse';
  if (m.includes('token') || m.includes('otp') || m.includes('code') || m.includes('expired'))
    return 'auth.invalidLink';
  return 'common.error';
}

/** إنشاء حساب ببريد + كلمة مرور — يبعت لينك تفعيل للبريد لو التأكيد مفعّل */
export async function signUp(email: string, password: string): Promise<AuthResult> {
  await setIntent('signup');
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: authCallbackUrl() },
  });
  if (error) return { ok: false, errorKey: mapError(error.message) };
  // جلسة فورية = تأكيد البريد غير مفعّل في المشروع؛ غير كده نستنى اللينك
  return { ok: true, needsConfirm: !data.session };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) return { ok: false, errorKey: mapError(error.message) };
  return { ok: true, needsConfirm: false };
}

/** إعادة إرسال لينك التفعيل */
export async function resendConfirmation(email: string): Promise<void> {
  await setIntent('signup');
  await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: authCallbackUrl() },
  });
}

/** طلب لينك استعادة كلمة المرور */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  await setIntent('recovery');
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: authCallbackUrl(),
  });
  if (error) return { ok: false, errorKey: mapError(error.message) };
  return { ok: true, needsConfirm: true };
}

export async function setNewPassword(password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, errorKey: mapError(error.message) };
  return { ok: true, needsConfirm: false };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

function parseUrlParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const collect = (s: string) => {
    for (const pair of s.split('&')) {
      if (!pair) continue;
      const i = pair.indexOf('=');
      const k = i >= 0 ? pair.slice(0, i) : pair;
      const v = i >= 0 ? pair.slice(i + 1) : '';
      try {
        out[decodeURIComponent(k)] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  };
  const q = url.split('?')[1]?.split('#')[0];
  if (q) collect(q);
  const h = url.split('#')[1];
  if (h) collect(h);
  return out;
}

/**
 * معالجة لينك الإيميل (تفعيل أو استعادة) بأي صورة يرجع بيها من Supabase:
 * PKCE (?code=) أو token_hash أو جلسة مباشرة في الـ hash.
 */
export async function handleAuthLink(url: string): Promise<LinkResult> {
  const params = parseUrlParams(url);
  if (params.error || params.error_description) {
    return { ok: false, errorKey: 'auth.invalidLink' };
  }
  const intent: AuthLinkIntent =
    params.type === 'recovery' || params.type === 'signup'
      ? (params.type as AuthLinkIntent)
      : await getIntent();
  try {
    if (params.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (error) throw error;
    } else if (params.token_hash && params.type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: params.token_hash,
        type: params.type as 'signup' | 'recovery',
      });
      if (error) throw error;
    } else if (params.access_token && params.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (error) throw error;
    } else {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return { ok: false, errorKey: 'auth.invalidLink' };
    }
  } catch (e) {
    return {
      ok: false,
      errorKey: mapError(e instanceof Error ? e.message : ''),
    };
  }
  return { ok: true, intent };
}
