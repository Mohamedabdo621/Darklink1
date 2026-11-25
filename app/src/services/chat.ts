import { supabase } from '../lib/supabase';
import type { Conversation, Message, ReplyPreview } from '../lib/types';

export async function getOrCreateConversation(otherId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    other: otherId,
  });
  if (error) return null;
  return data as string;
}

export async function fetchConversations(myId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false });
  if (error) return [];
  const all = (data ?? []) as Conversation[];
  // المحادثات المخفية عني لا تظهر في القائمة (تعود مع أي رسالة جديدة)
  return all.filter((c) => !(c.hidden_for ?? []).includes(myId));
}

/** إخفاء المحادثة من قائمتي فقط (حذف من القائمة — ليست حذفًا فعليًا) */
export async function hideConversation(conversationId: string): Promise<boolean> {
  const { error } = await supabase.rpc('hide_conversation', {
    p_conversation: conversationId,
  });
  return !error;
}

export async function fetchLastMessage(conversationId: string): Promise<Message | null> {
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Message) ?? null;
}

export async function fetchUnreadCount(
  conversationId: string,
  myId: string,
): Promise<number> {
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', myId)
    .is('read_at', null);
  return count ?? 0;
}

/** جلب معاينات الرسائل الأصلية لرسائل الرد (اقتباس) دفعة واحدة */
export async function fetchReplyPreviews(ids: string[]): Promise<Map<string, ReplyPreview>> {
  const map = new Map<string, ReplyPreview>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const { data } = await supabase
    .from('messages')
    .select('id, sender_id, type, body, is_deleted')
    .in('id', unique);
  for (const row of (data ?? []) as ReplyPreview[]) map.set(row.id, row);
  return map;
}

export async function fetchReplyPreview(id: string): Promise<ReplyPreview | null> {
  const map = await fetchReplyPreviews([id]);
  return map.get(id) ?? null;
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return [];
  const msgs = (data ?? []) as Message[];
  const previews = await fetchReplyPreviews(
    msgs.map((m) => m.reply_to_id).filter(Boolean) as string[],
  );
  for (const m of msgs) {
    if (m.reply_to_id) m.reply_preview = previews.get(m.reply_to_id) ?? null;
  }
  return msgs;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await supabase.rpc('mark_conversation_read', { p_conversation: conversationId });
}

async function insertMessage(
  conversationId: string,
  senderId: string,
  fields: Partial<Message>,
): Promise<Message | null> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, ...fields })
    .select()
    .single();
  if (error) return null;
  return data as Message;
}

export function sendTextMessage(
  conversationId: string,
  senderId: string,
  body: string,
  replyToId?: string | null,
) {
  return insertMessage(conversationId, senderId, {
    type: 'text',
    body: body.trim(),
    reply_to_id: replyToId ?? null,
  });
}

/** رفع ملف وسائط/صوت إلى bucket خاص بمسار {conversation}/{sender}/... */
export async function uploadChatFile(
  bucket: 'chat-media' | 'voice-notes',
  conversationId: string,
  senderId: string,
  localUri: string,
  ext: string,
  contentType: string,
): Promise<string | null> {
  const path = `${conversationId}/${senderId}/${Date.now()}.${ext}`;
  const res = await fetch(localUri);
  const blob = await res.blob();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType, upsert: false });
  if (error) return null;
  return path;
}

export function sendMediaMessage(
  conversationId: string,
  senderId: string,
  type: 'image' | 'video',
  mediaPath: string,
  replyToId?: string | null,
) {
  return insertMessage(conversationId, senderId, {
    type,
    media_path: mediaPath,
    reply_to_id: replyToId ?? null,
  });
}

export function sendVoiceMessage(
  conversationId: string,
  senderId: string,
  mediaPath: string,
  durationSec: number,
  replyToId?: string | null,
) {
  return insertMessage(conversationId, senderId, {
    type: 'voice',
    media_path: mediaPath,
    voice_duration: durationSec,
    reply_to_id: replyToId ?? null,
  });
}

export async function softDeleteMessage(messageId: string): Promise<boolean> {
  const { error } = await supabase
    .from('messages')
    .update({ is_deleted: true, body: null, media_path: null })
    .eq('id', messageId);
  return !error;
}

const mediaCache = new Map<string, { url: string; at: number }>();

/** رابط موقّع لعرض وسائط محادثة أو رسالة صوتية */
export async function mediaSignedUrl(
  bucket: 'chat-media' | 'voice-notes',
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const key = `${bucket}:${path}`;
  const hit = mediaCache.get(key);
  if (hit && Date.now() - hit.at < 50 * 60 * 1000) return hit.url;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  mediaCache.set(key, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}
