import { supabase } from '../lib/supabase';
import type { PublicProfile } from '../lib/types';

export interface ReceivedGiftSummary {
  name_key: string;
  asset: string;
  price_gems: number;
  total: number;
}

const PAGE = 20;

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

/** ملف آمن لمستخدم واحد عبر RPC — يعمل بالمعرف حتى لو غير قابل للاكتشاف */
export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc('get_public_profile', { target: userId });
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
