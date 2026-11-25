import { supabase } from '../lib/supabase';
import type { PaymentOrder } from './admin';

// ---------------- الدفع اليدوي (جانب المستخدم) ----------------

export interface CreateOrderResult {
  order_id: string;
  code: string;
  pay_to: string;
  amount_egp: number;
  gems: number;
  bonus_gems: number;
}

export async function uploadProof(
  myId: string,
  localUri: string,
): Promise<string | null> {
  const path = `${myId}/${Date.now()}.jpg`;
  const res = await fetch(localUri);
  const blob = await res.blob();
  const { error } = await supabase.storage
    .from('payment-proofs')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  return error ? null : path;
}

export async function createPaymentOrder(
  packageId: string,
  method: 'vodafone' | 'etisalat',
  senderPhone: string,
  proofPath: string | null,
): Promise<{ ok: boolean; result?: CreateOrderResult; error?: string }> {
  const { data, error } = await supabase.rpc('create_payment_order', {
    p_package: packageId,
    p_method: method,
    p_sender_phone: senderPhone,
    p_proof_path: proofPath,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, result: data as CreateOrderResult };
}

export async function fetchMyOrders(myId: string): Promise<PaymentOrder[]> {
  const { data } = await supabase
    .from('payment_orders')
    .select('*')
    .eq('user_id', myId)
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []) as PaymentOrder[];
}

/** أرقام محافظ الشركة العامة للعرض قبل إنشاء الطلب (تُقرأ من إعدادات الأدمن عبر RPC آمنة؟) */
export async function fetchCashNumbers(): Promise<{
  vodafone: string;
  etisalat: string;
  bonusPct: number;
}> {
  // app_config بلا وصول عميل — نستخدم جدول الطلبات؟ البديل: دالة عامة صغيرة
  const { data } = await supabase.rpc('public_cash_info');
  const d = (data ?? {}) as {
    vodafone?: string;
    etisalat?: string;
    bonus_pct?: number;
  };
  return {
    vodafone: d.vodafone ?? '',
    etisalat: d.etisalat ?? '',
    bonusPct: d.bonus_pct ?? 0,
  };
}

// ---------------- تبادل الجواهر ----------------

export interface TransferQuote {
  fee_pct: number;
  fee: number;
  net: number;
  level: number;
}

export async function fetchTransferQuote(amount: number): Promise<TransferQuote | null> {
  const { data, error } = await supabase.rpc('transfer_quote', {
    p_amount: amount,
  });
  if (error || !data) return null;
  return data as TransferQuote;
}

export async function transferGems(
  toUser: string,
  amount: number,
): Promise<{ ok: boolean; fee?: number; net?: number; error?: string }> {
  const { data, error } = await supabase.rpc('transfer_gems', {
    p_to: toUser,
    p_amount: amount,
  });
  if (error) return { ok: false, error: error.message };
  const d = data as { fee: number; net: number };
  return { ok: true, fee: d.fee, net: d.net };
}

// ---------------- المستوى ----------------

export interface MyLevel {
  xp: number;
  level: number;
  next_at: number | null;
}

export async function fetchMyLevel(): Promise<MyLevel | null> {
  const { data, error } = await supabase.rpc('my_level');
  if (error || !data) return null;
  return data as MyLevel;
}

export async function fetchUserLevel(userId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('user_level_public', {
    p_user: userId,
  });
  if (error || data == null) return null;
  return data as number;
}

// ---------------- الدعوات ----------------

export async function fetchMyReferralCode(): Promise<string> {
  const { data } = await supabase.rpc('my_referral_code');
  return (data as string) ?? '';
}

export async function bindReferral(
  code: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase.rpc('bind_referral', { p_code: code });
  if (error) return { ok: false, reason: 'error' };
  return data as { ok: boolean; reason?: string };
}

export async function fetchMyReferralCount(myId: string): Promise<number> {
  const { count } = await supabase
    .from('referrals')
    .select('referred_id', { count: 'exact', head: true })
    .eq('referrer_id', myId);
  return count ?? 0;
}

// ---------------- المهام ----------------

export interface Quest {
  key: string;
  period: 'daily' | 'weekly';
  target: number;
  reward: number;
  progress: number;
  claimed: boolean;
}

export async function fetchQuests(): Promise<Quest[]> {
  const { data, error } = await supabase.rpc('quest_status');
  if (error || !data) return [];
  return data as Quest[];
}

export async function claimQuest(
  key: string,
): Promise<{ ok: boolean; amount?: number; reason?: string }> {
  const { data, error } = await supabase.rpc('claim_quest', { p_key: key });
  if (error) return { ok: false, reason: 'error' };
  return data as { ok: boolean; amount?: number; reason?: string };
}

// ---------------- البرومو ----------------

export async function redeemPromo(
  code: string,
): Promise<{ ok: boolean; kind?: string; value?: number; reason?: string }> {
  const { data, error } = await supabase.rpc('redeem_promo', { p_code: code });
  if (error) return { ok: false, reason: 'error' };
  return data as { ok: boolean; kind?: string; value?: number; reason?: string };
}

// ---------------- VIP متدرج ----------------

export async function activateVipTier(
  tier: 'silver' | 'gold',
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('activate_vip_tier', { p_tier: tier });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
