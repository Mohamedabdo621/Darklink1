// DARKLINK — قائمة انتظار الرسائل غير المرسلة (v1.6.0)
// لما النت يقطع، الرسالة بتتحفظ محليًا (AsyncStorage) فبتفضل حتى بعد
// إغلاق التطبيق، وبتتبعت تلقائيًا بنفس الترتيب لما النت يرجع —
// من غير تكرار (كل رسالة ليها معرّف محلي فريد). الوسائط بتترفع من
// الملف المحلي لما النت يرجع، فالرسالة مش بتضيع.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appAlert } from './dialog';
import type { Message } from './types';
import {
  clearChatSendError,
  deleteChatFile,
  getLastChatSendError,
  isRateLimitError,
  rateLimitMessage,
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

// ---------- إشعار فشل الإرسال النهائي / حد السرعة ----------

type OutboxFailedListener = (item: OutboxItem) => void;
const failedListeners = new Set<OutboxFailedListener>();

/** مستمع لما عنصر يستنفد محاولاته (3) — عشان شاشة الشات تعرض زر إعادة
 *  محاولة دائم جنب الرسالة المعلّقة (الحوار نفسه بيطلع من هنا برضه). */
export function onOutboxFailed(fn: OutboxFailedListener): () => void {
  failedListeners.add(fn);
  return () => {
    failedListeners.delete(fn);
  };
}

type OutboxRateLimitedListener = (item: OutboxItem) => void;
const rateLimitedListeners = new Set<OutboxRateLimitedListener>();

/** مستمع لما الإرسال يترفض من حد السرعة على السيرفر (20/دقيقة أو 300/يوم)
 *  — عشان شاشة الشات تقدر تعرض الرسالة العربية جوّه المحادثة نفسها. */
export function onOutboxRateLimited(fn: OutboxRateLimitedListener): () => void {
  rateLimitedListeners.add(fn);
  return () => {
    rateLimitedListeners.delete(fn);
  };
}

/** إعادة محاولة عنصر معلّق يدويًا (بتصفّر عداد المحاولات وبتبعت القائمة). */
export async function retryOutboxItem(localId: string): Promise<void> {
  const items = await loadOutbox();
  await saveOutbox(
    items.map((i) => (i.localId === localId ? { ...i, attempts: 0 } : i)),
  );
  rateLimitNotified = false;
  await flushOutbox();
}

function describeItem(item: OutboxItem): string {
  switch (item.type) {
    case 'text':
      return item.body ? `«${item.body.slice(0, 40)}»` : 'رسالة نصية';
    case 'image':
      return 'صورة';
    case 'video':
      return 'فيديو';
    case 'voice':
      return 'رسالة صوتية';
  }
}

/** عنصر استنفد 3 محاولات: بيفضل في القائمة (مش حذف صامت) والمستخدم
 *  بيتنبّه مع عرض إعادة المحاولة أو الحذف. */
function notifyFailed(item: OutboxItem): void {
  failedListeners.forEach((fn) => fn(item));
  appAlert('تعذّر إرسال رسالة', `الرسالة دي متحفظتش بعد 3 محاولات (${describeItem(item)}) — هتفضل محفوظة لحد ما تختار.`, [
    {
      text: 'إعادة المحاولة',
      onPress: () => void retryOutboxItem(item.localId),
    },
    {
      text: 'حذف الرسالة',
      style: 'destructive',
      onPress: () => void removeOutbox(item.localId),
    },
    { text: 'لاحقًا', style: 'cancel' },
  ]);
}

/** اتنبّهنا عن حد السرعة في الحلقة دي ولا لسه — بيتفك لما إرسال ينجح
 *  أو المستخدم يعيد المحاولة يدويًا، عشان التنبيه يطلع مرة لكل واقعة. */
let rateLimitNotified = false;

function notifyRateLimited(item: OutboxItem): void {
  rateLimitedListeners.forEach((fn) => fn(item));
  if (rateLimitNotified) return;
  rateLimitNotified = true;
  appAlert(
    'بتبعت بسرعة كبيرة',
    rateLimitMessage(getLastChatSendError()) ??
      'بتبعت بسرعة كبيرة — استنى شوية وحاول تاني',
    [
      {
        text: 'حاول تاني',
        onPress: () => void retryOutboxItem(item.localId),
      },
      { text: 'لاحقًا', style: 'cancel' },
    ],
  );
}

// ---------- إرسال عنصر واحد ----------

async function sendOutboxItem(item: OutboxItem): Promise<Message | null> {
  // صفّر خطأ الإرسال قبل المحاولة — عشان فشل الرفع (من غير إدخال)
  // ميتفسّرش غلط على إنه حد سرعة من محاولة سابقة.
  clearChatSendError();
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
      const msg = await sendMediaMessage(
        item.conversationId,
        item.senderId,
        item.type,
        path,
        item.replyToId,
      );
      // الرفع نجح بس الإدخال فشل — امسح الملف من التخزين (يتيم)،
      // والملف المحلي بيفضل في القائمة عشان إعادة المحاولة ترفعه تاني.
      if (!msg) await deleteChatFile(item.bucket, path);
      return msg;
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
      const msg = await sendVoiceMessage(
        item.conversationId,
        item.senderId,
        path,
        item.durationSec ?? 0,
        item.replyToId,
      );
      if (!msg) await deleteChatFile('voice-notes', path);
      return msg;
    }
  }
}

let flushing = false;

/** يبعت كل عناصر القائمة بنفس الترتيب. عند أول فشل (شبكة) يوقف (عشان
 *  الترتيب يفضل). العنصر اللي يستنفد 3 محاولات بيفضل في القائمة
 *  (مش حذف صامت) والمستخدم بيتنبّه مع عرض إعادة المحاولة — والعناصر
 *  اللي بعده بتكمل عشان القائمة متقفش للأبد. حد السرعة (20/دقيقة أو
 *  300/يوم) مش بيستهلك محاولة: الإرسال بيوقف والتنبيه بيطلع مرة. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const items = (await loadOutbox()).sort((a, b) => a.createdAt - b.createdAt);
    for (const item of items) {
      // مركون بعد استنفاد المحاولات — اتنبّه عنه قبل كده، مستني المستخدم
      if (item.attempts >= MAX_ATTEMPTS) continue;
      let msg: Message | null = null;
      try {
        msg = await sendOutboxItem(item);
      } catch {
        msg = null;
      }
      if (!msg) {
        // حد السرعة: مش فشل شبكة — لا محاولة بتتحسب ولا القائمة بتتقدم،
        // والرسالة بتفضل في مكانها لحد ما المستخدم يعيد المحاولة.
        if (isRateLimitError(getLastChatSendError())) {
          notifyRateLimited(item);
          break;
        }
        const next = item.attempts + 1;
        const all = await loadOutbox();
        if (next >= MAX_ATTEMPTS) {
          await saveOutbox(
            all.map((i) =>
              i.localId === item.localId ? { ...i, attempts: MAX_ATTEMPTS } : i,
            ),
          );
          notifyFailed(item);
          continue;
        }
        await saveOutbox(
          all.map((i) => (i.localId === item.localId ? { ...i, attempts: next } : i)),
        );
        break;
      }
      await removeOutbox(item.localId);
      rateLimitNotified = false;
      listeners.forEach((fn) => fn(msg as Message, item.localId));
    }
  } finally {
    flushing = false;
  }
}
