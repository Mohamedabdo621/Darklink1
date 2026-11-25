import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  fetchReactions,
  fetchReplyPreview,
  markConversationRead,
  mediaSignedUrl,
  REACTION_EMOJIS,
  sendMediaMessage,
  sendTextMessage,
  sendVoiceMessage,
  softDeleteMessage,
  toggleReaction,
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
  const inputRef = useRef<any>(null);
  const swipeRefs = useRef(new Map<string, { close: () => void }>());
  const [reactions, setReactions] = useState<
    Record<string, { emoji: string; count: number; mine: boolean }[]>
  >({});
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [typing, setTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const channelRef = useRef<any>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

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
    setReactions(await fetchReactions(msgs.map((m) => m.id), me.id));
    await markConversationRead(conversationId);
  }, [conversationId, me, loadGiftInfo]);

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
    const channel = supabase
      .channel(`chat-${conversationId}`)
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
    channelRef.current = channel;
    const rChannel = supabase
      .channel(`reactions-${conversationId}`)
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

  /** كتابة: تحديث النص + بث «بيكتب» مثبّتًا كل ٢.٥ ثانية */
  const onType = (v: string) => {
    setText(v);
    if (v.trim() && Date.now() - lastTypingSent.current > 2500) {
      lastTypingSent.current = Date.now();
      channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { from: me.id },
      });
    }
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
    Haptics.selectionAsync().catch(() => {});
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
                  {t('chat.lastSeen')}{' '}
                  {new Date(other.last_seen_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              )
            ) : null}
          </View>
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
              reactions={reactions[item.id] ?? []}
              onReactPress={(emoji) => onReact(item, emoji)}
              onMediaPress={(url, kind) =>
                router.push({
                  pathname: '/media-viewer',
                  params: { url, type: kind },
                })
              }
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
            onChangeText={onType}
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
                <Text style={styles.sheetRowText}>↩ {t('chat.reply')}</Text>
              </TouchableOpacity>
            ) : null}
            {actionMsg && actionMsg.sender_id === me.id && !actionMsg.is_deleted ? (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => sheetDelete(actionMsg)}>
                <Text style={[styles.sheetRowText, { color: colors.danger }]}>
                  🗑 {t('chat.deleteMessage')}
                </Text>
              </TouchableOpacity>
            ) : null}
            {actionMsg && actionMsg.sender_id !== me.id ? (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => sheetReport(actionMsg)}>
                <Text style={styles.sheetRowText}>🚩 {t('chat.reportMessage')}</Text>
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
    </View>
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
  onMediaPress,
  onLongPress,
}: {
  m: Message;
  mine: boolean;
  gift?: GiftInfo;
  replyName?: string;
  replySnippet?: string;
  reactions: { emoji: string; count: number; mine: boolean }[];
  onReactPress: (emoji: string) => void;
  onMediaPress: (url: string, kind: 'image' | 'video') => void;
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
            <TouchableOpacity onPress={() => onMediaPress(mediaUrl, 'image')}>
              <Image source={{ uri: mediaUrl }} style={styles.mediaImg} resizeMode="cover" />
            </TouchableOpacity>
          ) : (
            <Text style={styles.msgText}>🖼 …</Text>
          )
        ) : m.type === 'video' ? (
          <TouchableOpacity onPress={() => mediaUrl && onMediaPress(mediaUrl, 'video')}>
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
  sheetRow: { paddingVertical: 13 },
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
