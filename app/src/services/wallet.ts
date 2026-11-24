import { supabase } from '../lib/supabase';
import type {
  AppNotification,
  GemPackage,
  Gift,
  GiftSend,
  Transaction,
  Wallet,
} from '../lib/types';

export async function fetchWallet(userId: string): Promise<Wallet | null> {
  const { data } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();
  return (data as Wallet) ?? null;
}

export async function fetchTransactions(
  userId: string,
  page: number,
): Promise<Transaction[]> {
  const PAGE = 30;
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1);
  if (error) return [];
  return (data ?? []) as Transaction[];
}

export async function fetchPackages(): Promise<GemPackage[]> {
  const { data } = await supabase
    .from('gem_packages')
    .select('*')
    .eq('active', true)
    .order('sort');
  return (data ?? []) as GemPackage[];
}

export async function fetchGiftsCatalog(): Promise<Gift[]> {
  const { data } = await supabase
    .from('gifts')
    .select('*')
    .eq('active', true)
    .order('sort');
  return (data ?? []) as Gift[];
}

/** شراء باقة — في وضع Sandbox يتحقق الخادم داخليًا ويسجل العملية */
export async function purchasePackage(
  pkg: GemPackage,
): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const receipt = `sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const { data, error } = await supabase.rpc('purchase_gems', {
    p_package_id: pkg.id,
    p_provider: 'sandbox',
    p_receipt: receipt,
  });
  if (error) return { ok: false, error: error.message };
  const res = data as { ok: boolean; balance: number };
  return { ok: res.ok, balance: res.balance };
}

export async function sendGift(
  receiverId: string,
  giftId: string,
): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const { data, error } = await supabase.rpc('send_gift', {
    p_receiver: receiverId,
    p_gift_id: giftId,
  });
  if (error) {
    if (error.message.includes('insufficient_balance'))
      return { ok: false, error: 'insufficient' };
    if (error.message.includes('blocked')) return { ok: false, error: 'blocked' };
    return { ok: false, error: error.message };
  }
  const res = data as { ok: boolean; balance: number };
  return { ok: res.ok, balance: res.balance };
}

export async function activateVip(): Promise<{
  ok: boolean;
  balance?: number;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('activate_vip');
  if (error) {
    if (error.message.includes('insufficient_balance'))
      return { ok: false, error: 'insufficient' };
    return { ok: false, error: error.message };
  }
  const res = data as { ok: boolean; balance: number };
  return { ok: res.ok, balance: res.balance };
}

export type GiftSendRow = GiftSend & { gift: { name_key: string; asset: string } | null };

export async function fetchSentGifts(userId: string): Promise<GiftSendRow[]> {
  const { data } = await supabase
    .from('gift_sends')
    .select('*, gift:gifts(name_key, asset)')
    .eq('sender_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []) as unknown as GiftSendRow[];
}

export async function fetchReceivedGiftsFull(userId: string): Promise<GiftSendRow[]> {
  const { data } = await supabase
    .from('gift_sends')
    .select('*, gift:gifts(name_key, asset)')
    .eq('receiver_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []) as unknown as GiftSendRow[];
}

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60);
  return (data ?? []) as AppNotification[];
}

export async function fetchUnreadNotifications(userId: string): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  return count ?? 0;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
}
