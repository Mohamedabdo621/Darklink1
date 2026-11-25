// DARKLINK — أنواع البيانات المشتركة (تطابق مخطط قاعدة البيانات)
export type IdentityMode = 'anonymous' | 'public';
export type Language = 'ar' | 'en';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  anonymous_alias: string;
  avatar_url: string | null;
  bio: string | null;
  identity_mode: IdentityMode;
  discoverable: boolean;
  share_photo: boolean;
  share_info: boolean;
  show_last_seen: boolean;
  interests: string[];
  last_seen_at: string | null;
  is_vip: boolean;
  vip_until: string | null;
  language: Language;
  created_at: string;
  updated_at: string;
}

/** ما يراه الآخرون فقط — لا يحتوي أي بيانات حقيقية للحسابات المجهولة */
export interface PublicProfile {
  id: string;
  shown_name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  identity_mode: IdentityMode;
  is_vip: boolean;
  interests?: string[];
  last_seen_at?: string | null;
  created_at: string;
}

export interface Wallet {
  user_id: string;
  balance: number;
  updated_at: string;
}

export type TransactionType =
  | 'purchase' | 'gift_sent' | 'gift_received' | 'bonus' | 'refund' | 'vip';

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: TransactionType;
  status: 'pending' | 'completed' | 'sandbox_verified' | 'failed' | 'refunded';
  reference_id: string | null;
  created_at: string;
}

export interface GemPackage {
  id: string;
  name_key: string;
  gems: number;
  price_egp: number;
  play_product_id: string | null;
  active: boolean;
  sort: number;
}

export interface Gift {
  id: string;
  name_key: string;
  asset: string;
  price_gems: number;
  active: boolean;
  sort: number;
}

export interface GiftSend {
  id: string;
  sender_id: string;
  receiver_id: string;
  gift_id: string;
  price_gems: number;
  conversation_id: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string;
  created_at: string;
  hidden_for: string[];
}

export type MessageType = 'text' | 'image' | 'video' | 'file' | 'voice' | 'gift';

/** معاينة مختصرة للرسالة الأصلية عند الرد عليها (اقتباس) */
export interface ReplyPreview {
  id: string;
  sender_id: string;
  type: MessageType;
  body: string | null;
  is_deleted: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  type: MessageType;
  body: string | null;
  media_path: string | null;
  voice_duration: number | null;
  gift_send_id: string | null;
  is_deleted: boolean;
  read_at: string | null;
  reply_to_id: string | null;
  created_at: string;
  /** تُملأ من العميل بعد الجلب — ليست عمودًا في القاعدة */
  reply_preview?: ReplyPreview | null;
}

export type NotificationType =
  | 'new_message' | 'voice_note' | 'gift_received' | 'purchase_success'
  | 'account' | 'security' | 'app_update';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

/** الاسم المعروض لأي مستخدم حسب وضع هويته وإعدادات المشاركة */
export function shownNameOf(p: Pick<Profile, 'identity_mode' | 'share_info' | 'display_name' | 'anonymous_alias'>): string {
  return p.identity_mode === 'public' && p.share_info && p.display_name
    ? p.display_name
    : p.anonymous_alias;
}
