import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Animated, FlatList, Image, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
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
  fetchHiddenMessageIds,
  fetchMessages,
  fetchMessagesBefore,
  fetchReactions,
  fetchReplyPreview,
  hideMessageForMe,
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
import { fonts, lightShadowGlowSoft, radius, shadowGlowSoft, spacing } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
interface GiftInfo {
  name_key: string;
  asset: string;
}

/** عتبات السحب المرنة للتسجيل الصوتي (واتساب: أي سحب واضح + إفلات = إلغاء/قفل،
 *  مش لازم توصل لمكان معين) */
const REC_CANCEL_DX = -60;
const REC_LOCK_DY = -60;
/** مدة الضغطة المطوّلة على زرار الإيموجي قبل ما الشريط يفتح */
const EMOJI_LONG_PRESS_MS = 500;
/** ضغطة أقصر من كده بتفتح واجهة التسجيل بالنقرة (مش إرسال ولا إلغاء — زي واتساب) */
const REC_TAP_MS = 200;
/** مصفوفة تفاعلات فارغة ثابتة — عشان الـ prop ما يتغيرش مع كل ريندر */
const EMPTY_REACTIONS: { emoji: string; count: number; mine: boolean }[] = [];
/** تدرج الفقاعة المرسلة (زي الصورة المرجعية): بنفسجي → فوشيا */
const SENT_GRADIENT = ['#7c3aed', '#a855f7', '#d946ef'] as const;

/** رسالة إيموجي بس (1–3 إيموجي، من غير كلام) — بتتعرض من غير فقاعة زي واتساب */
function isEmojiOnly(text: string): boolean {
  const stripped = text.trim().replace(/[\uFE0F\u200D]/g, '');
  if (!stripped) return false;
  const chars = Array.from(stripped);
  if (chars.length < 1 || chars.length > 3) return false;
  return chars.every(
    (ch) => /\p{Extended_Pictographic}/u.test(ch) || /[\u{1F3FB}-\u{1F3FF}]/u.test(ch),
  );
}

