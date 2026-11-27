import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Animated, FlatList, Image, Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { appAlert, appPrompt } from '../../lib/dialog';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import VoiceBubble from '../../components/VoiceBubble';
import GiftAnimation from '../../components/GiftAnimation';
import { GlassIconButton, GlassIconChip } from '../../components/GlassIconButton';
import { Avatar } from '../../components/Avatar';
import { formatTimeAr } from '../../lib/format';
import { useAuth } from '../../contexts/AuthContext';
import { giftImage } from '../../lib/giftAssets';
import { supabase } from '../../lib/supabase';
import type { Message, PublicProfile, ReplyPreview } from '../../lib/types';
import {
  enqueueOutbox,
  flushOutbox,
  loadOutboxFor,
  onOutboxSent,
  type OutboxItem,
} from '../../lib/outbox';
import { clearDraft, loadDraft, saveDraft } from '../../lib/drafts';
import { EMOJI_QUICK, loadQuickEmoji, saveQuickEmoji } from '../../lib/quickEmoji';
import { loadDataSaver } from '../../lib/dataSaver';
import {
  editMessage,
  fetchMessages,
  fetchReactions,
  fetchReplyPreview,
  markConversationRead,
  mediaSignedUrl,
  REACTION_EMOJIS,
  sendMediaMessage,
  sendTextMessage,
  sendVoiceMessage,
  softDeleteMessage,
  toggleConversationFlag,
  toggleReaction,
  uploadChatFile,
} from '../../services/chat';
import { avatarSignedUrl } from '../../services/profile';
import {
  blockUser,
  fetchPublicProfile,
  isBlockedByMe,
  reportUser,
  unblockUser,
} from '../../services/social';
import { fonts, radius, spacing } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
interface GiftInfo {
  name_key: string;
  asset: string;
}

/** عتبات السحب المرنة للتسجيل الصوتي (واتساب: أي سحب واضح + إفلات = إلغاء/قفل،
 *  مش لازم توصل لمكان معين) */
const REC_CANCEL_DX = -28;
const REC_LOCK_DY = -28;
/** ضغطة أقصر من كده تتجاهل خالص (مش تسجيل — زي واتساب) */
const REC_TAP_MS = 150;

