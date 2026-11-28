import { supabase } from '../lib/supabase';
import type { PostReportRow, ReferralRow } from '../lib/types';

// ---------------- لوحة الإدارة (كل الدوال محمية خادميًا بـ is_admin) --------

export interface AdminStats {
  users_total: number;
  users_today: number;
  pending_orders: number;
  gems_sold_today: number;
  gifts_today: number;
  open_reports: number;
}

export async function fetchAdminStats(): Promise<AdminStats | null> {
  const { data, error } = await supabase.rpc('admin_stats');
  if (error || !data) return null;
  return data as AdminStats;
}

export interface PaymentOrder {
  id: string;
  user_id: string;
  gems: number;
  bonus_gems: number;
  amount_egp: number;
  method: 'vodafone' | 'etisalat';
  sender_phone: string;
  proof_path: string | null;
  code: string;
  status: string;
  reject_reason: string | null;
  created_at: string;
  user_name?: string;
  package_key?: string;
}

export async function fetchAdminOrders(
  status: 'pending' | 'approved' | 'rejected',
): Promise<PaymentOrder[]> {
  const { data, error } = await supabase.rpc('admin_list_orders', {
    p_status: status,
  });
  if (error || !data) return [];
  return data as PaymentOrder[];
}

export async function reviewPayment(
  orderId: string,
  approve: boolean,
  reason?: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_review_payment', {
    p_order: orderId,
    p_approve: approve,
    p_reason: reason ?? null,
  });
  if (error) return false;
  return (data as { ok?: boolean })?.ok !== false;
}

export interface AdminUser {
  id: string;
  shown_name: string;
  email: string;
  is_vip: boolean;
  is_suspended: boolean;
  created_at: string;
  balance: number;
}

export async function searchAdminUsers(q: string): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_search_users', { q });
  if (error || !data) return [];
  return data as AdminUser[];
}

export async function grantGems(userId: string, amount: number): Promise<boolean> {
  const { error } = await supabase.rpc('admin_grant_gems', {
    p_user: userId,
    p_amount: amount,
  });
  return !error;
}

export async function setSuspended(
  userId: string,
  suspended: boolean,
): Promise<boolean> {
  const { error } = await supabase.rpc('admin_set_suspended', {
    p_user: userId,
    p_suspended: suspended,
  });
  return !error;
}

export interface AdminReport {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  message_id: string | null;
  reason: string;
  status: string;
  created_at: string;
}

export async function fetchAdminReports(): Promise<AdminReport[]> {
  const { data, error } = await supabase.rpc('admin_list_reports');
  if (error || !data) return [];
  return data as AdminReport[];
}

export async function setReportStatus(
  reportId: string,
  status: 'reviewed' | 'actioned',
): Promise<boolean> {
  const { error } = await supabase.rpc('admin_set_report_status', {
    p_report: reportId,
    p_status: status,
  });
  return !error;
}

export async function fetchAdminConfig(): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('admin_get_config');
  if (error || !data) return {};
  return data as Record<string, string>;
}

export async function setAdminConfig(key: string, value: string): Promise<boolean> {
  const { error } = await supabase.rpc('admin_set_config', {
    p_key: key,
    p_value: value,
  });
  return !error;
}

export interface PromoCode {
  code: string;
  kind: 'gems' | 'vip_days';
  value: number;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  active: boolean;
  created_at: string;
}

export async function fetchAdminPromos(): Promise<PromoCode[]> {
  const { data, error } = await supabase.rpc('admin_list_promos');
  if (error || !data) return [];
  return data as PromoCode[];
}

export async function createPromo(
  code: string,
  kind: 'gems' | 'vip_days',
  value: number,
  maxUses: number,
): Promise<boolean> {
  const { error } = await supabase.rpc('admin_create_promo', {
    p_code: code,
    p_kind: kind,
    p_value: value,
    p_max_uses: maxUses,
    p_expires_at: null,
  });
  return !error;
}

export async function setPromoActive(code: string, active: boolean): Promise<boolean> {
  const { error } = await supabase.rpc('admin_set_promo_active', {
    p_code: code,
    p_active: active,
  });
  return !error;
}

export async function awardContest(): Promise<{
  ok: boolean;
  reason?: string;
  prize?: number;
  winner?: string;
}> {
  const { data, error } = await supabase.rpc('admin_award_contest');
  if (error || !data) return { ok: false, reason: 'error' };
  return data as { ok: boolean; reason?: string; prize?: number; winner?: string };
}

/** رابط موقع لصورة إثبات التحويل (للأدمن أو صاحب الطلب) */
export async function proofSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** مين دعا مين (للأدمن) */
export async function fetchAdminReferrals(): Promise<ReferralRow[]> {
  const { data, error } = await supabase.rpc('admin_list_referrals', {
    p_limit: 50,
  });
  if (error || !data) return [];
  return data as ReferralRow[];
}

/** بلاغات البوستات (للأدمن) */
export async function fetchAdminPostReports(): Promise<PostReportRow[]> {
  const { data, error } = await supabase.rpc('admin_list_post_reports', {
    p_limit: 50,
  });
  if (error || !data) return [];
  return data as PostReportRow[];
}

/** إحصاءات Darklink AI (للمشرف فقط — عبر RPC آمن) */
export interface AdminAiStats {
  total_messages: number;
  today_messages: number;
  users_count: number;
  conversations_count: number;
  errors_today: number;
  providers_today: { provider: string; requests: number; tokens: number }[];
}
export async function fetchAdminAiStats(): Promise<AdminAiStats | null> {
  const { data, error } = await supabase.rpc('admin_ai_stats');
  if (error || !data) return null;
  return data as AdminAiStats;
}

/** قاعدة معرفة الذكاء الاصطناعي (للمشرف فقط) */
export interface AiKbRow {
  id: string;
  topic: string;
  question: string;
  answer: string;
  keywords: string;
  lang: string;
  is_active: boolean;
  updated_at: string;
}
export async function fetchAdminAiKb(): Promise<AiKbRow[]> {
  const { data, error } = await supabase.rpc('admin_ai_kb_list');
  if (error || !data) return [];
  return data as AiKbRow[];
}
export async function upsertAdminAiKb(row: Omit<AiKbRow, 'updated_at'>): Promise<boolean> {
  const { error } = await supabase.rpc('admin_ai_kb_upsert', {
    p_id: row.id || null,
    p_topic: row.topic,
    p_question: row.question,
    p_answer: row.answer,
    p_keywords: row.keywords,
    p_lang: row.lang,
    p_is_active: row.is_active,
  });
  return !error;
}
export async function deleteAdminAiKb(id: string): Promise<boolean> {
  const { error } = await supabase.rpc('admin_ai_kb_delete', { p_id: id });
  return !error;
}
