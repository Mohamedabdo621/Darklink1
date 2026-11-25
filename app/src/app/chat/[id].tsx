import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
import { useAuth } from '../../contexts/AuthContext';
import { giftImage } from '../../lib/giftAssets';
import { supabase } from '../../lib/supabase';
import type { Message, PublicProfile, ReplyPreview } from '../../lib/types';
import {
  fetchMessages,
  fetchReplyPreview,
  markConversationRead,
  mediaSignedUrl,
  sendMediaMessage,
  sendTextMessage,
  sendVoiceMessage,
  softDeleteMessage,
  uploadChatFile,
} from '../../services/chat';
import { avatarSignedUrl } from '../../services/profile';
import {
  fetchPublicProfile,
  isBlockedByMe,
  reportUser,
} from '../../services/social';
import { colors, fonts, radius, spacing } from '../../theme';

interface GiftInfo {
  name_key: string;
  asset: string;
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [otherAvatar, setOtherAvatar] = useState<string | null>(null);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [giftMap, setGiftMap] = useState<Record<string, GiftInfo>>({});
  const [text, setText] = useState('');
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inputRef = useRef<any>(null);
  const swipeRefs = useRef(new Map<string, { close: () => void }>());

  // ---- التسجيل الصوتي
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewDur, setPreviewDur] = useState(0);
  const listRef = useRef<FlatList<Message>>(null);

  const loadGiftInfo = useCallback(async (msgs: Message[]) => {
    const ids = msgs.map((m) => m.gift_send_id).filter(Boolean) as string[];
    if (!ids.length) return;
    const { data } = await supabase
      .from('gift_sends')
      .select('id, gift:gifts(name_key, asset)')
      .in('id', ids);
    if (!data) return;
    const map: Record<string, GiftInfo> = {};
    for (const row of data as unknown as {
      id: string;
      gift: GiftInfo | null;
    }[]) {
      if (row.gift) map[row.id] = row.gift;
    }
    setGiftMap((prev) => ({ ...prev, ...map }));
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
    }
    const msgs = await fetchMessages(conversationId);
    setMessages(msgs);
    loadGiftInfo(msgs);
    await markConversationRead(conversationId);
  }, [conversationId, me, loadGiftInfo]);

  useEffect(() => {
    // تحميل المحادثة عند الفتح (نمط جلب بيانات قياسي)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (!conversationId || !me) return;
    const channel = supabase
      .channel(`chat-${conversationId}`)
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
            loadGiftInfo([row]);
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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, me, loadGiftInfo]);

  if (!me || !conversationId) return <View style={styles.root} />;

  const failSend = () => appAlert(t('common.error'), t('chat.blockedNotice'));

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

  const startReply = (m: Message) => {
    if (m.is_deleted) return;
    setReplyTo(m);
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 60);
  };

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

  const onSendText = async () => {
    if (!text.trim() || sending) return;
    const body = text;
    const replyId = replyTo?.id ?? null;
    setText('');
    setSending(true);
    const m = await sendTextMessage(conversationId, me.id, body, replyId);
    setSending(false);
    if (!m) {
      setText(body);
      failSend();
      return;
    }
    setReplyTo(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMessages((prev) =>
      prev.some((x) => x.id === m.id) ? prev : [attachReply(m), ...prev],
    );
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
    const isVideo = asset.type === 'video';
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
        replyTo?.id ?? null,
      );
      if (m) {
        setMessages((prev) => [attachReply(m), ...prev]);
        setReplyTo(null);
      } else failSend();
    }
    setSending(false);
  };

  const startRecording = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      appAlert(t('common.error'), t('chat.micDenied'));
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setPhase('recording');
  };

  const stopRecording = async () => {
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) {
      setPhase('idle');
      return;
    }
    setPreviewUri(uri);
    setPreviewDur(Math.max(1, Math.round(recState.durationMillis / 1000)));
    setPhase('preview');
  };

  const sendRecording = async () => {
    if (!previewUri) return;
    setSending(true);
    const path = await uploadChatFile(
      'voice-notes',
      conversationId,
      me.id,
      previewUri,
      'm4a',
      'audio/mp4',
    );
    if (path) {
      const m = await sendVoiceMessage(
        conversationId,
        me.id,
        path,
        previewDur,
        replyTo?.id ?? null,
      );
      if (m) {
        setMessages((prev) => [attachReply(m), ...prev]);
        setReplyTo(null);
      } else failSend();
    }
    setSending(false);
    setPreviewUri(null);
    setPhase('idle');
  };

  const onLongPress = (m: Message) => {
    const mine = m.sender_id === me.id;
    const options: {
      text: string;
      style?: 'destructive' | 'cancel';
      onPress?: () => void;
    }[] = [
      { text: t('common.cancel'), style: 'cancel' },
    ];
    if (!m.is_deleted) {
      options.unshift({
        text: `↩ ${t('chat.reply')}`,
        onPress: () => startReply(m),
      });
    }
    if (mine && !m.is_deleted) {
      options.unshift({
        text: t('chat.deleteMessage'),
        style: 'destructive',
        onPress: async () => {
          if (await softDeleteMessage(m.id)) {
            setMessages((prev) =>
              prev.map((x) =>
                x.id === m.id ? { ...x, is_deleted: true, body: null, media_path: null } : x,
              ),
            );
          }
        },
      });
    }
    if (!mine) {
      options.unshift({
        text: t('chat.reportMessage'),
        onPress: () => {
          appPrompt(t('userProfile.report'), t('userProfile.reportReason'), t('common.send'), async (reason) => {
            if (!reason?.trim()) return;
            if (await reportUser(me.id, m.sender_id, reason.trim(), m.id)) {
              appAlert('✓', t('userProfile.reportSent'));
            }
          });
        },
      });
    }
    appAlert('', '', options);
  };

  return (
    <View style={styles.root}>
      {/* الترويسة */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: colors.text, fontSize: 20 }}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}
          onPress={() =>
            otherId && router.push({ pathname: '/user/[id]', params: { id: otherId } })
          }>
          {otherAvatar ? (
            <Image source={{ uri: otherAvatar }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.avatarFallback]}>
              <Text>👤</Text>
            </View>
          )}
          <Text style={styles.headerName}>
            {other?.shown_name ?? '...'}
            {other?.is_vip ? ' 👑' : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() =>
            otherId &&
            router.push({ pathname: '/gift-picker', params: { userId: otherId } })
          }>
          <Text style={{ fontSize: 22 }}>🎁</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {/* الرسائل */}
      <FlatList
        ref={listRef}
        data={messages}
        inverted
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        renderItem={({ item }) => {
          const mine = item.sender_id === me.id;
          const bubble = (
            <MessageBubble
              m={item}
              mine={mine}
              gift={item.gift_send_id ? giftMap[item.gift_send_id] : undefined}
              replyName={item.reply_preview ? nameFor(item.reply_preview.sender_id) : undefined}
              replySnippet={item.reply_preview ? snippetFor(item.reply_preview) : undefined}
              onLongPress={() => onLongPress(item)}
            />
          );
          if (item.is_deleted) {
            return (
              <View
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                }}>
                {bubble}
              </View>
            );
          }
          return (
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
                maxWidth: '82%',
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
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
            <Text style={{ color: colors.muted, fontSize: 17 }}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* منطقة الإدخال */}
      {blockedByMe ? (
        <View style={styles.blockedBar}>
          <Text style={{ color: colors.danger }}>{t('chat.blockedNotice')}</Text>
        </View>
      ) : phase === 'recording' ? (
        <View style={styles.composer}>
          <Text style={{ color: colors.danger, flex: 1 }}>
            🔴 {t('chat.recording')} {Math.floor(recState.durationMillis / 1000)}s
          </Text>
          <TouchableOpacity onPress={() => { recorder.stop(); setPhase('idle'); }}>
            <Text style={{ fontSize: 22 }}>🗑</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={stopRecording} style={styles.sendBtn}>
            <Text style={{ fontSize: 18 }}>✔</Text>
          </TouchableOpacity>
        </View>
      ) : phase === 'preview' ? (
        <View style={styles.composer}>
          <Text style={{ color: colors.muted, flex: 1 }}>
            🎤 {previewDur}s — {t('chat.tapSendOrCancel')}
          </Text>
          <TouchableOpacity onPress={() => { setPreviewUri(null); setPhase('idle'); }}>
            <Text style={{ fontSize: 22 }}>🗑</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={sendRecording} style={styles.sendBtn}>
            <Text style={{ fontSize: 18 }}>➤</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.composer}>
          <TouchableOpacity onPress={onAttach}>
            <Text style={{ fontSize: 24 }}>📎</Text>
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder={t('chat.typeMessage')}
            placeholderTextColor={colors.faint}
            style={styles.input}
            multiline
          />
          {text.trim() ? (
            <TouchableOpacity onPress={onSendText} style={styles.sendBtn}>
              <Text style={{ fontSize: 18 }}>➤</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPressIn={startRecording}
              style={[styles.sendBtn, { backgroundColor: colors.magenta }]}>
              <Text style={{ fontSize: 18 }}>🎤</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      </KeyboardAvoidingView>
    </View>
  );
}

function MessageBubble({
  m,
  mine,
  gift,
  replyName,
  replySnippet,
  onLongPress,
}: {
  m: Message;
  mine: boolean;
  gift?: GiftInfo;
  replyName?: string;
  replySnippet?: string;
  onLongPress: () => void;
}) {
  const { t } = useTranslation();
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if ((m.type === 'image' || m.type === 'video') && m.media_path) {
      mediaSignedUrl('chat-media', m.media_path).then((u) => {
        if (live) setMediaUrl(u);
      });
    }
    return () => {
      live = false;
    };
  }, [m.type, m.media_path]);

  const time = new Date(m.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

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
          mediaUrl ? (
            <Image source={{ uri: mediaUrl }} style={styles.mediaImg} resizeMode="cover" />
          ) : (
            <Text style={styles.msgText}>🖼 …</Text>
          )
        ) : m.type === 'video' ? (
          <TouchableOpacity onPress={() => mediaUrl && Linking.openURL(mediaUrl)}>
            <View style={[styles.mediaImg, styles.videoTile]}>
              <Text style={{ fontSize: 40 }}>▶️</Text>
              <Text style={{ color: colors.white, fontSize: fonts.sizes.xs }}>
                {t('chats.video')}
              </Text>
            </View>
          </TouchableOpacity>
        ) : m.type === 'voice' ? (
          <VoiceBubble mediaPath={m.media_path} durationSec={m.voice_duration} mine={mine} />
        ) : m.type === 'gift' ? (
          <View style={{ alignItems: 'center', gap: 4 }}>
            {gift && giftImage(gift.asset) ? (
              <Image source={giftImage(gift.asset)} style={styles.giftImg} />
            ) : (
              <Text style={{ fontSize: 40 }}>🎁</Text>
            )}
            <Text style={[styles.msgText, mine && { color: colors.white }]}>
              {gift ? t(`gifts.${gift.name_key}`) : t('chats.gift')}
            </Text>
          </View>
        ) : null}
        <Text style={[styles.time, mine && { color: 'rgba(255,255,255,0.7)' }]}>
          {time}
          {mine && !m.is_deleted ? (m.read_at ? ' ✓✓' : ' ✓') : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
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
  bubbleMine: { backgroundColor: colors.primary, borderBottomEndRadius: 4 },
  bubbleOther: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderBottomStartRadius: 4,
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
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.full,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    maxHeight: 110,
    fontSize: fonts.sizes.md,
    textAlign: 'left',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
