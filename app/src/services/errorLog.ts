// DARKLINK — سجل الأخطاء (error_logs)
// insert-only من العميل؛ أي فشل (الجدول لسه متعملش، مفيش نت، RLS)
// بيتبلع بصمت عشان تسجيل الخطأ نفسه ميكسرش التطبيق أبدًا.
// في تكرار لنفس الرسالة خلال 60 ثانية بيتسجّل مرة واحدة بس.
import { supabase } from '../lib/supabase';

export interface ErrorLogRow {
  id: string;
  user_id: string | null;
  message: string;
  stack: string | null;
  route: string | null;
  created_at: string;
}

const recent = new Map<string, number>();
const DEDUPE_MS = 60_000;

function messageOf(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack ?? null };
  }
  if (typeof error === 'string') return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

/** يسجّل خطأ في public.error_logs — نار وانسى، عمره ما يرمي استثناء. */
export async function logError(error: unknown, route?: string): Promise<void> {
  try {
    const { message, stack } = messageOf(error);
    if (!message) return;
    const key = `${route ?? ''}|${message.slice(0, 200)}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUPE_MS) return;
    recent.set(key, now);
    let userId: string | null = null;
    try {
      const { data } = await supabase.auth.getSession();
      userId = data.session?.user.id ?? null;
    } catch {
      userId = null;
    }
    await supabase.from('error_logs').insert({
      user_id: userId,
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 4000) ?? null,
      route: route ?? null,
    });
  } catch {
    // تسجيل الخطأ نفسه فشل — تجاهل تمامًا
  }
}

/** أحدث الأخطاء للوحة الأدمن (قراءة فقط) — [] لو الجدول مش موجود أو فشل الجلب. */
export async function fetchRecentErrors(limit = 50): Promise<ErrorLogRow[]> {
  try {
    const { data, error } = await supabase
      .from('error_logs')
      .select('id, user_id, message, stack, route, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as ErrorLogRow[];
  } catch {
    return [];
  }
}
