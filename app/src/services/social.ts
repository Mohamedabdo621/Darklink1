import { supabase } from '../lib/supabase';
import type { PublicProfile } from '../lib/types';

export interface ReceivedGiftSummary {
  name_key: string;
  asset: string;
  price_gems: number;
  total: number;
}

const PAGE = 20;

/** الكود العام للحساب: حروف-أرقام (A-1، B-27، AB-3…) — غير حساس لحالة الأحرف */
export const PUBLIC_CODE_RE = /^[A-Za-z]+-\d+$/;

export function isPublicCode(v: string): boolean {
  return PUBLIC_CODE_RE.test(v.trim());
}

/** صفحة من نتائج الاكتشاف — تأتي من View آمنة لا تعرض بيانات حقيقية */
export async function fetchDiscover(
  page: number,
  search: string,
  interest?: string | null,
): Promise<PublicProfile[]> {
  let q = supabase
    .from('discover_profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  const s = search.trim();
  if (s) q = q.or(`shown_name.ilike.%${s}%,username.ilike.%${s}%`);
  if (interest) q = q.contains('interests', [interest]);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as PublicProfile[];
}

/** ملف آمن لمستخدم واحد عبر RPC — يعمل بالمعرف حتى لو غير قابل للاكتشاف.
 *  يقبل الـ UUID أو الكود العام (A-1…) — الكود بيتطبيع لحروف كبيرة. */
export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const key = userId.trim();
  if (isPublicCode(key)) {
    const { data, error } = await supabase.rpc('get_public_profile_by_code', {
      p_code: key.toUpperCase(),
    });
    if (error || !data) return null;
    return data as PublicProfile;
  }
  const { data, error } = await supabase.rpc('get_public_profile', { target: key });
  if (error || !data) return null;
  return data as PublicProfile;
}

export async function fetchReceivedGifts(userId: string): Promise<ReceivedGiftSummary[]> {
  const { data, error } = await supabase.rpc('get_received_gifts', { target: userId });
  if (error) return [];
  return (data ?? []) as ReceivedGiftSummary[];
}

export async function blockUser(myId: string, otherId: string): Promise<boolean> {
  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_id: myId, blocked_id: otherId });
  return !error;
}

export async function unblockUser(myId: string, otherId: string): Promise<boolean> {
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', myId)
    .eq('blocked_id', otherId);
  return !error;
}

export async function isBlockedByMe(myId: string, otherId: string): Promise<boolean> {
  const { data } = await supabase
    .from('blocks')
    .select('blocker_id')
    .eq('blocker_id', myId)
    .eq('blocked_id', otherId)
    .maybeSingle();
  return !!data;
}

export async function fetchBlockedUsers(myId: string): Promise<string[]> {
  const { data } = await supabase
    .from('blocks')
    .select('blocked_id')
    .eq('blocker_id', myId);
  return (data ?? []).map((r) => r.blocked_id as string);
}

export async function reportUser(
  reporterId: string,
  reportedUserId: string,
  reason: string,
  messageId?: string,
): Promise<boolean> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    reason,
    message_id: messageId ?? null,
  });
  return !error;
}