export default function ChatScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t, i18n } = useTranslation();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [otherAvatar, setOtherAvatar] = useState<string | null>(null);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [giftMap, setGiftMap] = useState<Record<string, GiftInfo>>({});
  const [animGift, setAnimGift] = useState<{ nameKey: string; title: string } | null>(null);
  const [text, setText] = useState('');
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const inputRef = useRef<any>(null);
  const swipeRefs = useRef(new Map<string, { close: () => void }>());
  const [reactions, setReactions] = useState<
    Record<string, { emoji: string; count: number; mine: boolean }[]>
  >({});
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [typing, setTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  // v1.6.0 — قائمة انتظار أوفلاين + مسودات + تحرير + قائمة الـ 3 نقط
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<OutboxItem[]>([]);
  const [muted, setMuted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const [dataSaver, setDataSaver] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [quickEmoji, setQuickEmoji] = useState('❤️');
  const [loadedIds, setLoadedIds] = useState<Record<string, boolean>>({});
  const textRef = useRef('');
  const draftLoadedRef = useRef(false);
  const channelRef = useRef<any>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  // ---- التسجيل الصوتي (ستايل واتساب: ضغط مطول، إفلات للإرسال،
  // سحب حر لليسار للإلغاء، سحب حر لأعلى للقفل — من غير هدف معين)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'locked'>('idle');
  const [recDrag, setRecDrag] = useState({ dx: 0, dy: 0 });
  /** جلسة التسجيل الحالية — بتمنع استدعاء record() المتأخر لو الإصبع
   *  اترفع بسرعة قبل ما التجهيز يخلص (فكانت بتسيب تسجيل شبح شغال) */
  const recSessionRef = useRef(0);
  const recPressAtRef = useRef(0);
  /** موضع الإصبع لحظة الضغط — منه بيتحسب السحب (pageX/pageY) */
  const recStartPosRef = useRef({ x: 0, y: 0 });

  const failSend = () => appAlert(t('common.error'), t('chat.blockedNotice'));

  /** يربط معاينة الرد بالرسالة المرسلة محليًا ويصفّي حالة الرد */
  const attachReply = (m: Message): Message => {
    if (!replyTo || m.reply_to_id !== replyTo.id) return m;
    return {
      ...m,
      reply_preview: {
        id: replyTo.id,
        sender_id: replyTo.sender_id,
        type: replyTo.type,
        body: replyTo.body,
        is_deleted: replyTo.is_deleted,
      },
    };
  };

  const startRecording = async () => {
    if (recorder.isRecording) return;
    // جلسة البدء دي — لو الإصبع اترفع قبل ما التجهيز يخلص، الإفلات
    // بيزوّد العداد فالسلسلة دي بتتوقف قبل ما تنادي record()
    const session = recSessionRef.current;
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      appAlert(t('common.error'), t('chat.micDenied'));
      return;
    }
    if (recSessionRef.current !== session) return;
    Keyboard.dismiss();
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    if (recSessionRef.current !== session) return;
    await recorder.prepareToRecordAsync();
    if (recSessionRef.current !== session) return;
    recorder.record();
    setPhase('recording');
  };

  /** إرسال فويس — أوفلاين بيتخزن في القائمة ويترفع لما النت يرجع */
  const sendRecording = async (uri: string, dur: number) => {
    if (!me || !conversationId) return;
    const replyId = replyTo?.id ?? null;
    if (!online) {
      const item = await enqueueOutbox({
        conversationId,
        senderId: me.id,
        type: 'voice',
        localUri: uri,
        bucket: 'voice-notes',
        durationSec: dur,
        replyToId: replyId,
      });
      setPending((prev) => [item, ...prev]);
      setReplyTo(null);
      return;
    }
    setSending(true);
    const path = await uploadChatFile(
      'voice-notes',
      conversationId,
      me.id,
      uri,
      'm4a',
      'audio/mp4',
    );
    if (path) {
      const m = await sendVoiceMessage(
        conversationId,
        me.id,
        path,
        dur,
        replyId,
      );
      if (m) {
        setMessages((prev) => [attachReply(m), ...prev]);
        setReplyTo(null);
      } else failSend();
    }
    setSending(false);
  };

  /** إيقاف التسجيل وإرسال الفويس فورًا (من غير معاينة) */
  const stopAndSendRecording = async () => {
    if (!recorder.isRecording) {
      setPhase('idle');
      setRecDrag({ dx: 0, dy: 0 });
      return;
    }
    try {
      await recorder.stop();
    } catch {
      // المسجل واقف أصلًا
    }
    const uri = recorder.uri;
    setPhase('idle');
    setRecDrag({ dx: 0, dy: 0 });
    if (!uri) return;
    const dur = Math.max(1, Math.round(recState.durationMillis / 1000));
    await sendRecording(uri, dur);
  };

  const cancelRecording = async () => {
    recSessionRef.current += 1;
    if (recorder.isRecording) {
      try {
        await recorder.stop();
      } catch {
        // المسجل واقف أصلًا
      }
    }
    setPhase('idle');
    setRecDrag({ dx: 0, dy: 0 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const lockRecording = () => {
    if (!recorder.isRecording) return;
    setRecDrag({ dx: 0, dy: 0 });
    setPhase('locked');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  /** مدة التسجيل الحالية بصيغة m:ss */
  const recSeconds = () => {
    const s = Math.floor(recState.durationMillis / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  /** أيقونة الإرسال (طيارة ورق) بتتعكس في العربي زي واتساب */
  const sendFlip: { transform: [{ scaleX: number }] } = {
    transform: [{ scaleX: i18n.language === 'ar' ? -1 : 1 }],
  };

  /** إيماءة التسجيل (نفس نظام PanResponder بس بخواص responder مباشرة على
   *  الزر — فالـ handlers بتوعها event handlers عادية: مسموح فيها قراءة
   *  الـ refs وDate.now. ضغطة مطولة بتبدأ، الشريط بيمشي مع الإصبع لحظيًا،
   *  والإفلات بعد أي سحب واضح لليسار بيلغي (من غير هدف معين) وبعد أي
   *  سحب واضح لفوق بيقفل، والإفلات العادي بيبعت. ضغطة أقصر من 150ms
   *  بتتجاهل خالص (مش فويس). شغالة على الموبايل والويب. */
  const recGrant = (e: GestureResponderEvent) => {
    // جلسة جديدة: أي سلسلة تجهيز قديمة لسه شغالة بتتوقف
    recSessionRef.current += 1;
    recPressAtRef.current = Date.now();
    recStartPosRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    // ضغطة والمايك بيسجّل أصلًا (التسجيل بدأ والإصبع اترفع بسرعة قبل
    // ما التجهيز يخلص) — وقّف وابعت اللي اتسجّل
    if (phase === 'recording') {
      void stopAndSendRecording();
      return;
    }
    setRecDrag({ dx: 0, dy: 0 });
    void startRecording();
  };
  const recMove = (e: GestureResponderEvent) => {
    setRecDrag({
      dx: Math.min(0, e.nativeEvent.pageX - recStartPosRef.current.x),
      dy: Math.min(0, e.nativeEvent.pageY - recStartPosRef.current.y),
    });
  };
  const recRelease = (e: GestureResponderEvent) => {
    // الإفلات بيلغي جلسة البدء — أي record() متأخر مش هيتنفذ
    recSessionRef.current += 1;
    // ضغطة سريعة (أقل من 150ms): مش تسجيل أصلًا — تجاهل من غير ما تبعت
    if (Date.now() - recPressAtRef.current < REC_TAP_MS) {
      void cancelRecording();
      return;
    }
    // سحب حر: أي سحب واضح لليسار + إفلات = إلغاء، من غير مكان معين
    const dx = Math.min(0, e.nativeEvent.pageX - recStartPosRef.current.x);
    const dy = Math.min(0, e.nativeEvent.pageY - recStartPosRef.current.y);
    if (dx <= REC_CANCEL_DX) {
      void cancelRecording();
      return;
    }
    // سحب حر: أي سحب واضح لفوق + إفلات = قفل حر
    if (dy <= REC_LOCK_DY) {
      lockRecording();
      return;
    }
    void stopAndSendRecording();
  };
  const recTerminate = () => {
    recSessionRef.current += 1;
    void cancelRecording();
  };
  const listRef = useRef<FlatList<Message | OutboxItem>>(null);

  const loadGiftInfo = useCallback(async (msgs: Message[]) => {
    const ids = msgs.map((m) => m.gift_send_id).filter(Boolean) as string[];
    if (!ids.length) return {};
    const { data } = await supabase
      .from('gift_sends')
      .select('id, gift:gifts(name_key, asset)')
      .in('id', ids);
    if (!data) return {};
    const map: Record<string, GiftInfo> = {};
    for (const row of data as unknown as {
      id: string;
      gift: GiftInfo | null;
    }[]) {
      if (row.gift) map[row.id] = row.gift;
    }
    setGiftMap((prev) => ({ ...prev, ...map }));
    return map;
  }, []);

  const load = useCallback(async () => {
    if (!conversationId || !me) return;
    const { data: conv } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();
    if (conv) {
      const oid = conv.user_a === me.id ? conv.user_b : conv.user_a;
      setOtherId(oid);
      const pub = await fetchPublicProfile(oid);
      setOther(pub);
      if (pub) setOtherAvatar(await avatarSignedUrl(pub.avatar_url));
      setBlockedByMe(await isBlockedByMe(me.id, oid));
      setMuted(((conv.muted_for ?? []) as string[]).includes(me.id));
    }
    const msgs = await fetchMessages(conversationId);
    setMessages(msgs);
    loadGiftInfo(msgs);
    setReactions(await fetchReactions(msgs.map((m) => m.id), me.id));
    await markConversationRead(conversationId);
  }, [conversationId, me, loadGiftInfo]);

  // v1.6.0 — استرجاع المسودة + الرسائل المعلقة + وضع توفير البيانات
  useEffect(() => {
    if (!conversationId || !me || draftLoadedRef.current) return;
    draftLoadedRef.current = true;
    (async () => {
      const d = await loadDraft(conversationId);
      if (d) {
        setText(d);
        textRef.current = d;
      }
      setPending(await loadOutboxFor(conversationId));
      setDataSaver(await loadDataSaver());
      setQuickEmoji(await loadQuickEmoji());
      // حاول إرسال المعلّق لما تفتح الشات وإنت متصل
      void flushOutbox();
    })();
  }, [conversationId, me]);

  // v1.6.0 — حفظ المسودة عند الخروج من الشات
  useEffect(() => {
    const cid = conversationId;
    return () => {
      if (cid && textRef.current.trim()) {
        void saveDraft(cid, textRef.current);
      }
      // لو خرج من الشات والتسجيل شغال (وضع القفل مثلًا)، وقّفه
      if (recorder.isRecording) {
        void recorder.stop().catch(() => {});
      }
    };
  }, [conversationId, recorder]);

  // v1.6.0 — تتبع الاتصال: لما النت يرجع، ابعت القائمة تلقائيًا
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected;
      setOnline(isOnline);
      if (isOnline) void flushOutbox();
    });
    return () => unsub();
  }, []);

  // هزة خفيفة عند دخول منطقة الإلغاء/القفل أثناء سحب التسجيل
  const prevRecZoneRef = useRef<'none' | 'cancel' | 'lock'>('none');
  useEffect(() => {
    const zone =
      recDrag.dx <= REC_CANCEL_DX ? 'cancel' : recDrag.dy <= REC_LOCK_DY ? 'lock' : 'none';
    if (zone !== prevRecZoneRef.current) {
      prevRecZoneRef.current = zone;
      if (zone !== 'none') Haptics.selectionAsync().catch(() => {});
    }
  }, [recDrag]);

  // v1.6.0 — لما عنصر معلّق يتبعت بنجاح، شيله من العرض
  // (الرسالة الحقيقية بتوصل من الاشتراك الفوري — بيتفادى التكرار بالـ id)
  useEffect(() => {
    const off = onOutboxSent((_msg, localId) => {
      setPending((prev) => prev.filter((p) => p.localId !== localId));
    });
    return off;
  }, []);

  useEffect(() => {
    // تحميل المحادثة عند الفتح (نمط جلب بيانات قياسي)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // تحديث دوري لآخر ظهور الطرف الآخر
  useEffect(() => {
    if (!otherId) return;
    const iv = setInterval(async () => {
      const pub = await fetchPublicProfile(otherId);
      if (pub) setOther(pub);
    }, 30000);
    return () => clearInterval(iv);
  }, [otherId]);

  // «متصل الآن» تُحسب في تأثير جانبي (آخر ظهور خلال ٩٠ ثانية)
  useEffect(() => {
    const calc = () =>
      setOtherOnline(
        other?.last_seen_at
          ? Date.now() - new Date(other.last_seen_at).getTime() < 90000
          : false,
      );
    calc();
    const iv = setInterval(calc, 30000);
    return () => clearInterval(iv);
  }, [other?.last_seen_at]);

  useEffect(() => {
    if (!conversationId || !me) return;
    // معرّف فريد لكل اشتراك: supabase.channel() بيرجع نفس القناة لو الاسم
    // متسجّل ولسه مشترك، وإضافة postgres_changes بعد الاشتراك بتضرب خطأ
    // «cannot add postgres_changes callbacks ... after subscribe()».
    // اسم جديد في كل مرة يخلي إعادة التشغيل أو إعادة فتح الشات آمنة.
    const suffix = Math.random().toString(36).slice(2, 8);
    const channel = supabase
      .channel(`chat-${conversationId}-${suffix}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.from && payload.from !== me.id) {
          setTyping(true);
          if (typingTimeout.current) clearTimeout(typingTimeout.current);
          typingTimeout.current = setTimeout(() => setTyping(false), 3200);
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Message;
          setMessages((prev) => {
            if (payload.eventType === 'INSERT') {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [row, ...prev];
            }
            return prev.map((m) => (m.id === row.id ? (payload.new as Message) : m));
          });
          if (payload.eventType === 'INSERT') {
            // هدية جديدة من الطرف الآخر وهو فاتح الشات: شغّل الأنيميشن فوراً
            loadGiftInfo([row]).then((map) => {
              if (row.type === 'gift' && row.sender_id !== me.id && row.gift_send_id) {
                const info = map[row.gift_send_id];
                if (info) {
                  setAnimGift({ nameKey: info.name_key, title: t('giftAnimation.received') });
                }
              }
            });
            if (row.sender_id !== me.id) markConversationRead(conversationId);
            if (row.reply_to_id) {
              fetchReplyPreview(row.reply_to_id).then((p) => {
                if (p) {
                  setMessages((prev) =>
                    prev.map((x) => (x.id === row.id ? { ...x, reply_preview: p } : x)),
                  );
                }
              });
            }
          }
        },
      )
      .subscribe();
    channelRef.current = channel;
    const rChannel = supabase
      .channel(`reactions-${conversationId}-${suffix}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        async (payload) => {
          const row = (payload.new ?? payload.old) as { message_id?: string };
          if (!row?.message_id) return;
          const fresh = await fetchReactions([row.message_id], me.id);
          setReactions((prev) => ({ ...prev, ...fresh }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(rChannel);
      channelRef.current = null;
    };
  }, [conversationId, me, loadGiftInfo, t]);

  if (!me || !conversationId) return <View style={styles.root} />;

  /** نص مختصر لأي رسالة — بيُستخدم في الاقتباس وشريط الرد */
  const snippetFor = (m: ReplyPreview | Message): string => {
    if (m.is_deleted) return t('chats.deleted');
    switch (m.type) {
      case 'voice':
        return t('chats.voiceNote');
      case 'image':
        return t('chats.photo');
      case 'video':
        return t('chats.video');
      case 'gift':
        return t('chats.gift');
      default:
        return m.body ?? '';
    }
  };

  const nameFor = (senderId: string): string =>
    senderId === me.id ? t('chat.youName') : (other?.shown_name ?? '');

  /** كتابة: تحديث النص + حفظ مسودة + بث «بيكتب» مثبّتًا كل ٢.٥ ثانية */
  const onType = (v: string) => {
    setText(v);
    textRef.current = v;
    // مسودة: احفظ النص لو المستخدم طلع من الشات من غير ما يبعت
    if (conversationId) void saveDraft(conversationId, v);
    if (v.trim() && Date.now() - lastTypingSent.current > 2500) {
      lastTypingSent.current = Date.now();
      channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { from: me.id },
      });
    }
  };

  /** تحرير رسالة: النص يروح للمسودة والتحرير يتلغي */
  const onTypeEdit = (v: string) => {
    setEditText(v);
  };

  const onReact = async (m: Message, emoji: string) => {
    const myCurrent = reactions[m.id]?.find((r) => r.mine)?.emoji ?? null;
    // تحديث متفائل
    setReactions((prev) => {
      const cur = (prev[m.id] ?? []).map((r) => ({ ...r }));
      const mineIdx = cur.findIndex((r) => r.mine);
      if (mineIdx >= 0) {
        cur[mineIdx].count -= 1;
        if (cur[mineIdx].count <= 0) cur.splice(mineIdx, 1);
      }
      if (myCurrent !== emoji) {
        const ex = cur.find((r) => r.emoji === emoji);
        if (ex) {
          ex.count += 1;
          ex.mine = true;
        } else cur.push({ emoji, count: 1, mine: true });
      }
      return { ...prev, [m.id]: cur };
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const ok = await toggleReaction(m.id, me.id, emoji, myCurrent);
    if (!ok) {
      const fresh = await fetchReactions([m.id], me.id);
      setReactions((prev) => ({ ...prev, ...fresh }));
    }
  };

  const startReply = (m: Message) => {
    if (m.is_deleted) return;
    setReplyTo(m);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  /** إرسال نص — clearComposer بيمسح صندوق الكتابة والمسودة (إرسال عادي)،
   *  ولو false بيسيب اللي مكتوب زي ما هو (إيموجي سريع) */
  const sendTextBody = async (body: string, clearComposer: boolean) => {
    if (!body.trim() || sending) return;
    const replyId = replyTo?.id ?? null;
    if (clearComposer) {
      setText('');
      textRef.current = '';
    }
    setSending(true);
    // أوفلاين: احفظها في القائمة وهتتبعت تلقائي لما النت يرجع
    if (!online) {
      const item = await enqueueOutbox({
        conversationId,
        senderId: me.id,
        type: 'text',
        body,
        replyToId: replyId,
      });
      setPending((prev) => [item, ...prev]);
      setReplyTo(null);
      setSending(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return;
    }
    const m = await sendTextMessage(conversationId, me.id, body, replyId);
    setSending(false);
    if (!m) {
      // فشل رغم الاتصال — حطها في القائمة وحاول تاني تلقائيًا
      const item = await enqueueOutbox({
        conversationId,
        senderId: me.id,
        type: 'text',
        body,
        replyToId: replyId,
      });
      setPending((prev) => [item, ...prev]);
      setReplyTo(null);
      return;
    }
    if (clearComposer) await clearDraft(conversationId);
    setReplyTo(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMessages((prev) =>
      prev.some((x) => x.id === m.id) ? prev : [attachReply(m), ...prev],
    );
  };

  const onSendText = () => {
    void sendTextBody(text, true);
  };

  /** إيموجي سريع: ضغطة واحدة بتبعته فورًا من غير ما تمسح اللي مكتوب */
  const sendQuickEmoji = (emoji: string) => {
    void sendTextBody(emoji, false);
  };

  /** ضغطة واحدة على زرار الإيموجي: بيبعت الإيموجي السريع فورًا
   *  (وأثناء التحرير بيفتح/يقفل الشريط زي الأول) */
  const onEmojiPress = () => {
    if (editing) {
      setEmojiOpen((v) => !v);
      return;
    }
    sendQuickEmoji(quickEmoji);
  };

  /** ضغطة مطوّلة على زرار الإيموجي: بيفتح شريط اختيار الإيموجي */
  const onEmojiLongPress = () => {
    setEmojiOpen(true);
  };

  /** اختيار إيموجي من الشريط: بيتبعت فورًا وبيبقى الإيموجي السريع الجديد
   *  (وأثناء التحرير بيتحط في نص التحرير زي الأول) */
  const onPickQuickEmoji = (e: string) => {
    if (editing) {
      onTypeEdit(editText + e);
      return;
    }
    setQuickEmoji(e);
    void saveQuickEmoji(e);
    setEmojiOpen(false);
    sendQuickEmoji(e);
  };

  /** بدء تحرير رسالة نصية خاصة بي (خلال 15 دقيقة من الإرسال) */
  const startEdit = (m: Message) => {
    if (m.type !== 'text' || m.is_deleted) return;
    const ageMs = Date.now() - new Date(m.created_at).getTime();
    if (ageMs > 15 * 60 * 1000) {
      appAlert(t('common.error'), t('chat.editExpired'));
      return;
    }
    setEditing(m);
    setEditText(m.body ?? '');
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const saveEdit = async () => {
    if (!editing || !editText.trim()) return;
    const target = editing;
    const body = editText.trim();
    setEditing(null);
    setEditText('');
    const ok = await editMessage(target.id, body);
    if (!ok) {
      appAlert(t('common.error'), t('common.error'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMessages((prev) =>
      prev.map((x) =>
        x.id === target.id
          ? { ...x, body, edited_at: new Date().toISOString() }
          : x,
      ),
    );
  };

  /** إرسال وسائط: أوفلاين بيتخزن في القائمة، ومتصل بيرفع على طول */
  const sendPickedMedia = async (asset: { uri: string }, isVideo: boolean) => {
    const replyId = replyTo?.id ?? null;
    if (!online) {
      const item = await enqueueOutbox({
        conversationId,
        senderId: me.id,
        type: isVideo ? 'video' : 'image',
        localUri: asset.uri,
        ext: isVideo ? 'mp4' : 'jpg',
        contentType: isVideo ? 'video/mp4' : 'image/jpeg',
        bucket: 'chat-media',
        replyToId: replyId,
      });
      setPending((prev) => [item, ...prev]);
      setReplyTo(null);
      return;
    }
    setSending(true);
    const path = await uploadChatFile(
      'chat-media',
      conversationId,
      me.id,
      asset.uri,
      isVideo ? 'mp4' : 'jpg',
      isVideo ? 'video/mp4' : 'image/jpeg',
    );
    if (path) {
      const m = await sendMediaMessage(
        conversationId,
        me.id,
        isVideo ? 'video' : 'image',
        path,
        replyId,
      );
      if (m) {
        setMessages((prev) => [attachReply(m), ...prev]);
        setReplyTo(null);
      } else failSend();
    }
    setSending(false);
  };

  const onAttach = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    await sendPickedMedia(asset, asset.type === 'video');
  };

  const onLongPress = (m: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActionMsg(m);
  };

  const sheetDelete = async (m: Message) => {
    setActionMsg(null);
    if (await softDeleteMessage(m.id)) {
      setMessages((prev) =>
        prev.map((x) =>
          x.id === m.id ? { ...x, is_deleted: true, body: null, media_path: null } : x,
        ),
      );
    }
  };

  const sheetReport = (m: Message) => {
    setActionMsg(null);
    appPrompt(
      t('userProfile.report'),
      t('userProfile.reportReason'),
      t('common.send'),
      async (reason) => {
        if (!reason?.trim()) return;
        if (await reportUser(me.id, m.sender_id, reason.trim(), m.id)) {
          appAlert('✓', t('userProfile.reportSent'));
        }
      },
    );
  };

  // ---------- قائمة الـ 3 نقط في الهيدر (5 عناصر — من غير عرض البروفايل:
  // الضغط على الصورة/الاسم بيفتح البروفايل أصلًا) ----------
  const onToggleMute = async () => {
    setMenuOpen(false);
    const next = !muted;
    setMuted(next);
    Haptics.selectionAsync().catch(() => {});
    const ok = await toggleConversationFlag(conversationId, 'muted_for');
    if (!ok) setMuted(!next);
  };

  const onBlockToggle = async () => {
    if (!otherId) return;
    setMenuOpen(false);
    if (blockedByMe) {
      if (await unblockUser(me.id, otherId)) {
        setBlockedByMe(false);
        appAlert('✓', t('chat.unblocked'));
      }
      return;
    }
    if (await blockUser(me.id, otherId)) {
      setBlockedByMe(true);
      appAlert(t('userProfile.blocked'));
    }
  };

  const onReportUser = () => {
    if (!otherId) return;
    setMenuOpen(false);
    appPrompt(
      t('userProfile.report'),
      t('userProfile.reportReason'),
      t('common.send'),
      async (reason) => {
        if (!reason?.trim()) return;
        if (await reportUser(me.id, otherId, reason.trim())) {
          appAlert('✓', t('userProfile.reportSent'));
        }
      },
    );
  };

  /** فاصل التاريخ: "اليوم" أو التاريخ — يظهر فوق أول رسالة في اليوم */
  const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const dayLabel = (iso: string) => {
    if (dayKey(iso) === dayKey(new Date().toISOString())) return t('chat.today');
    return new Date(iso).toLocaleDateString(
      i18n.language === 'ar' ? 'ar-EG' : 'en-GB',
      { day: 'numeric', month: 'long', year: 'numeric' },
    );
  };

  /** القائمة: المعلّقة (الأحدث) أولًا ثم الرسائل — المعلقة باينة بعلامة ساعة */
  const listData: (Message | OutboxItem)[] = [...pending, ...messages];

  return (
    <View style={styles.root}>
      {/* الترويسة — مسافة الأمان الحقيقية بتاعة الجهاز (مش رقم ثابت)،
          وخلفية الهيدر بتملى المساحة دي فمفيش فراغ فوقه */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}
          onPress={() =>
            otherId && router.push({ pathname: '/user/[id]', params: { id: otherId } })
          }>
          <Avatar uri={otherAvatar} name={other?.shown_name} size={38} />
          <View>
            <Text style={styles.headerName}>
              {other?.shown_name ?? '...'}
              {other?.is_vip ? ' 👑' : ''}
            </Text>
            {typing ? (
              <Text style={styles.statusTyping}>{t('chat.typing')}</Text>
            ) : other?.last_seen_at ? (
              otherOnline ? (
                <Text style={styles.statusOnline}>● {t('chat.online')}</Text>
              ) : (
                <Text style={styles.statusSeen}>
                  {`${t('chat.lastSeen')} ${formatTimeAr(other.last_seen_at)}`}
                </Text>
              )
            ) : null}
          </View>
        </TouchableOpacity>
        <GlassIconButton
          name="gift-outline"
          size={20}
          onPress={() =>
            otherId &&
            router.push({ pathname: '/gift-picker', params: { userId: otherId } })
          }
        />
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.menuBtn}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {/* الرسائل */}
      <FlatList
        ref={listRef}
        data={listData}
        inverted
        keyExtractor={(m) => ('localId' in m ? m.localId : m.id)}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item, index }) => {
          // رسالة معلّقة (أوفلاين) — فقاعة شفافة بعلامة ساعة
          if ('localId' in item) {
            return <PendingBubble item={item} />;
          }
          const mine = item.sender_id === me.id;
          // فاصل التاريخ فوق أول رسالة في اليوم (الأقدم في المجموعة)
          const next = listData[index + 1];
          const showDay =
            !next || 'localId' in next || dayKey(next.created_at) !== dayKey(item.created_at);
          // مسافة أصغر بين رسائل نفس الشخص المتتالية
          const nextMine =
            !!next && !('localId' in next) && next.sender_id === item.sender_id;
          const gap = nextMine ? 2 : 10;
          const bubble = (
            <MessageBubble
              m={item}
              mine={mine}
              gift={item.gift_send_id ? giftMap[item.gift_send_id] : undefined}
              replyName={item.reply_preview ? nameFor(item.reply_preview.sender_id) : undefined}
              replySnippet={item.reply_preview ? snippetFor(item.reply_preview) : undefined}
              reactions={reactions[item.id] ?? []}
              onReactPress={(emoji) => onReact(item, emoji)}
              onGiftPress={(g) =>
                setAnimGift({ nameKey: g.name_key, title: t('giftAnimation.replay') })
              }
              onMediaPress={(url, kind) =>
                router.push({
                  pathname: '/media-viewer',
                  params: { url, type: kind },
                })
              }
              onLongPress={() => onLongPress(item)}
              dataSaver={dataSaver}
              forceLoad={!!loadedIds[item.id]}
              onLoadMedia={() =>
                setLoadedIds((prev) => ({ ...prev, [item.id]: true }))
              }
            />
          );
          const pill = showDay ? (
            <View style={styles.datePill}>
              <Text style={styles.datePillText}>{dayLabel(item.created_at)}</Text>
            </View>
          ) : null;
          if (item.is_deleted) {
            return (
              <>
                {pill}
                <View
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '75%',
                    marginBottom: gap,
                  }}>
                  {bubble}
                </View>
              </>
            );
          }
          return (
            <>
              {pill}
              <Swipeable
                ref={(r) => {
                  if (r) swipeRefs.current.set(item.id, r);
                  else swipeRefs.current.delete(item.id);
                }}
                friction={2}
                leftThreshold={36}
                rightThreshold={36}
                overshootLeft={false}
                overshootRight={false}
                containerStyle={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '75%',
                  marginBottom: gap,
                }}
                renderLeftActions={() => (
                  <View style={styles.replyAction}>
                    <Text style={{ fontSize: 19 }}>↩</Text>
                  </View>
                )}
                renderRightActions={() => (
                  <View style={styles.replyAction}>
                    <Text style={{ fontSize: 19 }}>↪</Text>
                  </View>
                )}
                onSwipeableOpen={() => {
                  startReply(item);
                  swipeRefs.current.get(item.id)?.close();
                }}>
                {bubble}
              </Swipeable>
            </>
          );
        }}
      />

      {/* شريط الرد (اقتباس) */}
      {replyTo && phase === 'idle' && !blockedByMe ? (
        <View style={styles.replyBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.replyBarName}>
              {t('chat.replyingTo')} {nameFor(replyTo.sender_id)}
            </Text>
            <Text style={styles.replyBarText} numberOfLines={1}>
              {snippetFor(replyTo)}
            </Text>
          </View>
          <GlassIconButton name="close" size={15} circular onPress={() => setReplyTo(null)} />
        </View>
      ) : null}

      {/* منطقة الإدخال */}
      {blockedByMe ? (
        <View style={styles.blockedBar}>
          <Text style={{ color: colors.danger }}>{t('chat.blockedNotice')}</Text>
        </View>
      ) : phase === 'locked' ? (
        <View style={styles.composer}>
          <Ionicons name="lock-closed" size={18} color={colors.muted} />
          <Text style={{ color: colors.text, flex: 1 }}>
            {recSeconds()} — {t('chat.lockedHint')}
          </Text>
          <TouchableOpacity onPress={() => void cancelRecording()} hitSlop={8}>
            <Ionicons name="trash-outline" size={24} color={colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void stopAndSendRecording()}
            style={styles.sendBtn}>
            <Ionicons name="send" size={18} color={colors.white} style={sendFlip} />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {editing ? (
            <View style={styles.editBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <GlassIconChip name="pencil-outline" size={15} />
                <Text style={styles.editBarText}>{t('chat.editMessage')}</Text>
              </View>
              <GlassIconButton
                name="close"
                size={15}
                circular
                onPress={() => {
                  setEditing(null);
                  setEditText('');
                }}
              />
            </View>
          ) : null}
          {!online ? (
            <View style={styles.offlineBar}>
              <Ionicons name="cloud-offline-outline" size={15} color="#fdba74" />
              <Text style={styles.offlineBarText}>{t('chat.offlineNotice')}</Text>
            </View>
          ) : null}
          {emojiOpen ? (
            <View style={styles.emojiRowBar}>
              {EMOJI_QUICK.map((e) => (
                <TouchableOpacity key={e} onPress={() => onPickQuickEmoji(e)}>
                  <Text style={{ fontSize: 26 }}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <View style={styles.composer}>
            {/* أيقونة السلة بتظهر وتكبر كل ما السحب لليسار يقرّب من الإلغاء */}
            {phase === 'recording' && recDrag.dx < -10 ? (
              <View
                pointerEvents="none"
                style={[
                  styles.recCancelIcon,
                  {
                    opacity: Math.min(1, -recDrag.dx / -REC_CANCEL_DX),
                    transform: [
                      { scale: 1 + Math.min(1, -recDrag.dx / 60) * 0.3 },
                    ],
                  },
                ]}>
                <Ionicons name="trash-outline" size={26} color={colors.danger} />
              </View>
            ) : null}
            {/* أيقونة القفل بتتملي تدريجيًا كل ما السحب لفوق يقرّب من القفل */}
            {phase === 'recording' && recDrag.dy < -10 ? (
              <View
                pointerEvents="none"
                style={[
                  styles.recLockIcon,
                  {
                    opacity: Math.min(1, -recDrag.dy / -REC_LOCK_DY),
                    transform: [
                      { scale: 1 + Math.min(1, -recDrag.dy / 60) * 0.25 },
                    ],
                  },
                ]}>
                <Ionicons
                  name={-recDrag.dy > 40 ? 'lock-closed' : 'lock-open-outline'}
                  size={26}
                  color={colors.primaryBright}
                />
              </View>
            ) : null}
            <View style={styles.inputWrap}>
              {phase === 'recording' ? (
                <View
                  style={[
                    styles.recIndicator,
                    {
                      transform: [
                        { translateX: recDrag.dx },
                        { translateY: recDrag.dy },
                      ],
                    },
                  ]}>
                  <PulseDot />
                  <Text style={styles.recTimer}>{recSeconds()}</Text>
                  <Text
                    style={[
                      styles.recHint,
                      recDrag.dx <= REC_CANCEL_DX && { color: colors.danger },
                    ]}
                    numberOfLines={1}>
                    {recDrag.dx <= REC_CANCEL_DX
                      ? t('chat.releaseToCancel')
                      : recDrag.dy <= REC_LOCK_DY
                        ? t('chat.releaseToLock')
                        : t('chat.recHint')}
                  </Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity onPress={onEmojiPress} onLongPress={onEmojiLongPress}>
                    <Text style={{ fontSize: 22 }}>{quickEmoji}</Text>
                  </TouchableOpacity>
                  <TextInput
                    ref={inputRef}
                    value={editing ? editText : text}
                    onChangeText={editing ? onTypeEdit : onType}
                    placeholder={editing ? t('chat.editHint') : t('chat.typeMessage')}
                    placeholderTextColor={colors.faint}
                    style={styles.input}
                    multiline
                  />
                  <TouchableOpacity onPress={onAttach} hitSlop={6}>
                    <Ionicons name="attach" size={22} color={colors.muted} />
                  </TouchableOpacity>
                </>
              )}
            </View>
            {editing ? (
              <TouchableOpacity onPress={saveEdit} style={styles.sendBtn}>
                <Ionicons name="checkmark" size={20} color={colors.white} />
              </TouchableOpacity>
            ) : text.trim() ? (
              <TouchableOpacity onPress={onSendText} style={styles.sendBtn}>
                <Ionicons name="send" size={18} color={colors.white} style={sendFlip} />
              </TouchableOpacity>
            ) : (
              <View
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={recGrant}
                onResponderMove={recMove}
                onResponderRelease={recRelease}
                onResponderTerminate={recTerminate}
                style={{ padding: 4, margin: -4 }}>
                <View
                  style={[
                    styles.sendBtn,
                    phase === 'recording' && { transform: [{ scale: 1.1 }] },
                  ]}>
                  <Ionicons name="mic" size={22} color={colors.white} />
                </View>
              </View>
            )}
          </View>
        </>
      )}
      </KeyboardAvoidingView>

      {/* ورقة إجراءات الرسالة: تفاعلات + رد + حذف/إبلاغ */}
      <Modal
        transparent
        visible={!!actionMsg}
        animationType="fade"
        onRequestClose={() => setActionMsg(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setActionMsg(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            {actionMsg && !actionMsg.is_deleted ? (
              <View style={styles.emojiRow}>
                {REACTION_EMOJIS.map((e) => {
                  const active =
                    reactions[actionMsg.id]?.find((r) => r.mine)?.emoji === e;
                  return (
                    <TouchableOpacity
                      key={e}
                      style={[styles.emojiBtn, active && styles.emojiBtnActive]}
                      onPress={() => {
                        onReact(actionMsg, e);
                        setActionMsg(null);
                      }}>
                      <Text style={{ fontSize: 26 }}>{e}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
            {actionMsg && !actionMsg.is_deleted ? (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  startReply(actionMsg);
                  setActionMsg(null);
                }}>
                <GlassIconChip name="return-up-back-outline" />
                <Text style={styles.sheetRowText}>{t('chat.reply')}</Text>
              </TouchableOpacity>
            ) : null}
            {actionMsg && actionMsg.sender_id === me.id && !actionMsg.is_deleted ? (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setActionMsg(null);
                  startEdit(actionMsg);
                }}>
                <GlassIconChip name="pencil-outline" />
                <Text style={styles.sheetRowText}>{t('chat.editMessage')}</Text>
              </TouchableOpacity>
            ) : null}
            {actionMsg && actionMsg.sender_id === me.id && !actionMsg.is_deleted ? (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => sheetDelete(actionMsg)}>
                <GlassIconChip name="trash-outline" danger />
                <Text style={[styles.sheetRowText, { color: colors.danger }]}>
                  {t('chat.deleteMessage')}
                </Text>
              </TouchableOpacity>
            ) : null}
            {actionMsg && actionMsg.sender_id !== me.id ? (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => sheetReport(actionMsg)}>
                <GlassIconChip name="flag-outline" />
                <Text style={styles.sheetRowText}>{t('chat.reportMessage')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => setActionMsg(null)}>
              <Text style={[styles.sheetRowText, { color: colors.muted }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* قائمة الـ 3 نقط: الوسائط، الكتم، الهدية، الحظر، الإبلاغ */}
      <Modal
        transparent
        visible={menuOpen}
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setMenuOpen(false);
                router.push({
                  pathname: '/chat-media',
                  params: { conversationId },
                });
              }}>
              <GlassIconChip name="image-outline" />
              <Text style={styles.sheetRowText}>{t('chat.menuMedia')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={onToggleMute}>
              <GlassIconChip name={muted ? 'volume-high-outline' : 'volume-mute-outline'} />
              <Text style={styles.sheetRowText}>
                {muted ? t('chat.menuUnmute') : t('chat.menuMute')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setMenuOpen(false);
                if (otherId) {
                  router.push({
                    pathname: '/gift-picker',
                    params: { userId: otherId },
                  });
                }
              }}>
              <GlassIconChip name="gift-outline" />
              <Text style={styles.sheetRowText}>{t('chat.menuGift')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={onBlockToggle}>
              <GlassIconChip
                name={blockedByMe ? 'checkmark-outline' : 'ban-outline'}
                danger={!blockedByMe}
              />
              <Text style={[styles.sheetRowText, { color: colors.danger }]}>
                {blockedByMe ? t('chat.menuUnblock') : t('chat.menuBlock')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={onReportUser}>
              <GlassIconChip name="flag-outline" danger />
              <Text style={[styles.sheetRowText, { color: colors.danger }]}>
                {t('chat.menuReport')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => setMenuOpen(false)}>
              <Text style={[styles.sheetRowText, { color: colors.muted }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <GiftAnimation
        visible={!!animGift}
        giftNameKey={animGift?.nameKey ?? null}
        giftLabel={animGift ? t(`gifts.${animGift.nameKey}`) : undefined}
        title={animGift?.title}
        onClose={() => setAnimGift(null)}
      />
    </View>
  );
}

/** نقطة حمرا بتنبض أثناء التسجيل (ستايل واتساب) */
function PulseDot() {
  const { colors } = useTheme();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.danger,
        opacity,
      }}
    />
  );
}

function MessageBubble({
  m,
  mine,
  gift,
  replyName,
  replySnippet,
  reactions,
  onReactPress,
  onGiftPress,
  onMediaPress,
  onLongPress,
  dataSaver,
  forceLoad,
  onLoadMedia,
}: {
  m: Message;
  mine: boolean;
  gift?: GiftInfo;
  replyName?: string;
  replySnippet?: string;
  reactions: { emoji: string; count: number; mine: boolean }[];
  onReactPress: (emoji: string) => void;
  onGiftPress?: (gift: GiftInfo) => void;
  onMediaPress: (url: string, kind: 'image' | 'video') => void;
  onLongPress: () => void;
  /** توفير البيانات: الصورة متنزلش تلقائيًا لحد ما المستخدم يدوس عليها */
  dataSaver: boolean;
  /** المستخدم داس "تحميل" على الصورة دي */
  forceLoad: boolean;
  onLoadMedia: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // وضع توفير البيانات: متنزلش الصورة إلا لما المستخدم يدوس عليها
    if (dataSaver && m.type === 'image' && !forceLoad) {
      return () => {
        live = false;
      };
    }
    if ((m.type === 'image' || m.type === 'video') && m.media_path) {
      mediaSignedUrl('chat-media', m.media_path).then((u) => {
        if (live) setMediaUrl(u);
      });
    }
    return () => {
      live = false;
    };
  }, [m.type, m.media_path, dataSaver, forceLoad]);

  const time = formatTimeAr(m.created_at);

  return (
    <TouchableOpacity onLongPress={onLongPress} activeOpacity={0.85}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
        {!m.is_deleted && m.reply_to_id ? (
          <View style={styles.quote}>
            <Text style={styles.quoteName} numberOfLines={1}>
              {replyName ?? ''}
            </Text>
            <Text style={styles.quoteText} numberOfLines={1}>
              {replySnippet ?? ''}
            </Text>
          </View>
        ) : null}
        {m.is_deleted ? (
          <Text style={styles.deleted}>🚫 {t('chats.deleted')}</Text>
        ) : m.type === 'text' ? (
          <Text style={[styles.msgText, mine && { color: colors.white }]}>{m.body}</Text>
        ) : m.type === 'image' ? (
          dataSaver && !forceLoad ? (
            <TouchableOpacity onPress={onLoadMedia} style={styles.tapToLoad}>
              <Ionicons name="image-outline" size={30} color={colors.muted} />
              <Text style={styles.tapToLoadText}>↓ {t('chat.tapToLoad')}</Text>
            </TouchableOpacity>
          ) : mediaUrl ? (
            <TouchableOpacity onPress={() => onMediaPress(mediaUrl, 'image')}>
              <Image source={{ uri: mediaUrl }} style={styles.mediaImg} resizeMode="cover" />
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="image-outline" size={18} color={colors.muted} />
              <Text style={styles.msgText}>…</Text>
            </View>
          )
        ) : m.type === 'video' ? (
          <TouchableOpacity onPress={() => mediaUrl && onMediaPress(mediaUrl, 'video')}>
            <View style={[styles.mediaImg, styles.videoTile]}>
              <Ionicons name="play" size={40} color={colors.white} />
              <Text style={{ color: colors.white, fontSize: fonts.sizes.xs }}>
                {t('chats.video')}
              </Text>
            </View>
          </TouchableOpacity>
        ) : m.type === 'voice' ? (
          <VoiceBubble mediaPath={m.media_path} durationSec={m.voice_duration} mine={mine} />
        ) : m.type === 'gift' ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => gift && onGiftPress?.(gift)}>
            <View style={{ alignItems: 'center', gap: 4 }}>
              {gift && giftImage(gift.asset) ? (
                <Image source={giftImage(gift.asset)} style={styles.giftImg} />
              ) : (
                <Ionicons name="gift-outline" size={40} color={colors.accent} />
              )}
              <Text style={[styles.msgText, mine && { color: colors.white }]}>
                {gift ? t(`gifts.${gift.name_key}`) : t('chats.gift')}
              </Text>
            </View>
          </TouchableOpacity>
        ) : null}
        {reactions.length ? (
          <View style={styles.reactionRow}>
            {reactions.map((r) => (
              <TouchableOpacity
                key={r.emoji}
                style={[styles.reactionChip, r.mine && styles.reactionChipMine]}
                onPress={() => onReactPress(r.emoji)}>
                <Text style={{ fontSize: 12 }}>
                  {r.emoji}
                  {r.count > 1 ? ` ${r.count}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.7)' }]}>
          {time}
          {m.edited_at ? ` • ${t('chat.edited')}` : ''}
          {mine && !m.is_deleted ? (m.read_at ? ' ✓✓' : ' ✓') : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/** فقاعة رسالة معلّقة (أوفلاين): شفافة شوية، بعلامة ساعة، بتتبعت لما النت يرجع */
function PendingBubble({ item }: { item: OutboxItem }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const isMedia = item.type === 'image' || item.type === 'video';
  const label =
    item.type === 'text'
      ? item.body ?? ''
      : item.type === 'voice'
        ? t('chat.voiceNote')
        : t('chat.sending');
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '75%',
        marginBottom: 10,
        opacity: 0.65,
      }}>
      <View style={[styles.bubble, styles.bubbleMine]}>
        {isMedia ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="image-outline" size={16} color={colors.white} />
            <Text style={[styles.msgText, { color: colors.white }]}>{label}</Text>
          </View>
        ) : (
          <Text style={[styles.msgText, { color: colors.white }]}>{label}</Text>
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 3,
            marginTop: 3,
          }}>
          <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.7)" />
          <Text style={[styles.time, { color: 'rgba(255,255,255,0.7)', marginTop: 0 }]}>
            {t('chat.sending')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
    backgroundColor: colors.surface,
  },
  backBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerName: { color: colors.text, fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold },
  statusTyping: { color: colors.accent, fontSize: fonts.sizes.xs, marginTop: 1 },
  statusOnline: { color: '#4ade80', fontSize: fonts.sizes.xs, marginTop: 1 },
  statusSeen: { color: colors.faint, fontSize: fonts.sizes.xs, marginTop: 1 },
  reactionRow: { flexDirection: 'row', gap: 4, marginTop: 5, flexWrap: 'wrap' },
  reactionChip: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reactionChipMine: { borderColor: colors.accent, backgroundColor: 'rgba(217,70,239,0.18)' },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,0,8,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopStartRadius: 22,
    borderTopEndRadius: 22,
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    // على الشاشات العريضة الورقة بعرض محدود ومتمركزة بدل ما تملأ العرض كله
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
    marginBottom: spacing.xs,
  },
  emojiBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  emojiBtnActive: { borderWidth: 1.5, borderColor: colors.accent },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 13,
  },
  sheetRowText: { color: colors.text, fontSize: fonts.sizes.md, textAlign: 'left' },
  replyAction: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.stroke,
    borderStartWidth: 3,
    borderStartColor: colors.accent,
  },
  replyBarName: {
    color: colors.accent,
    fontSize: fonts.sizes.xs,
    fontWeight: fonts.weights.bold,
  },
  replyBarText: { color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 1 },
  quote: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderStartWidth: 3,
    borderStartColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginBottom: 5,
  },
  quoteName: {
    color: colors.accent,
    fontSize: fonts.sizes.xs,
    fontWeight: fonts.weights.bold,
  },
  quoteText: { color: colors.muted, fontSize: fonts.sizes.xs, marginTop: 1 },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  /** المرسلة: هوية بنفسجية + حد زجاجي أبيض خفيف وذيل مدوّر ناعم */
  bubbleMine: {
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderBottomEndRadius: 6,
  },
  /** المستلمة: زجاجية شفافة بحد زجاجي وذيل مدوّر ناعم — نفس لغة التطبيق */
  bubbleOther: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderBottomStartRadius: 6,
  },
  msgText: { color: colors.text, fontSize: fonts.sizes.md, lineHeight: 22 },
  deleted: { color: colors.faint, fontStyle: 'italic', fontSize: fonts.sizes.sm },
  time: { color: colors.faint, fontSize: 10, marginTop: 3, textAlign: 'right' },
  mediaImg: { width: 210, height: 210, borderRadius: radius.md },
  videoOverlay: {
    color: colors.white,
    position: 'absolute',
    bottom: 8,
    start: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    overflow: 'hidden',
    fontSize: fonts.sizes.xs,
  },
  giftImg: { width: 92, height: 92, borderRadius: radius.md },
  videoTile: {
    backgroundColor: '#1c0733',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.stroke,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    color: colors.text,
    paddingVertical: 9,
    maxHeight: 110,
    fontSize: fonts.sizes.md,
    textAlign: 'left',
  },
  /** حقل الكتابة الدائري: زجاجي شفاف بلمسة بنفسجي — نفس لغة التطبيق */
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
  },
  /** فاصل التاريخ في نص الشات */
  datePill: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginVertical: 8,
  },
  datePillText: { color: colors.muted, fontSize: fonts.sizes.xs },
  /** شريط التحرير فوق حقل الكتابة */
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.stroke,
  },
  editBarText: { color: colors.accent, fontSize: fonts.sizes.sm },
  /** شريط "أنت غير متصل" — الرسايل بتتخزن وهتتبعت تلقائيًا */
  offlineBar: {
    backgroundColor: '#451a03',
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  offlineBarText: { color: '#fdba74', fontSize: fonts.sizes.xs },
  /** صف الإيموجي السريع فوق لوحة الكتابة */
  emojiRowBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.stroke,
  },
  /** زر الـ 3 نقط في الهيدر */
  menuBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  /** مكان الصورة في وضع توفير البيانات — دوس لتحميلها */
  tapToLoad: {
    width: 210,
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tapToLoadText: { color: colors.muted, fontSize: fonts.sizes.sm },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** مؤشر التسجيل جوه حقل الكتابة (نقطة بتنبض + مؤقت + تلميح السحب) */
  recIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 9,
  },
  recTimer: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.bold,
    fontVariant: ['tabular-nums'],
  },
  recHint: { color: colors.muted, fontSize: fonts.sizes.sm, flex: 1 },
  /** أيقونة السلة اللي بتظهر على الشمال كل ما السحب يقرّب من الإلغاء */
  recCancelIcon: {
    position: 'absolute',
    left: spacing.md,
    top: '50%',
    marginTop: -13,
    zIndex: 1,
  },
  /** أيقونة القفل اللي بتظهر فوق زرار المايك كل ما السحب لفوق يقرّب من القفل */
  recLockIcon: {
    position: 'absolute',
    right: spacing.md,
    bottom: 62,
    zIndex: 1,
  },
  blockedBar: {
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.stroke,
  },
});
