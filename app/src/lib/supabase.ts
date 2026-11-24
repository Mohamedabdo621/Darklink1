import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

// تُملأ القيم من متغيرات البيئة EXPO_PUBLIC_* أو من app.json > extra
// المفتاح هنا هو anon key العام فقط — مفاتيح الخدمة لا تدخل التطبيق أبدًا.
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? '';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? '';

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

// طبقة تخزين آمنة: لو فشل AsyncStorage لأي سبب على الجهاز، نرجع لذاكرة
// مؤقتة بدل ما تفشل كل عمليات المصادقة بصمت قبل ما توصل للشبكة أصلًا.
const memoryStore = new Map<string, string>();
const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const v = await AsyncStorage.getItem(key);
      return v ?? memoryStore.get(key) ?? null;
    } catch {
      return memoryStore.get(key) ?? null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    memoryStore.set(key, value);
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // النسخة في الذاكرة تكفي لعمر الجلسة
    }
  },
  removeItem: async (key: string): Promise<void> => {
    memoryStore.delete(key);
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // تجاهل
    }
  },
};

/** القيم كما يراها التطبيق فعليًا وقت التشغيل — لشاشة الفحص */
export const resolvedConfig = {
  url: supabaseUrl,
  keyPrefix: supabaseAnonKey.slice(0, 14),
  keyLen: supabaseAnonKey.length,
};

/**
 * فحص اتصال خام (بدون supabase-js): يطبع القيم الفعلية ونتائج طلبات حقيقية
 * عشان نعرف المشكلة في الإعدادات ولا الشبكة ولا طبقة العميل.
 */
export async function runConnectionDiagnostic(): Promise<string> {
  const lines: string[] = [];
  lines.push(`URL: ${supabaseUrl}`);
  lines.push(`KEY: ${supabaseAnonKey.slice(0, 14)}... len=${supabaseAnonKey.length}`);
  const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    lines.push(`IP: ${r.status} ${(await r.text()).slice(0, 80)}`);
  } catch (e) {
    lines.push(`IP: THREW ${errText(e)}`);
  }
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: supabaseAnonKey },
    });
    lines.push(`HEALTH: ${r.status} ${(await r.text()).slice(0, 120)}`);
  } catch (e) {
    lines.push(`HEALTH: THREW ${errText(e)}`);
  }
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'diag@darklink.app', password: 'DiagPass123!' }),
    });
    lines.push(`LOGIN-TEST: ${r.status} ${(await r.text()).slice(0, 160)}`);
  } catch (e) {
    lines.push(`LOGIN-TEST: THREW ${errText(e)}`);
  }
  return lines.join('\n');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
