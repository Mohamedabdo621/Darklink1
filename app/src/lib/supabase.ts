import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

// القيم تأتي من app.json > extra فقط — لا نقرأ process.env.EXPO_PUBLIC_* هنا:
// متغيرات بيئة على مشروع EAS تسربت مرة بقيم مشروع Supabase آخر وطغت على
// الإعدادات الصحيحة داخل الحزمة (حادثة 2026-11-24)، فأُلغي هذا المسار نهائيًا.
// المفتاح هنا هو مفتاح publishable العام فقط — مفاتيح الخدمة لا تدخل التطبيق أبدًا.
const supabaseUrl = extra.supabaseUrl ?? '';
const supabaseAnonKey = extra.supabaseAnonKey ?? '';

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: safeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
