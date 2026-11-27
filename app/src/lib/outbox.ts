// DARKLINK — قائمة انتظار الرسائل غير المرسلة (v1.6.0)
// لما النت يقطع، الرسالة بتتحفظ محليًا (AsyncStorage) فبتفضل حتى بعد
// إغلاق التطبيق، وبتتبعت تلقائيًا بنفس الترتيب لما النت يرجع —
// من غير تكرار (كل رسالة ليها معرّف محلي فريد). الوسائط بتترفع من
// الملف المحلي لما النت يرجع، فالرسالة مش بتضيع.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Message } from './types';
import {
  sendMediaMessage,
  sendTextMessage,
  sendVoiceMessage,
  uploadChatFile,
} from '../services/chat';

const OUTBOX_KEY = 'darklink:outbox:v1';
const MAX_ATTEMPTS = 3;

export type OutboxItemType = 'text' | 'image' | 'video' | 'voice';

export interface OutboxItem {
  localId: string;
  conversationId: string;
  senderId: string;
  type: OutboxItemType;
  body?: string | null;
  /** مسار الملف المحلي (للوسائط والفويس) — يُرفع لما النت يرجع */
  localUri?: string | null;
  ext?: string;
  contentType?: string;
  bucket?: 'chat-media' | 'voice-notes';
  durationSec?: number;
  replyToId?: string | null;
  createdAt: number;
  attempts: number;
}

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function loadOutbox(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as OutboxItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function saveOutbox(items: OutboxItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    // التخزين المحلي غير متاح — الرسالة هتضيع لو اتقفل التطبيق
  }
}

export async function enqueueOutbox(
  item: Omit<OutboxItem, 'localId' | 'createdAt' | 'attempts'>,
): Promise<OutboxItem> {
  const full: OutboxItem = {
    ...item,
    localId: newLocalId(),
    createdAt: Date.now(),
    attempts: 0,
  };
  const items = await loadOutbox();
  items.push(full);
  await saveOutbox(items);
  return full;
}

export async function removeOutbox(localId: string): Promise<void> {
  const items = await loadOutbox();
  await saveOutbox(items.filter((i) => i.localId !== localId));
}

export async function loadOutboxFor(
  conversationId: string,
): Promise<OutboxItem[]> {
  const items = await loadOutbox();
  return items
    .filter((i) => i.conversationId === conversationId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- إشعار الشاشات المفتوحة بنجاح الإرسال ----------

type OutboxSentListener = (msg: Message, localId: string) => void;
const listeners = new Set<OutboxSentListener>();

export function onOutboxSent(fn: OutboxSentListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ---------- إرسال عنصر واحد ----------

async function sendOutboxItem(item: OutboxItem): Promise<Message | null> {
  switch (item.type) {
    case 'text':
      return sendTextMessage(
        item.conversationId,
        item.senderId,
        item.body ?? '',
        item.replyToId,
      );
    case 'image':
    case 'video': {
      if (!item.localUri || !item.bucket) return null;
      const path = await uploadChatFile(
        item.bucket,
        item.conversationId,
        item.senderId,
        item.localUri,
        item.ext ?? 'jpg',
        item.contentType ?? 'image/jpeg',
      );
      if (!path) return null;
      return sendMediaMessage(
        item.conversationId,
        item.senderId,
        item.type,
        path,
        item.replyToId,
      );
    }
    case 'voice': {
      if (!item.localUri) return null;
      const path = await uploadChatFile(
        'voice-notes',
        item.conversationId,
        item.senderId,
        item.localUri,
        'm4a',
        'audio/mp4',
      );
      if (!path) return null;
      return sendVoiceMessage(
        item.conversationId,
        item.senderId,
        path,
        item.durationSec ?? 0,
        item.replyToId,
      );
    }
  }
}

let flushing = false;

/** يبعت كل عناصر القائمة بنفس الترتيب. عند أول فشل يوقف (عشان الترتيب
 *  يفضل)، وبعد 3 محاولات فاشلة للعنصر بيتشال عشان ميوقفش القائمة للأبد. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const items = (await loadOutbox()).sort((a, b) => a.createdAt - b.createdAt);
    for (const item of items) {
      let msg: Message | null = null;
      try {
        msg = await sendOutboxItem(item);
      } catch {
        msg = null;
      }
      if (!msg) {
        const next = item.attempts + 1;
        if (next >= MAX_ATTEMPTS) {
          await removeOutbox(item.localId);
          continue;
        }
        const all = await loadOutbox();
        await saveOutbox(
          all.map((i) => (i.localId === item.localId ? { ...i, attempts: next } : i)),
        );
        break;
      }
      await removeOutbox(item.localId);
      listeners.forEach((fn) => fn(msg as Message, item.localId));
    }
  } finally {
    flushing = false;
  }
}