export default function ChatScreen() {
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  /** توهج نيون خفيف (فاتح: ظل بنفسجي أهدى — الغامق: توهج كامل زي المرجع) */
  const glowSoft = useMemo(
    () => (resolved === 'light' ? lightShadowGlowSoft : shadowGlowSoft),
    [resolved],
  );
  const { t, i18n } = useTranslation();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [otherAvatar, setOtherAvatar] = useState<string | null>(null);
  /** شريط الإرفاق الزجاجي (صورة/كاميرا/هدية) — بيتفتح من زرار + */
  const [attachOpen, setAttachOpen] = useState(false);
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
  /** رسالة بانتظار اختيار نوع الحذف (لدي / للجميع) */
  const [deleteMsg, setDeleteMsg] = useState<Message | null>(null);
  /** IDs الرسايل اللي خفيتها لنفسي ("الحذف لدي") — بتتستبعد من العرض */
  const hiddenIdsRef = useRef<Set<string>>(new Set());
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
  /** شريط الإيموجي السريع بالسحب (زي فيسبوك): الإيموجي النشط تحت الصبع،
   *  -1 يعني مفيش إيموجي نشط (الصبع برّه الشريط أو لسه ما اتحركش) */
  const slideActive = useSharedValue(-1);
  const slideRowWRef = useRef(0);
  const slideRowHRef = useRef(0);
  const slideIdxRef = useRef(-1);
  /** الصبع اتحرك فعلًا على الشريط ولا مجرد دوسة من غير سحب */
  const slideMovedRef = useRef(false);
  /** الضغطة الواحدة المتواصلة على زرار الإيموجي (زي فيسبوك): الزرار
   *  نفسه ماسك الضغطة من أولها لآخرها — بيحس بالضغطة المطوّلة
   *  وبيتتبع مكان الصبع على الشاشة حتى فوق الشريط */
  const emojiRowRef = useRef<any>(null);
  const emojiRowRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const emojiLongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emojiPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const emojiSlideRef = useRef(false);
  const emojiMovedRef = useRef(false);
  const [emojiPressed, setEmojiPressed] = useState(false);
  const [loadedIds, setLoadedIds] = useState<Record<string, boolean>>({});
  /** الرسالة المتظللة بعد النطّ ليها من اقتباس (وميض ذهبي ~1.6 ثانية) */
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef('');
  const draftLoadedRef = useRef(false);
  /** مؤقت تأجيل حفظ المسودة — المسودة بتتحفظ بعد 500ms من التوقف عن
   *  الكتابة مش مع كل حرف (حفظ AsyncStorage مع كل حرف هو اللي بيهنّج
   *  المسح السريع) */
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<any>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  // ---- التسجيل الصوتي (ستايل واتساب: ضغط مطول، إفلات للإرسال،
  // سحب حر لليسار للإلغاء، سحب حر لأعلى للقفل — من غير هدف معين)
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recState = useAudioRecorderState(recorder, 500);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'tap'>('idle');
  /** موضع الإصبع أثناء سحب التسجيل — SharedValue مش state: كل حركة
   *  إصبع كانت بتعيد رسم الشاشة كلها (سبب التهنيج أثناء السحب).
   *  الـ state بيتحدث بس لما نعبر حد الإلغاء/القفل. */
  const recDragSV = useSharedValue({ dx: 0, dy: 0 });
  const [recZone, setRecZone] = useState<'none' | 'cancel' | 'lock'>('none');
  const recZoneRef = useRef<'none' | 'cancel' | 'lock'>('none');
  const recZoneOf = (dx: number, dy: number): 'none' | 'cancel' | 'lock' =>
    dx <= REC_CANCEL_DX ? 'cancel' : dy <= REC_LOCK_DY ? 'lock' : 'none';
  const updateRecZone = (dx: number, dy: number) => {
    const z = recZoneOf(dx, dy);
    if (z !== recZoneRef.current) {
      recZoneRef.current = z;
      setRecZone(z);
      if (z !== 'none') Haptics.selectionAsync().catch(() => {});
    }
  };
  // أيقونتا الإلغاء/القفل بيتحدثوا من الـ SharedValue مباشرة من غير
  // إعادة رسم — السحب يمشي على 60 إطار من غير تهنيج
  const trashAnimStyle = useAnimatedStyle(() => {
    const dx = recDragSV.value.dx;
    return {
      opacity: dx < -10 ? Math.min(1, -dx / -REC_CANCEL_DX) : 0,
      transform: [{ scale: 1 + Math.min(1, -dx / 60) * 0.3 }],
    };
  });
  const lockAnimStyle = useAnimatedStyle(() => {
    const dy = recDragSV.value.dy;
    const active = dy < -10;
    return {
      opacity: active ? Math.min(1, -dy / -REC_LOCK_DY) : 0.55,
      transform: [{ scale: 1 + (active ? Math.min(1, -dy / 60) * 0.25 : 0) }],
    };
  });
  /** تصفير السحب (بعد الإرسال/الإلغاء/القفل/الإفلات) */
  const resetRecDrag = () => {
    recDragSV.value = { dx: 0, dy: 0 };
    recZoneRef.current = 'none';
    setRecZone('none');
  };
  /** جلسة التسجيل الحالية — بتمنع استدعاء record() المتأخر لو الإصبع
   *  اترفع بسرعة قبل ما التجهيز يخلص (فكانت بتسيب تسجيل شبح شغال) */
  const recSessionRef = useRef(0);
  const recPressAtRef = useRef(0);
  /** موضع الإصبع لحظة الضغط — منه بيتحسب السحب (pageX/pageY) */
  const recStartPosRef = useRef({ x: 0, y: 0 });
  /** واجهة النقرة: إيقاف مؤقت / استئناف */
  const [recPaused, setRecPaused] = useState(false);
  /** المدة المعروضة في مؤقت التسجيل — وقت الضغطة أثناء التجهيز،
   *  ومدة المسجل بعد ما يبدأ (بتتزامن في effect تحت) */
  const [recDisplayMs, setRecDisplayMs] = useState(0);
  /** الإصبع ضاغط على المايك دلوقتي — الزرار بيكبر طول الضغطة */
  const [micPressed, setMicPressed] = useState(false);
  /** ضغطة سريعة (<200ms) والتسجيل لسه بيجهز — لما record() يبدأ يفتح واجهة النقرة */
  const recTapPendingRef = useRef(false);
  /** true من لحظة ما record() ينجح لحد ما التسجيل يتوقف/يتلغي —
   *  بيمنع إيقاف/إرسال ملف قديم من تسجيل سابق */
  const recStartedRef = useRef(false);
  /** المسجل متجهز وجاهز — لو true، startRecording بيتخطى
   *  prepareToRecordAsync (التجهيز اتعمل في الخلفية بعد التسجيل اللي فات) */
  const recPreparedRef = useRef(false);
  /** تجهيز جاري — بيتشارك بين ضغطة المايك والتجهيز الخلفي بعد الإرسال
   *  عشان ما يبقاش فيه تجهيزين متوازيين */
  const recPreparePromiseRef = useRef<Promise<void> | null>(null);
  /** إذن المايك — بيتطلب مرة واحدة عند فتح الشات وبيتخزّن هنا،
   *  فالضغطة مش بتستناه كل مرة (كان جزء من تأخير بدء التسجيل) */
  const recPermRef = useRef<boolean | null>(null);

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

  /** يجهّز المسجل لو مش متجهز — الطلبات المتزامنة بتستنى نفس الوعد
   *  (ضغطة مايك + تجهيز خلفي)، والفشل بيرجع false ضمنيًا عبر الـ throw
   *  وبيسمح بإعادة المحاولة في الضغطة اللي بعدها. */
  const ensureRecPrepared = useCallback(async () => {
    if (recPreparedRef.current) return;
    if (!recPreparePromiseRef.current) {
      recPreparePromiseRef.current = (async () => {
        await recorder.prepareToRecordAsync();
        recPreparedRef.current = true;
      })().finally(() => {
        recPreparePromiseRef.current = null;
      });
    }
    await recPreparePromiseRef.current;
  }, [recorder]);

  const startRecording = async () => {
    if (recorder.isRecording) return;
    // جلسة البدء دي — لو الإصبع اترفع قبل ما التجهيز يخلص، الإفلات
    // بيزوّد العداد فالسلسلة دي بتتوقف قبل ما تنادي record()
    const session = recSessionRef.current;
    // إلغاء مبكر (إذن مرفوض / جلسة اتلغت / تجهيز فشل) — رجّع الواجهة
    // للحالة العادية عشان الواجهة المتفائلة ما تفضلش معلقة على التسجيل
    const abort = () => {
      recTapPendingRef.current = false;
      setMicPressed(false);
      setPhase('idle');
    };
    const status = recPermRef.current === true
      ? { granted: true }
      : await AudioModule.requestRecordingPermissionsAsync();
    recPermRef.current = status.granted;
    if (!status.granted) {
      abort();
      appAlert(t('common.error'), t('chat.micDenied'));
      return;
    }
    if (recSessionRef.current !== session) {
      abort();
      return;
    }
    Keyboard.dismiss();
    // التجهيز غالبًا خلص في الخلفية بعد التسجيل اللي فات (متجهز) —
    // فالضغطة دي بتبدأ فورًا من غير انتظار getUserMedia
    try {
      await ensureRecPrepared();
    } catch {
      abort();
      return;
    }
    if (recSessionRef.current !== session) {
      abort();
      return;
    }
    recorder.record();
    // الـ prepared instance اتستهلك — لازم تجهيز جديد بعد الإيقاف
    recPreparedRef.current = false;
    recStartedRef.current = true;
    setRecPaused(false);
    // ضغطة سريعة كانت مستنية التجهيز → افتح واجهة النقرة بدل شريط الضغط
    setPhase(recTapPendingRef.current ? 'tap' : 'recording');
    recTapPendingRef.current = false;
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

  /** إيقاف التسجيل وإرسال الفويس فورًا (من غير معاينة) — بيوقف حتى لو
   *  التسجيل متوقف مؤقتًا (isRecording بيبقى false وقت الإيقاف المؤقت) */
  const stopAndSendRecording = async () => {
    recSessionRef.current += 1;
    setMicPressed(false);
    setRecPaused(false);
    // لو التسجيل لسه مابدأش أصلًا (إرسال قبل ما التجهيز يخلص) مفيش حاجة تتبعت
    if (!recStartedRef.current) {
      setPhase('idle');
      resetRecDrag();
      recTapPendingRef.current = false;
      return;
    }
    try {
      await recorder.stop();
    } catch {
      // المسجل واقف أصلًا
    }
    recStartedRef.current = false;
    // الـ prepared instance اتستهلك — لازم تجهيز جديد بعد الإيقاف
    recPreparedRef.current = false;
    const uri = recorder.uri;
    setPhase('idle');
    resetRecDrag();
    recTapPendingRef.current = false;
    if (!uri) return;
    // جهّز التسجيل اللي جاي في الخلفية دلوقتي (الإذن ممنوح خلاص)
    // فالضغطة اللي بعدها تبدأ فورًا
    void ensureRecPrepared().catch(() => {});
    const dur = Math.max(1, Math.round(recState.durationMillis / 1000));
    await sendRecording(uri, dur);
  };

  const cancelRecording = async () => {
    recSessionRef.current += 1;
    const wasStarted = recStartedRef.current;
    recStartedRef.current = false;
    // الـ prepared instance اتستهلك — لازم تجهيز جديد بعد الإيقاف
    recPreparedRef.current = false;
    recTapPendingRef.current = false;
    setMicPressed(false);
    setRecPaused(false);
    // وقّف حتى لو متوقف مؤقتًا — المسجل المتوقف مؤقتًا لسه ماسك الستريم
    if (wasStarted) {
      try {
        await recorder.stop();
      } catch {
        // المسجل واقف أصلًا
      }
    }
    setPhase('idle');
    resetRecDrag();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  /** القفل بالسحب لفوق بيفتح واجهة التسجيل بالنقرة (واجهة واحدة موحدة) */
  const lockRecording = () => {
    if (!recorder.isRecording) return;
    resetRecDrag();
    setMicPressed(false);
    setPhase('tap');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  /** إيقاف مؤقت / استئناف من واجهة النقرة — pause مدعوم على الويب
   *  (MediaRecorder.pause) وعلى الموبايل؛ وrecord() من غير بارامترات
   *  بيستأنف نفس التسجيل. لو فشل لأي سبب، التسجيل بيكمل من غير ما يضيع. */
  const toggleRecPause = () => {
    if (!recorder.isRecording && !recPaused) return;
    try {
      if (recPaused) {
        recorder.record();
        setRecPaused(false);
      } else {
        recorder.pause();
        setRecPaused(true);
      }
    } catch {
      setRecPaused(false);
    }
  };

  /** مدة التسجيل الحالية بصيغة m:ss */
  const recSeconds = () => {
    const s = Math.floor(recDisplayMs / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  /** مزامنة المؤقت المعروض: أثناء تجهيز أول ضغطة (مدة المسجل لسه صفر)
   *  بيمشي من لحظة الضغطة، وبعدها بيمشي مع مدة المسجل */
  useEffect(() => {
    if (phase === 'recording' && recState.durationMillis === 0 && recPressAtRef.current) {
      setRecDisplayMs(Date.now() - recPressAtRef.current);
    } else {
      setRecDisplayMs(recState.durationMillis);
    }
  }, [phase, recState.durationMillis]);

  /** أيقونة الإرسال (طيارة ورق) بتتعكس في العربي زي واتساب */
  const sendFlip: { transform: [{ scaleX: number }] } = {
    transform: [{ scaleX: i18n.language === 'ar' ? -1 : 1 }],
  };

  /** إيماءة التسجيل (نفس نظام PanResponder بس بخواص responder مباشرة على
   *  الزر — فالـ handlers بتوعها event handlers عادية: مسموح فيها قراءة
   *  الـ refs وDate.now. ضغطة مطولة بتبدأ، والزرار بيكبر ×1.4 من أول
   *  لحظة الضغط ويفضل كبير طول الضغطة، والشريط بيمشي مع الإصبع لحظيًا،
   *  والإفلات بعد أي سحب واضح لليسار بيلغي (من غير هدف معين) وبعد أي
   *  سحب واضح لفوق بيقفل، والإفلات العادي بيبعت. ضغطة سريعة (أقل من
   *  200ms) بتفتح واجهة التسجيل بالنقرة والتسجيل بيكمل فيها. شغالة على
   *  الموبايل والويب. */
  const recGrant = (e: GestureResponderEvent) => {
    // جلسة جديدة: أي سلسلة تجهيز قديمة لسه شغالة بتتوقف
    recSessionRef.current += 1;
    recPressAtRef.current = Date.now();
    recStartPosRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    recTapPendingRef.current = false;
    // الزرار بيكبر من أول لحظة الضغط — قبل ما التجهيز يخلص
    setMicPressed(true);
    // شريط التسجيل بيظهر فورًا مع الضغطة (قبل التجهيز ما يخلص) —
    // التأخير كان سببه استنى الإذن + تجهيز المسجل قبل إظهار الواجهة
    setPhase('recording');
    // ضغطة والمايك بيسجّل أصلًا (التسجيل بدأ والإصبع اترفع بسرعة قبل
    // ما التجهيز يخلص) — وقّف وابعت اللي اتسجّل
    if (phase === 'recording') {
      void stopAndSendRecording();
      return;
    }
    resetRecDrag();
    void startRecording();
  };
  const recMove = (e: GestureResponderEvent) => {
    const dx = Math.min(0, e.nativeEvent.pageX - recStartPosRef.current.x);
    const dy = Math.min(0, e.nativeEvent.pageY - recStartPosRef.current.y);
    // SharedValue بس — مفيش setState هنا، فالشاشة كلها مبتتعدش رسمها
    // مع كل حركة إصبع؛ الأيقونات بتتحدث من الـ SharedValue مباشرة
    recDragSV.value = { dx, dy };
    updateRecZone(dx, dy);
  };
  const recRelease = (e: GestureResponderEvent) => {
    setMicPressed(false);
    const pressMs = Date.now() - recPressAtRef.current;
    const dx = Math.min(0, e.nativeEvent.pageX - recStartPosRef.current.x);
    const dy = Math.min(0, e.nativeEvent.pageY - recStartPosRef.current.y);
    // ضغطة سريعة (أقل من 200ms): مش إرسال ولا إلغاء — التسجيل بيكمل في
    // واجهة النقرة. من غير ما تلغي جلسة البدء عشان لو التسجيل لسه بيجهز
    // يكمل ويفتح الواجهة لما يبدأ.
    if (pressMs < REC_TAP_MS) {
      recTapPendingRef.current = true;
      resetRecDrag();
      if (recorder.isRecording) setPhase('tap');
      return;
    }
    // الإفلات بيلغي جلسة البدء — أي record() متأخر مش هيتنفذ
    recSessionRef.current += 1;
    // سحب حر: أي سحب واضح لليسار + إفلات = إلغاء، من غير مكان معين
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
    // النظام قتل اللمسة من برّه (سحب الشاشة/مكالمة/تنبيه) — عاملها زي
    // الإفلات: ضغطة سريعة بتفتح واجهة النقرة، ولو كان بيسحب للإلغاء
    // يلغي، ولو فيه تسجيل حقيقي يتبعت بدل ما يضيع، غير كده يلغي.
    recSessionRef.current += 1;
    setMicPressed(false);
    const pressMs = Date.now() - recPressAtRef.current;
    if (pressMs < REC_TAP_MS) {
      recTapPendingRef.current = true;
      resetRecDrag();
      if (recorder.isRecording) setPhase('tap');
      return;
    }
    if (recDragSV.value.dx <= REC_CANCEL_DX) {
      void cancelRecording();
      return;
    }
    if (recorder.isRecording && recState.durationMillis >= 1000) {
      void stopAndSendRecording();
      return;
    }
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
    // استبعد الرسايل اللي المستخدم خفاها لنفسه ("الحذف لدي")
    const hidden = await fetchHiddenMessageIds(
      me.id,
      msgs.map((m) => m.id),
    );
    hiddenIdsRef.current = hidden;
    const visible = msgs.filter((m) => !hidden.has(m.id));
    setMessages(visible);
    loadGiftInfo(visible);
    setReactions(await fetchReactions(visible.map((m) => m.id), me.id));
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
      // لو فيه حفظ مسودة مؤجل لسه ما اتنفذش، احفظها فورًا قبل الخروج
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      if (cid && textRef.current.trim()) {
        void saveDraft(cid, textRef.current);
      }
      // لو خرج من الشات والتسجيل شغال (وضع النقرة/القفل مثلًا)، وقّفه
      // (حتى لو متوقف مؤقتًا — isRecording بيبقى false وقتها)
      if (recStartedRef.current) {
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

  // ضبط الصوت مرة واحدة لما الشات يتفتح — مش مع كل ضغطة مايك
  // الإذن بيتطلب مرة واحدة عند فتح الشات + المسجل بيتجهز في الخلفية —
  // أول ضغطة مايك تبدأ فورًا من غير انتظار الإذن/getUserMedia
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true }).catch(() => {});
    void (async () => {
      try {
        const st = await AudioModule.requestRecordingPermissionsAsync();
        recPermRef.current = st.granted;
        if (st.granted) await ensureRecPrepared();
      } catch {
        // الإذن/التجهيز يفضل للضغطة — هتطلبه عادي وقتها
      }
    })();
  }, [ensureRecPrepared]);

  // التجهيز يتجدد كل مرة ترجع للشات — الضغطة متستناش التجهيز أبدًا
  // (الهزة عند دخول منطقة الإلغاء/القفل بقت في updateRecZone)
  useFocusEffect(
    useCallback(() => {
      void ensureRecPrepared().catch(() => {});
    }, [ensureRecPrepared]),
  );

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
              // رسالة خفيتها لنفسي ("الحذف لدي") ما ترجعش تظهر من الاشتراك
              if (hiddenIdsRef.current.has(row.id)) return prev;
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

  // ---------- دوال ثابتة (useCallback/useMemo) قبل الإرجاع المبكر —
  // عشان الكتابة ما تعيدش رسم كل فقاعة: صفوف القائمة memo والـ props
  // بتاعتها لازم تبقى ثابتة الهوية بين الريندرات ----------
  /** حفظ المسودة فورًا — بيلغي أي حفظ مؤجل (إيموجي سريع مثلًا) */
  const flushDraft = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (conversationId && textRef.current.trim()) {
      void saveDraft(conversationId, textRef.current);
    }
  }, [conversationId]);

  /** نص مختصر لأي رسالة — بيُستخدم في الاقتباس وشريط الرد */
  const snippetFor = useCallback(
    (m: ReplyPreview | Message): string => {
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
    },
    [t],
  );

  const nameFor = useCallback(
    (senderId: string): string =>
      senderId === me?.id ? t('chat.youName') : (other?.shown_name ?? ''),
    [me, other, t],
  );

  const onReact = useCallback(
    async (m: Message, emoji: string) => {
      if (!me) return;
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
    },
    [me, reactions],
  );

  const startReply = useCallback((m: Message) => {
    if (m.is_deleted) return;
    setReplyTo(m);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const onLongPress = useCallback((m: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setActionMsg(m);
  }, []);

  /** فاصل التاريخ: "اليوم" أو التاريخ — يظهر فوق أول رسالة في اليوم */
  const dayKey = useCallback((iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }, []);
  const dayLabel = useCallback(
    (iso: string) => {
      if (dayKey(iso) === dayKey(new Date().toISOString())) return t('chat.today');
      return new Date(iso).toLocaleDateString(
        i18n.language === 'ar' ? 'ar-EG' : 'en-GB',
        { day: 'numeric', month: 'long', year: 'numeric' },
      );
    },
    [dayKey, i18n.language, t],
  );

  const handleGiftPress = useCallback(
    (g: GiftInfo) =>
      setAnimGift({ nameKey: g.name_key, title: t('giftAnimation.replay') }),
    [t],
  );
  const handleMediaPress = useCallback(
    (url: string, kind: 'image' | 'video') =>
      router.push({ pathname: '/media-viewer', params: { url, type: kind } }),
    [],
  );
  const handleLoadMedia = useCallback(
    (id: string) => setLoadedIds((prev) => ({ ...prev, [id]: true })),
    [],
  );

  /** القائمة: المعلّقة (الأحدث) أولًا ثم الرسائل — المعلقة باينة بعلامة ساعة */
  const listData = useMemo<(Message | OutboxItem)[]>(
    () => [...pending, ...messages],
    [pending, messages],
  );

  /** النطّ للرسالة الأصلية لما تدوس على اقتباس (زي واتساب) + وميض ذهبي.
   *  لو الأصلية أقدم من آخر ١٠٠ رسالة محمّلة، بنحمّل دفعات أقدم الأول
   *  (٣ دفعات كحد أقصى) وبعدين ننطّ عليها. */
  const jumpToMessage = useCallback(
    async (id: string) => {
      // تجمّع محلي بنفس ترتيب listData (المعلّقة أولًا ثم الرسايل الأحدث أولًا)
      let pool: (Message | OutboxItem)[] = [...pending, ...messages];
      let idx = pool.findIndex((x) => !('localId' in x) && x.id === id);
      let tries = 0;
      while (idx === -1 && tries < 3) {
        const real = pool.filter((x): x is Message => !('localId' in x));
        const oldest = real[real.length - 1];
        if (!oldest || !conversationId) break;
        const older = await fetchMessagesBefore(conversationId, oldest.created_at);
        const visible = older.filter((m) => !hiddenIdsRef.current.has(m.id));
        if (!visible.length) break;
        pool = [...pool, ...visible];
        setMessages((prev) => [...prev, ...visible]);
        idx = pool.findIndex((x) => !('localId' in x) && x.id === id);
        tries += 1;
      }
      if (idx === -1) {
        appAlert(t('chat.originalNotLoaded'));
        return;
      }
      // استنّا رندر واحد لو حمّلنا دفعات أقدم قبل ما ننطّ
      if (tries > 0) await new Promise((r) => setTimeout(r, 150));
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      setHighlightId(id);
      highlightTimerRef.current = setTimeout(() => setHighlightId(null), 1600);
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    },
    [pending, messages, conversationId, t],
  );

  /** صف القائمة — ثابت الهوية إلا لما تتغير بياناته (عشان memo الفقاعات
   *  يشتغل: الكتابة بتغيّر النص بس فالفقاعات ما بتترسمش من تاني) */
  const renderItem = useCallback(
    ({ item, index }: { item: Message | OutboxItem; index: number }) => {
      // رسالة معلّقة (أوفلاين) — فقاعة شفافة بعلامة ساعة
      if ('localId' in item) {
        return <PendingBubble item={item} />;
      }
      const mine = item.sender_id === me?.id;
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
          avatarUri={!mine ? otherAvatar : undefined}
          avatarName={!mine ? (other?.shown_name ?? undefined) : undefined}
          gift={item.gift_send_id ? giftMap[item.gift_send_id] : undefined}
          replyName={item.reply_preview ? nameFor(item.reply_preview.sender_id) : undefined}
          replySnippet={item.reply_preview ? snippetFor(item.reply_preview) : undefined}
          reactions={reactions[item.id] ?? EMPTY_REACTIONS}
          onReactPress={onReact}
          onGiftPress={handleGiftPress}
          onMediaPress={handleMediaPress}
          onLongPress={onLongPress}
          onQuotePress={jumpToMessage}
          highlighted={highlightId === item.id}
          dataSaver={dataSaver}
          forceLoad={!!loadedIds[item.id]}
          onLoadMedia={handleLoadMedia}
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
            renderLeftActions={(progress) => (
              <SwipeReplyArrow progress={progress} glyph="↩" style={styles.replyAction} />
            )}
            renderRightActions={(progress) => (
              <SwipeReplyArrow progress={progress} glyph="↪" style={styles.replyAction} />
            )}
            onSwipeableOpen={() => {
              startReply(item);
              swipeRefs.current.get(item.id)?.close();
            }}>
            {bubble}
          </Swipeable>
        </>
      );
    },
    [
      listData,
      reactions,
      giftMap,
      dataSaver,
      loadedIds,
      me,
      nameFor,
      snippetFor,
      onReact,
      onLongPress,
      handleGiftPress,
      handleMediaPress,
      handleLoadMedia,
      startReply,
      jumpToMessage,
      highlightId,
      dayKey,
      dayLabel,
      otherAvatar,
      other,
      styles,
    ],
  );

  if (!me || !conversationId) return <View style={styles.root} />;

  /** كتابة: تحديث النص + حفظ مسودة مؤجل + بث «بيكتب» مثبّتًا كل ٢.٥ ثانية */
  const onType = (v: string) => {
    setText(v);
    textRef.current = v;
    // مسودة: بتتحفظ بعد 500ms من التوقف عن الكتابة مش مع كل حرف
    // (حفظ AsyncStorage مع كل حرف هو اللي بيهنّج المسح السريع)
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null;
      if (conversationId) void saveDraft(conversationId, textRef.current);
    }, 500);
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

  /** إرسال نص — clearComposer بيمسح صندوق الكتابة والمسودة (إرسال عادي)،
   *  ولو false بيسيب اللي مكتوب زي ما هو (إيموجي سريع) */
  const sendTextBody = async (body: string, clearComposer: boolean) => {
    if (!body.trim() || sending) return;
    const replyId = replyTo?.id ?? null;
    if (clearComposer) {
      // النص بيتبعت — مفيش مسودة تحفظها: ألغي أي حفظ مؤجل
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      setText('');
      textRef.current = '';
    } else {
      // إيموجي سريع — اللي مكتوب بيفضل: احفظ المسودة فورًا
      flushDraft();
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
      // الرسالة في القائمة وهتتبعت — المسودة ملهاش لازمة
      await clearDraft(conversationId);
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
      // الرسالة في القائمة وهتتبعت — المسودة ملهاش لازمة
      await clearDraft(conversationId);
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
    setAttachOpen(false);
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

  /** الضغطة الواحدة المتواصلة على زرار الإيموجي (زي فيسبوك): الزرار
   *  ماسك الضغطة كلها — ضغطة سريعة بتبعت الإيموجي السريع، وضغطة
   *  مطوّلة بتفتح الشريط في نفس الضغطة والصباع يزحلق لفوق يختار؛
   *  الرفع على إيموجي بيبعته، والرفع برّه الإيموجي بيلغي */
  const clearEmojiLongTimer = () => {
    if (emojiLongTimerRef.current) {
      clearTimeout(emojiLongTimerRef.current);
      emojiLongTimerRef.current = null;
    }
  };

  const emojiIndexFromPage = (pageX: number, pageY: number) => {
    const r = emojiRowRectRef.current;
    if (!r || r.width <= 0) return -1;
    if (pageY < r.y - 24 || pageY > r.y + r.height + 24) return -1;
    const idx = Math.floor((pageX - r.x) / (r.width / EMOJI_QUICK.length));
    return idx >= 0 && idx < EMOJI_QUICK.length ? idx : -1;
  };

  const onEmojiGrant = (evt: GestureResponderEvent) => {
    const { pageX, pageY } = evt.nativeEvent;
    emojiPressStartRef.current = { x: pageX, y: pageY };
    emojiMovedRef.current = false;
    emojiSlideRef.current = false;
    setEmojiPressed(true);
    clearEmojiLongTimer();
    emojiLongTimerRef.current = setTimeout(() => {
      emojiLongTimerRef.current = null;
      // الضغطة المطوّلة والصباع لسه نازل — الشريط يفتح في نفس الضغطة
      emojiSlideRef.current = true;
      setEmojiOpen(true);
      requestAnimationFrame(() => {
        emojiRowRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
          emojiRowRectRef.current = { x, y, width, height };
        });
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, EMOJI_LONG_PRESS_MS);
  };

  const onEmojiMove = (evt: GestureResponderEvent) => {
    const { pageX, pageY } = evt.nativeEvent;
    const start = emojiPressStartRef.current;
    if (start && Math.hypot(pageX - start.x, pageY - start.y) > 12) {
      emojiMovedRef.current = true;
      // اتحرك قبل ما الضغطة المطوّلة تكمل — تتلغي
      if (!emojiSlideRef.current) clearEmojiLongTimer();
    }
    if (!emojiSlideRef.current) return;
    const idx = emojiIndexFromPage(pageX, pageY);
    if (idx !== slideIdxRef.current) {
      slideIdxRef.current = idx;
      slideActive.value = idx;
      if (idx >= 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const onEmojiRelease = () => {
    setEmojiPressed(false);
    clearEmojiLongTimer();
    if (emojiSlideRef.current) {
      // ضغطة مطوّلة + سحب: الرفع على إيموجي بيبعته، برّه الإيموجي بيلغي
      const idx = slideIdxRef.current;
      emojiSlideRef.current = false;
      slideActive.value = -1;
      slideIdxRef.current = -1;
      if (idx >= 0) {
        onPickQuickEmoji(EMOJI_QUICK[idx]);
      } else {
        setEmojiOpen(false);
      }
      return;
    }
    // ضغطة واحدة سريعة من غير حركة — بتبعت الإيموجي السريع فورًا
    if (!emojiMovedRef.current) onEmojiPress();
  };

  const onEmojiTerminate = () => {
    setEmojiPressed(false);
    clearEmojiLongTimer();
    // الضغطة اتقطعت (النظام خد اللمس) — إلغاء من غير إرسال
    if (emojiSlideRef.current) setEmojiOpen(false);
    emojiSlideRef.current = false;
    slideActive.value = -1;
    slideIdxRef.current = -1;
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

  /** شريط الإيموجي السريع بالسحب (زي فيسبوك): سطح لمس واحد — الصبع
   *  لازم يتحرك على إيموجي، والرفع وهو على إيموجي بيبعته؛ الدوسة
   *  من غير سحب مش بتبعت حاجة، والسحب برّه الشريط بيلغي */
  const slideIndexFromEvent = (evt: GestureResponderEvent) => {
    const { locationX, locationY } = evt.nativeEvent;
    const w = slideRowWRef.current;
    const h = slideRowHRef.current;
    if (w <= 0) return -1;
    if (locationY < -24 || locationY > h + 24) return -1;
    const idx = Math.floor(locationX / (w / EMOJI_QUICK.length));
    return idx >= 0 && idx < EMOJI_QUICK.length ? idx : -1;
  };

  const onSlideStart = (evt: GestureResponderEvent) => {
    slideMovedRef.current = false;
    const idx = slideIndexFromEvent(evt);
    slideIdxRef.current = idx;
    slideActive.value = idx;
  };

  const onSlideMove = (evt: GestureResponderEvent) => {
    slideMovedRef.current = true;
    const idx = slideIndexFromEvent(evt);
    if (idx !== slideIdxRef.current) {
      slideIdxRef.current = idx;
      slideActive.value = idx;
      if (idx >= 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };

  const onSlideRelease = () => {
    const idx = slideIdxRef.current;
    slideActive.value = -1;
    slideIdxRef.current = -1;
    // دوسة من غير سحب — مش بتبعت، والشريط يفضل مفتوح
    if (!slideMovedRef.current) return;
    // اتسحب برّه الشريط — إلغاء من غير إرسال
    if (idx < 0) {
      setEmojiOpen(false);
      return;
    }
    onPickQuickEmoji(EMOJI_QUICK[idx]);
  };

  const onSlideTerminate = () => {
    slideActive.value = -1;
    slideIdxRef.current = -1;
    // السحب على الشريط اتقطع — إلغاء من غير إرسال
    setEmojiOpen(false);
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
    setAttachOpen(false);
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

  /** الكاميرا — شاشة كاميرا جوّه التطبيق (كاميرا الهاتف نفسها، مش
   *  معرض الصور — على الويب launchCameraAsync كان بيفتح المعرض).
   *  الصورة بتتاخد لملف مؤقت وبتتمسح بعد الإرسال، مبتتحفظش على الهاتف. */
  const onCamera = () => {
    setAttachOpen(false);
    if (!me || !conversationId) return;
    router.push({
      pathname: '/camera',
      params: {
        conversationId,
        senderId: me.id,
        replyToId: replyTo?.id ?? '',
      },
    });
  };

  const sheetDelete = async (m: Message) => {
    setActionMsg(null);
    setDeleteMsg(null);
    if (await softDeleteMessage(m.id)) {
      setMessages((prev) =>
        prev.map((x) =>
          x.id === m.id ? { ...x, is_deleted: true, body: null, media_path: null } : x,
        ),
      );
    }
  };

  /** "الحذف لدي" — الرسالة بتختفي عندي بس (الطرف التاني بيشوفها عادي).
   *  سجل في hidden_messages + شيلها من العرض متفائلًا. */
  const deleteForMe = async (m: Message) => {
    setDeleteMsg(null);
    if (await hideMessageForMe(m.id, me.id)) {
      hiddenIdsRef.current.add(m.id);
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
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

  return (
    <View style={styles.root}>
      {/* خلفية الشات: صورة أليكس نفسها (غامق/فاتح حسب الوضع) — ثابتة ورا كل حاجة.
          العرض/الطول 100% صريحين لأن React Native Web من غيرهم بياخد مقاس
          الصورة الأصلي (941×1672) فبتتقص على الموبايل وبتقف عند نص الشاشة على الديسكتوب */}
      <Image
        source={
          resolved === 'light'
            ? require('../../assets/chat-bg-light.jpg')
            : require('../../assets/chat-bg-dark.jpg')
        }
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        resizeMode="cover"
      />
      {/* الترويسة — شريط زجاجي عائم زي الصورة المرجعية؛
          مسافة الأمان الحقيقية بتاعة الجهاز (مش رقم ثابت) */}
      <View style={[styles.header, { marginTop: insets.top + spacing.sm }]}>
        <BlurView
          intensity={resolved === 'light' ? 20 : 32}
          tint={resolved === 'light' ? 'light' : 'dark'}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: radius.full }]}
        />
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
            <Text style={styles.headerName} numberOfLines={1} ellipsizeMode="tail">
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
          circular
          onPress={() =>
            otherId &&
            router.push({ pathname: '/gift-picker', params: { userId: otherId } })
          }
        />
        <GlassIconButton
          name="ellipsis-vertical"
          size={22}
          circular
          onPress={() => setMenuOpen(true)}
        />
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {/* الرسائل */}
      <FlatList
        ref={listRef}
        data={listData}
        inverted
        // القايمة بتتجمد طول الضغطة على المايك — الرسايل ما تتسحبش
        // مع صبعك وأنت بتسجل (زي واتساب)؛ بترجع أول ما ترفع إصبعك
        scrollEnabled={phase !== 'recording'}
        keyExtractor={(m) => ('localId' in m ? m.localId : m.id)}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={renderItem}
        onScrollToIndexFailed={({ index }) => {
          // من غير getItemLayout النطّ ممكن يفشل للرسايل البعيدة —
          // نقدّر مكانها الأول وبعدين نعيد النطّ
          listRef.current?.scrollToOffset({
            offset: Math.max(0, index * 120),
            animated: false,
          });
          setTimeout(
            () =>
              listRef.current?.scrollToIndex({
                index,
                animated: true,
                viewPosition: 0.5,
              }),
            150,
          );
        }}
      />

      {/* شريط الرد (اقتباس) */}
      {replyTo && phase === 'idle' && !blockedByMe ? (
        <View style={styles.replyBar}>
          <View style={{ flex: 1 }}>
            {/* النهار: الاسم بلون بنفسجي غامق (#9333ea) بدل accent الفاتح — الشريط نفسه يفضل شفاف */}
            <Text
              style={[
                styles.replyBarName,
                resolved === 'light' && { color: colors.primaryBright },
              ]}>
              {t('chat.replyingTo')} {nameFor(replyTo.sender_id)}
            </Text>
            <Text style={styles.replyBarText} numberOfLines={1}>
              {snippetFor(replyTo)}
            </Text>
          </View>
          {resolved === 'light' ? (
            <TouchableOpacity
              style={styles.replyCloseSolid}
              onPress={() => setReplyTo(null)}
              hitSlop={6}>
              <Ionicons name="close" size={18} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <GlassIconButton name="close" size={15} circular onPress={() => setReplyTo(null)} />
          )}
        </View>
      ) : null}

      {/* منطقة الإدخال */}
      {blockedByMe ? (
        <View style={styles.blockedBar}>
          <Text style={{ color: colors.danger }}>{t('chat.blockedNotice')}</Text>
        </View>
      ) : phase === 'tap' ? (
        <View style={styles.tapRecorder}>
          <View style={styles.tapWaveRow}>
            {recPaused ? <View style={styles.recDotPaused} /> : <PulseDot />}
            <Text style={styles.recTimer}>{recSeconds()}</Text>
            <RecWaveform metering={recState.metering} paused={recPaused} />
          </View>
          <Text style={styles.tapHint}>{t('chat.tapSendOrCancel')}</Text>
          <View style={styles.tapControls}>
            <TouchableOpacity onPress={() => void cancelRecording()} hitSlop={8}>
              <Ionicons name="trash-outline" size={26} color={colors.danger} />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleRecPause} style={styles.tapPausePill}>
              <Ionicons
                name={recPaused ? 'play' : 'pause'}
                size={16}
                color={colors.text}
              />
              <Text style={styles.tapPauseText}>
                {recPaused ? t('chat.recResume') : t('chat.recPause')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void stopAndSendRecording()}
              style={styles.tapSendBtn}>
              <Ionicons name="send" size={22} color={colors.white} style={sendFlip} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {editing ? (
            <View style={styles.editBar}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <GlassIconChip name="pencil-outline" size={15} />
                {/* النهار: لون أغمق عشان يبان على الشريط الشفاف */}
                <Text
                  style={[
                    styles.editBarText,
                    resolved === 'light' && { color: colors.primaryBright },
                  ]}>
                  {t('chat.editMessage')}
                </Text>
              </View>
              {resolved === 'light' ? (
                <TouchableOpacity
                  style={styles.replyCloseSolid}
                  onPress={() => {
                    setEditing(null);
                    setEditText('');
                  }}
                  hitSlop={6}>
                  <Ionicons name="close" size={18} color={colors.white} />
                </TouchableOpacity>
              ) : (
                <GlassIconButton
                  name="close"
                  size={15}
                  circular
                  onPress={() => {
                    setEditing(null);
                    setEditText('');
                  }}
                />
              )}
            </View>
          ) : null}
          {!online ? (
            <View style={styles.offlineBar}>
              <Ionicons name="cloud-offline-outline" size={15} color="#fdba74" />
              <Text style={styles.offlineBarText}>{t('chat.offlineNotice')}</Text>
            </View>
          ) : null}
          {emojiOpen ? (
            <View
              ref={emojiRowRef}
              style={styles.emojiRowBar}
              onLayout={(e) => {
                slideRowWRef.current = e.nativeEvent.layout.width;
                slideRowHRef.current = e.nativeEvent.layout.height;
              }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              // السحب على الشريط نفسه ميتقطعش — القايمة فوقه ممكن
              // تسرق اللمس لما الصباع يطلع لفوق (نفس حماية زرار المايك)
              onResponderTerminationRequest={() => false}
              onResponderGrant={onSlideStart}
              onResponderMove={onSlideMove}
              onResponderRelease={onSlideRelease}
              onResponderTerminate={onSlideTerminate}>
              {EMOJI_QUICK.map((e, i) => (
                <SlideEmoji key={e} e={e} index={i} active={slideActive} />
              ))}
            </View>
          ) : null}
          {/* شريط الإرفاق الزجاجي (صورة/كاميرا/هدية) — زي الصورة المرجعية؛
              بيتفتح من + وبيتقفل بعد الاختيار أو الإرسال */}
          {attachOpen && phase === 'idle' && !editing ? (
            <View style={styles.attachBar}>
              <BlurView
                intensity={resolved === 'light' ? 20 : 32}
                tint={resolved === 'light' ? 'light' : 'dark'}
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { borderRadius: radius.full }]}
              />
              <GlassIconButton
                name="image-outline"
                size={22}
                circular
                onPress={() => void onAttach()}
              />
              <GlassIconButton
                name="camera-outline"
                size={22}
                circular
                onPress={() => void onCamera()}
              />
              <GlassIconButton
                name="gift-outline"
                size={22}
                circular
                onPress={() => {
                  setAttachOpen(false);
                  if (otherId) {
                    router.push({ pathname: '/gift-picker', params: { userId: otherId } });
                  }
                }}
              />
            </View>
          ) : null}
          <View style={styles.composer}>
            {/* أيقونة السلة بتظهر وتكبر كل ما السحب لليسار يقرّب من الإلغاء —
                بتتحدث من الـ SharedValue من غير إعادة رسم */}
            {phase === 'recording' ? (
              <Reanimated.View
                pointerEvents="none"
                style={[styles.recCancelIcon, trashAnimStyle]}>
                <Ionicons name="trash-outline" size={26} color={colors.danger} />
              </Reanimated.View>
            ) : null}
            {/* زرار + زجاجي دائري (بدل 📎) — نفس وظيفة الإرفاق،
                بس بالشكل المرجعي؛ بيختفي وقت التسجيل/التحرير */}
            {phase === 'idle' && !editing ? (
              <GlassIconButton
                name="add"
                size={24}
                circular
                onPress={() => setAttachOpen((v) => !v)}
              />
            ) : null}
            <View style={[styles.inputWrap, glowSoft]}>
              <BlurView
                intensity={resolved === 'light' ? 20 : 32}
                tint={resolved === 'light' ? 'light' : 'dark'}
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { borderRadius: radius.full }]}
              />
              {phase === 'recording' ? (
                <View style={styles.recIndicator}>
                  <PulseDot />
                  <Text style={styles.recTimer}>{recSeconds()}</Text>
                  <Text
                    style={[
                      styles.recHint,
                      recZone === 'cancel' && { color: colors.danger },
                    ]}
                    numberOfLines={1}>
                    {recZone === 'cancel'
                      ? t('chat.releaseToCancel')
                      : recZone === 'lock'
                        ? t('chat.releaseToLock')
                        : t('chat.recHint')}
                  </Text>
                </View>
              ) : (
                <>
                  <View
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    // لازم نرفض تسليم اللمس — من غير ده الشريط أو قايمة
                    // الرسايل بيسرقوا الضغطة أول ما الصباع يزحلق لفوق
                    // والشريط بيتقفل في نص السحب (نفس حماية زرار المايك)
                    onResponderTerminationRequest={() => false}
                    onResponderGrant={onEmojiGrant}
                    onResponderMove={onEmojiMove}
                    onResponderRelease={onEmojiRelease}
                    onResponderTerminate={onEmojiTerminate}
                    style={{ padding: 4, margin: -4 }}>
                    <View style={{ transform: [{ scale: emojiPressed ? 1.15 : 1 }] }}>
                      <Text style={{ fontSize: 22 }}>{quickEmoji}</Text>
                    </View>
                  </View>
                  <TextInput
                    ref={inputRef}
                    value={editing ? editText : text}
                    onChangeText={editing ? onTypeEdit : onType}
                    placeholder={editing ? t('chat.editHint') : t('chat.typeMessage')}
                    placeholderTextColor={colors.muted}
                    cursorColor={colors.primaryBright}
                    selectionColor={colors.primaryBright}
                    style={styles.input}
                    multiline
                  />
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
                onResponderTerminationRequest={() => false}
                onResponderGrant={recGrant}
                onResponderMove={recMove}
                onResponderRelease={recRelease}
                onResponderTerminate={recTerminate}
                style={{ padding: 4, margin: -4 }}>
                {/* القفل فوق زرار المايك نفسه — مربوط بالمايك مش بموضع
                    ثابت في الشاشة، فبيظهر فوقه على طول زي واتساب */}
                {phase === 'recording' ? (
                  <Reanimated.View
                    pointerEvents="none"
                    style={[styles.recLockIcon, lockAnimStyle]}>
                    <Ionicons name="chevron-up" size={16} color={colors.muted} />
                    <Ionicons
                      name={recZone === 'lock' ? 'lock-closed' : 'lock-open-outline'}
                      size={26}
                      color={colors.primaryBright}
                    />
                  </Reanimated.View>
                ) : null}
                {/* الزرار بيكبر ×1.4 من أول لحظة الضغط ويفضل كبير طول
                    الضغطة، وبيبقى زجاجي بنفسجي وهو بيسجّل */}
                <View
                  style={[
                    styles.micBtn,
                    (phase === 'recording' || micPressed) && styles.micBtnHeld,
                    micPressed && { transform: [{ scale: 1.4 }] },
                  ]}>
                  <Ionicons
                    name="mic"
                    size={26}
                    color={
                      phase === 'recording' || micPressed
                        ? colors.primaryBright
                        : colors.white
                    }
                  />
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
            {actionMsg &&
            actionMsg.sender_id === me.id &&
            actionMsg.type === 'text' &&
            !actionMsg.is_deleted ? (
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
            {actionMsg && !actionMsg.is_deleted ? (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setActionMsg(null);
                  setDeleteMsg(actionMsg);
                }}>
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

      {/* اختيار نوع الحذف: "لدي" (بتختفي عندي بس) أو "لدي الجميع"
          (بتمسح من الطرفين) — رسايل غيري ملهاش إلا "لدي" */}
      <Modal
        transparent
        visible={!!deleteMsg}
        animationType="fade"
        onRequestClose={() => setDeleteMsg(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setDeleteMsg(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => deleteMsg && void deleteForMe(deleteMsg)}>
              <GlassIconChip name="eye-off-outline" />
              <Text style={styles.sheetRowText}>{t('chat.deleteForMe')}</Text>
            </TouchableOpacity>
            {deleteMsg && deleteMsg.sender_id === me.id ? (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => deleteMsg && void sheetDelete(deleteMsg)}>
                <GlassIconChip name="trash-outline" danger />
                <Text style={[styles.sheetRowText, { color: colors.danger }]}>
                  {t('chat.deleteForEveryone')}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => setDeleteMsg(null)}>
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
/** إيموجي واحد في شريط السحب — بيكبر بنابض لما الصبع يعدّي عليه
 *  (النشط ×1.7 ويطلع لفوق شوية، واللي جنبه ×1.2) زي فيسبوك */
function SlideEmoji({ e, index, active }: { e: string; index: number; active: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(active.value - index);
    const isActive = active.value === index;
    const target = isActive ? 1.7 : d === 1 ? 1.2 : 1;
    return {
      transform: [
        { scale: withSpring(target, { damping: 14, stiffness: 260 }) },
        { translateY: withSpring(isActive ? -8 : 0, { damping: 14, stiffness: 260 }) },
      ],
    };
  });
  return (
    <Reanimated.View
      style={[{ width: 44, height: 48, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontSize: 26 }}>{e}</Text>
    </Reanimated.View>
  );
}

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

/** موجة صوتية حية لواجهة التسجيل بالنقرة — من الـ metering بتاع
 *  expo-audio (dBFS) لما يكون متاح، وإلا نبضة متحركة خفيفة (شكل بس).
 *  بتتجمد لما التسجيل يتوقف مؤقتًا. */
const REC_WAVE_BARS = 36;
function RecWaveform({ metering, paused }: { metering?: number; paused: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [levels, setLevels] = useState<number[]>(() => Array(REC_WAVE_BARS).fill(0.15));
  const meteringRef = useRef(metering);
  useEffect(() => {
    meteringRef.current = metering;
  }, [metering]);
  const tickRef = useRef(0);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      tickRef.current += 1;
      const tick = tickRef.current;
      const m = meteringRef.current;
      setLevels((prev) => {
        const next = [...prev.slice(1)];
        if (m !== undefined && m > -160) {
          // dBFS (-160 صمت .. 0 أعلى صوت) → 0..1
          const base = Math.min(1, Math.max(0.08, (m + 55) / 55));
          next.push(base * (0.85 + 0.3 * Math.abs(Math.sin(tick * 1.3))));
        } else {
          next.push(0.3 + 0.18 * Math.sin(tick / 3) + 0.1 * Math.sin(tick / 1.7));
        }
        return next;
      });
    }, 140);
    return () => clearInterval(id);
  }, [paused]);
  return (
    <View style={styles.waveBars}>
      {levels.map((lv, i) => (
        <View
          key={i}
          style={{
            width: 3,
            height: Math.max(5, Math.round(lv * 30)),
            borderRadius: 2,
            backgroundColor: i === levels.length - 1 ? colors.primaryBright : colors.accent,
            opacity: 0.45 + lv * 0.55,
          }}
        />
      ))}
    </View>
  );
}

/** سهم الرد بالسحب: مخفي تمامًا والرسالة واقفة (شفافيته = تقدّم السحب،
 *  0 عند الوقوف و1 عند السحب الكامل) — عشان الفقاعة الزجاجية شفافة
 *  والسهم اللي وراها كان باين من خلالها على كل رسالة جديدة.
 *  بيظهر تدريجيًا مع السحب بس، والرد نفسه زي ما هو. */
function SwipeReplyArrow({
  progress,
  glyph,
  style,
}: {
  progress: SharedValue<number>;
  glyph: string;
  style?: StyleProp<ViewStyle>;
}) {
  const anim = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Reanimated.View style={[style, anim]}>
      <Text style={{ fontSize: 19 }}>{glyph}</Text>
    </Reanimated.View>
  );
}

const MessageBubble = React.memo(function MessageBubble({
  m,
  mine,
  avatarUri,
  avatarName,
  gift,
  replyName,
  replySnippet,
  reactions,
  onReactPress,
  onGiftPress,
  onMediaPress,
  onLongPress,
  onQuotePress,
  highlighted,
  dataSaver,
  forceLoad,
  onLoadMedia,
}: {
  m: Message;
  mine: boolean;
  /** أفاتار الطرف التاني — بيظهر جنب الفقاعات المستلمة زي الصورة المرجعية */
  avatarUri?: string | null;
  avatarName?: string;
  gift?: GiftInfo;
  replyName?: string;
  replySnippet?: string;
  reactions: { emoji: string; count: number; mine: boolean }[];
  onReactPress: (m: Message, emoji: string) => void;
  onGiftPress?: (gift: GiftInfo) => void;
  onMediaPress: (url: string, kind: 'image' | 'video') => void;
  onLongPress: (m: Message) => void;
  /** الضغطة على اقتباس الرد — بتنطّ للرسالة الأصلية (زي واتساب) */
  onQuotePress?: (replyToId: string) => void;
  /** متظللة بعد النطّ ليها من اقتباس (وميض ذهبي مؤقت) */
  highlighted?: boolean;
  /** توفير البيانات: الصورة متنزلش تلقائيًا لحد ما المستخدم يدوس عليها */
  dataSaver: boolean;
  /** المستخدم داس "تحميل" على الصورة دي */
  forceLoad: boolean;
  onLoadMedia: (id: string) => void;
}) {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  /** توهج نيون خفيف حوالين الفقاعة (فاتح: ظل بنفسجي أهدى) */
  const glowSoft = useMemo(
    () => (resolved === 'light' ? lightShadowGlowSoft : shadowGlowSoft),
    [resolved],
  );
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

  /** إيموجي بس من غير كلام ولا رد — من غير فقاعة (زي واتساب) */
  const emojiOnly =
    m.type === 'text' && !m.is_deleted && !m.reply_to_id && isEmojiOnly(m.body ?? '');
  const emojiCount = emojiOnly
    ? Array.from((m.body ?? '').trim().replace(/[\uFE0F\u200D]/g, '')).length
    : 0;

  const bubbleStyle: StyleProp<ViewStyle> = [
    styles.bubble,
    mine ? styles.bubbleMine : styles.bubbleOther,
    glowSoft,
    highlighted ? styles.bubbleHighlight : null,
  ];
  const bubbleInner = (
    <>
        {!m.is_deleted && m.reply_to_id ? (
          <TouchableOpacity
            style={styles.quote}
            activeOpacity={0.7}
            onPress={() => m.reply_to_id && onQuotePress?.(m.reply_to_id)}
            onLongPress={() => onLongPress(m)}>
            <Text style={styles.quoteName} numberOfLines={1}>
              {replyName ?? ''}
            </Text>
            <Text style={styles.quoteText} numberOfLines={1}>
              {replySnippet ?? ''}
            </Text>
          </TouchableOpacity>
        ) : null}
        {m.is_deleted ? (
          <Text style={styles.deleted}>🚫 {t('chats.deleted')}</Text>
        ) : m.type === 'text' ? (
          <Text style={[styles.msgText, mine && { color: colors.white }]}>{m.body}</Text>
        ) : m.type === 'image' ? (
          dataSaver && !forceLoad ? (
            <TouchableOpacity onPress={() => onLoadMedia(m.id)} style={styles.tapToLoad}>
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
        <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.7)' }]}>
          {time}
          {m.edited_at ? ` • ${t('chat.edited')}` : ''}
          {mine && !m.is_deleted ? (m.read_at ? ' ✓✓' : ' ✓') : ''}
        </Text>
        {/* التفاعلات: شارة عائمة صغيرة فوق زاوية الفقاعة السفلية —
            مش صف تحت المحتوى (فالفقاعة ما بتكبرش لما يتضاف تفاعل).
            جوّه حدود الفقاعة عشان Swipeable بيقصّ اللي برّه (overflow hidden).
            كل الإيموجي في نفس الشارة، والعدد بيظهر لما يتكرر إيموجي واحد.
            الضغطة بتبدّل التفاعل الأول المعروض (زي الضغطة على الشريحة قبل كده). */}
        {reactions.length ? (
          <TouchableOpacity
            style={styles.reactionBadge}
            activeOpacity={0.8}
            onPress={() => onReactPress(m, reactions[0].emoji)}>
            <Text style={styles.reactionBadgeText}>
              {reactions.map((r) => r.emoji).join('')}
              {reactions.length === 1 && reactions[0].count > 1
                ? ` ${reactions[0].count}`
                : ''}
            </Text>
          </TouchableOpacity>
        ) : null}
    </>
  );
  if (emojiOnly) {
    return (
      <TouchableOpacity onLongPress={() => onLongPress(m)} activeOpacity={0.85}>
        <View style={[styles.emojiOnlyWrap, mine ? styles.emojiOnlyMine : styles.emojiOnlyOther]}>
          <Text
            style={{
              fontSize: emojiCount === 1 ? 56 : 44,
              lineHeight: emojiCount === 1 ? 64 : 52,
            }}>
            {m.body}
          </Text>
          <View style={styles.emojiOnlyMeta}>
            <Text style={styles.emojiOnlyTime}>
              {time}
              {m.edited_at ? ` • ${t('chat.edited')}` : ''}
              {mine && !m.is_deleted ? (m.read_at ? ' ✓✓' : ' ✓') : ''}
            </Text>
            {reactions.length ? (
              <TouchableOpacity
                style={styles.emojiOnlyBadge}
                activeOpacity={0.8}
                onPress={() => onReactPress(m, reactions[0].emoji)}>
                <Text style={styles.reactionBadgeText}>
                  {reactions.map((r) => r.emoji).join('')}
                  {reactions.length === 1 && reactions[0].count > 1
                    ? ` ${reactions[0].count}`
                    : ''}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onLongPress={() => onLongPress(m)} activeOpacity={0.85}>
      <View style={!mine ? styles.receivedRow : undefined}>
        {!mine ? <Avatar uri={avatarUri} name={avatarName} size={28} /> : null}
        {mine ? (
          <LinearGradient
            colors={SENT_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={bubbleStyle}>
            {bubbleInner}
          </LinearGradient>
        ) : (
          <View style={bubbleStyle}>{bubbleInner}</View>
        )}
      </View>
    </TouchableOpacity>
  );
});

/** فقاعة رسالة معلّقة (أوفلاين): شفافة شوية، بعلامة ساعة، بتتبعت لما النت يرجع */
const PendingBubble = React.memo(function PendingBubble({ item }: { item: OutboxItem }) {
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
  // إيموجي بس معلّق: من غير فقاعة زي واتساب
  if (item.type === 'text' && isEmojiOnly(item.body ?? '')) {
    return (
      <View
        style={{
          alignSelf: 'flex-end',
          maxWidth: '75%',
          marginBottom: 10,
          opacity: 0.65,
        }}>
        <Text style={{ fontSize: 48, lineHeight: 56 }}>{item.body}</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 3,
            marginTop: 3,
          }}>
          <Ionicons name="time-outline" size={11} color={colors.muted} />
          <Text style={[styles.time, { marginTop: 0 }]}>{t('chat.sending')}</Text>
        </View>
      </View>
    );
  }
  return (
    <View
      style={{
        alignSelf: 'flex-end',
        maxWidth: '75%',
        marginBottom: 10,
        opacity: 0.65,
      }}>
      <LinearGradient
        colors={SENT_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.bubble, styles.bubbleMine]}>
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
      </LinearGradient>
    </View>
  );
});

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  /** الترويسة: شريط زجاجي عائم (مش لازق في السقف) زي الصورة المرجعية —
   *  الـ BlurView جوّاه، والخلفية الشفافة احتياطي لو الـ blur مش متاح */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 60,
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
    borderRadius: radius.full,
    backgroundColor: colors.glass,
    overflow: 'hidden',
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
  /** «متصل الآن» في هيدر الشات — من الثيم مش لون ثابت: أخضر غامق
   *  في النهار (واضح على الزجاج الفاتح ومريح للعين) وأخضر ساطع
   *  في الوضع الليلي؛ اللون الفاتح الثابت #4ade80 كان بيبهت في النهار */
  statusOnline: { color: colors.success, fontSize: fonts.sizes.xs, marginTop: 1 },
  statusSeen: { color: colors.faint, fontSize: fonts.sizes.xs, marginTop: 1 },
  /** شارة التفاعل العائمة: دايرة غامقة صغيرة فوق زاوية الفقاعة السفلية
   *  (جوّه حدود الفقاعة عشان Swipeable بيقصّ اللي برّه) */
  reactionBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  reactionBadgeText: { fontSize: 13, color: colors.white },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,0,8,0.6)',
    justifyContent: 'flex-end',
    // على الويب: ثبّت الخلفية على الشاشة — من غيره حاوية الـ Modal
    // بتتمدد بطول الصفحة والورقة بتنزل تحت وبتتقص (قايمة الشات الـ 6 عناصر)
    ...(Platform.OS === 'web'
      ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 } as unknown as ViewStyle)
      : null),
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    // على الشاشات العريضة الورقة بعرض محدود ومتمركزة بدل ما تملأ العرض كله
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    // حد أقصى للارتفاع + مسافة من حافة الشاشة عشان القايمة الطويلة ما تتقصش
    maxHeight: '88%',
    marginBottom: spacing.lg,
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
    backgroundColor: colors.glass,
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
  /** زرار إلغاء الرد/التعديل في النهار — دايرة بنفسجي ثابتة × بيضاء (الزجاجي مش باين على الفاتح) */
  replyCloseSolid: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyBarText: { color: colors.text, fontSize: fonts.sizes.sm, marginTop: 1 },
  quote: {
    backgroundColor: 'rgba(0,0,0,0.45)',
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
  quoteText: { color: colors.white, fontSize: fonts.sizes.xs, marginTop: 1 },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  /** المرسلة: تدرج بنفسجي → فوشيا (زي الصورة المرجعية) — بيتطبق بـ
   *  LinearGradient، فمفيش backgroundColor هنا؛ حد نيون + توهج خفيف */
  bubbleMine: {
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
    borderBottomEndRadius: 6,
  },
  /** صف الرسالة المستلمة: أفاتار صغير جنب الفقاعة (زي الصورة المرجعية) */
  receivedRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  /** المستلمة: زجاجية بحد نيون وذيل مدوّر ناعم — نفس لغة التطبيق */
  bubbleOther: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
    borderBottomStartRadius: 6,
    // الرسالة الطويلة كانت بتفضل سطر واحد أعرض من الشاشة وبتتقصّ
    // (الأفاتار جنبها في صف، والفقاعة مبتتقلصش) — flexShrink بيخليها
    // تاخد العرض المتاح والنص يلف على كذا سطر
    flexShrink: 1,
  },
  /** وميض النطّ للرسالة الأصلية: حد ذهبي سميك مؤقت (باين على الفقاعتين) */
  bubbleHighlight: {
    borderWidth: 2,
    borderColor: colors.gold,
  },
  msgText: { color: colors.text, fontSize: fonts.sizes.md, lineHeight: 22 },
  /** رسالة إيموجي بس: من غير فقاعة (زي واتساب) — إيموجي كبير والوقت صغير تحته */
  emojiOnlyWrap: { marginBottom: 2 },
  emojiOnlyMine: { alignItems: 'flex-end' },
  emojiOnlyOther: { alignItems: 'flex-start' },
  emojiOnlyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  emojiOnlyTime: { color: colors.muted, fontSize: 10 },
  emojiOnlyBadge: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  deleted: { color: colors.faint, fontStyle: 'italic', fontSize: fonts.sizes.sm },
  time: { color: colors.muted, fontSize: 10, marginTop: 3, textAlign: 'right' },
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
    // شفاف عشان خلفية الشات تبان ورا البوكس (زي الصورة المرجعية)
    backgroundColor: 'transparent',
  },
  input: {
    flex: 1,
    color: colors.text,
    paddingVertical: 9,
    maxHeight: 110,
    fontSize: fonts.sizes.md,
    textAlign: 'left',
    // على الويب: من غير الإطار المستطيل اللي المتصفح بيرسمه حوالين
    // حقل الكتابة لما ياخد تركيز — يفضل بس خط المؤشر الوامض زي واتساب.
    // outlineWidth: 0 لوحده ما شالوش (اتأكدنا لايف إن المستطيل لسه بيظهر)
    // فلازم outlineStyle: 'none' — نفس اللي React Native Web نفسه
    // بيستخدمه — والـ cast عشان 'none' مش في اتحاد أنواع RN.
    outlineWidth: 0,
    outlineStyle: 'none' as 'solid',
    // فوق طبقة الـ BlurView: من غير zIndex نص الكتابة بيترسم تحت البلور
    // فبيتغطى وبيبان مش موجود — البلور لازم يبقى تحت الكتابة مش فوقها
    zIndex: 1,
  },
  /** حقل الكتابة الدائري: زجاجي بحد نيون وتوهج خفيف — زي المرجع */
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
  },
  /** شريط الإرفاق الزجاجي (صورة/كاميرا/هدية) — زي الصورة المرجعية */
  attachBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
    borderRadius: radius.full,
    backgroundColor: colors.glass,
    overflow: 'hidden',
  },
  /** فاصل التاريخ في نص الشات — نفس حد النيون لباقي الشاشة */
  datePill: {
    alignSelf: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorderStrong,
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
    backgroundColor: colors.glass,
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
    // من غير أي خلفية أو حدود — الإيموجي بتطفو لوحدها على خلفية الشاشة
    // (طلب Alex 2026-11-27: "ميكون في باك جرواند لي الاموجي الي بختار منهم")
    backgroundColor: 'transparent',
  },
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
  /** زرار المايك: دايرة كبيرة منفصلة عن شريط الكتابة زي واتساب */
  micBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** المايك وهو بيسجّل: زجاجي بنفسجي (بيكبر ×1.4 من الـ transform) */
  micBtnHeld: {
    backgroundColor: colors.glass,
    borderWidth: 2,
    borderColor: colors.primaryBright,
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
  /** أيقونة القفل فوق زرار المايك نفسه (باهتة طول الضغطة وبتتملي
   *  تدريجيًا كل ما السحب لفوق يقرّب من القفل) — مربوطة بالمايك
   *  بـ bottom: 100% فمستحيل تظهر في الناحية التانية من الشاشة */
  recLockIcon: {
    position: 'absolute',
    bottom: '100%',
    alignSelf: 'center',
    marginBottom: 6,
    zIndex: 1,
    alignItems: 'center',
  },
  /** واجهة التسجيل بالنقرة (موحدة: نقرة واحدة أو قفل بالسحب لفوق) */
  tapRecorder: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.stroke,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  tapWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  waveBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 32,
  },
  recDotPaused: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  tapHint: {
    color: colors.muted,
    fontSize: fonts.sizes.xs,
    textAlign: 'center',
  },
  tapControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tapPausePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  tapPauseText: {
    color: colors.text,
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.bold,
  },
  tapSendBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedBar: {
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.stroke,
  },
});
