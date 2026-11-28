// ============================================================
// DARKLINK AI — شاشة المساعد الذكي (محادثة + سجل)
// قاعدة صارمة: لا يظهر اسم أي مزود للمستخدم أبدًا —
// الواجهة والرسائل والأخطاء تقول "Darklink AI" فقط.
// فقاعات المستخدم: تدرج بنفسجي غامق→فوشيا + نص أبيض (لا فقاعات
// فاتحة/شفافة — اترفضت مرتين). رسائل المساعد: زجاجية.
// لا BlurView هنا أصلًا (بيحجب اللمس والنص) — زجاج عادي فقط.
// الأفاتار هو Nova المتحرك (GIF شفاف، 100 فريم) — السبعة في
// assets/nova-*.gif: greeting للترحيب، idle للهيدر وجنب رسايل
// المساعد، thinking بدل مؤشر النقاط، error لحالة الفشل،
// وanswering/celebrate/dontknow محجوزين لمحفزات جاية (مش
// متوصلين لسلوك ظاهر لسه). الصور الثابتة القديمة اتشالت —
// كل الأفاتار من الـ GIFs دي بس.
// thinking وerror بيتحملوا مسبقًا من أول ما الشاشة تتفتح (صورتين
// مخفيتين 1×1) — لأنهم بيتركبوا بس لما يُحتاجوا، والملف ~1.9MB
// مكانش بيلحق يتحمل قبل ما فقاعة الانتظار تختفي.
// رسايل المساعد بتعدّي على isolateLtrRuns قبل الماركداون — الروابط
// والمعرّفات (@...) بتتغلّف بعلامات LRI/PDI عشان خوارزمية الاتجاه
// ماتعكسهاش جوه العربي (كانت «@darklink.app» بتظهر «darklink.app@»
// واللينك بيظهر بسلاش في الأول ومقطوع على الموبايل).
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  I18nManager,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import Markdown from 'react-native-markdown-display';
import { useTranslation } from 'react-i18next';
import { Screen } from '../components/ui';
import { Skeleton, SkeletonChatRow } from '../components/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
import { fonts, gradients, radius, spacing } from '../theme';
import { supabase } from '../lib/supabase';
import { appAlert } from '../lib/dialog';

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface AiConversation {
  id: string;
  title: string | null;
  updated_at: string;
}

const MAX_INPUT = 2000;
const DEFAULT_DAILY_LIMIT = 30;

/** Nova GIFs المتحركة (شفافة، 100 فريم، 20ms للفريم) — كل الأفاتار من هنا.
 *  greeting = شاشة الترحيب، idle = الهيدر وجنب رسايل المساعد،
 *  thinking = بدل مؤشر النقاط أثناء انتظار الرد، error = حالة الفشل.
 *  answering/celebrate/dontknow محجوزين لمحفزات جاية — متوصلين
 *  هنا بس، ومش مربوطين بأي سلوك ظاهر لسه. */
const NOVA_GIFS = {
  idle: require('../../assets/nova-idle.gif'),
  thinking: require('../../assets/nova-thinking.gif'),
  answering: require('../../assets/nova-answering.gif'),
  celebrate: require('../../assets/nova-celebrate.gif'),
  dontknow: require('../../assets/nova-dontknow.gif'),
  error: require('../../assets/nova-error.gif'),
  greeting: require('../../assets/nova-greeting.gif'),
} as const;

function makeRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

// تجهيز نص رسايل المساعد قبل الماركداون — حاجتين:
// 1) عزل المقاطع اللاتينية (روابط + معرّفات @) داخل النص العربي
//    بعلامات LRI/PDI (U+2066…U+2069) — من غيرها خوارزمية الاتجاه
//    بتعكس ترتيبها على الشاشة (كانت «@darklink.app» بتظهر
//    «darklink.app@» واللينك بيظهر بسلاش في الأول ومقطوع).
// 2) الروابط الـ bare بتتحوّل للينك ماركداون حقيقي [رابط](رابط) —
//    النص الظاهر هو الرابط نفسه، عشان الضغطة عليه تفتحه (الماركداون
//    من غير linkify مبيحوّلش الروابط العادية للينكات، فكانت بتظهر
//    كنص بس مبيتضغطش). الـ href بيفضل نضيف من غير علامات عزل،
//    والعزل بيتحط على النص الظاهر بس. الكود (``` و `...`) بيتساب
//    زي ما هو. النسخ بياخد النص الأصلي من غير علامات.
const LRI = '\u2066';
const PDI = '\u2069';

function isolateLtrRuns(text: string): string {
  return text.replace(
    /(```[\s\S]*?```)|(`[^`]*`)|(\[([^\]]*)\]\(([^)]+)\))|(https?:\/\/[^\s)>\]]+)|(@[A-Za-z0-9._-]+)/g,
    (
      match: string,
      fence: string | undefined,
      code: string | undefined,
      _mdLink: string | undefined,
      label: string | undefined,
      href: string | undefined,
      url: string | undefined,
      handle: string | undefined,
    ) => {
      if (fence !== undefined || code !== undefined) return match; // كود — سيبه زي ما هو
      if (href !== undefined) {
        // رابط ماركداون — اعزل المقاطع اللاتينية في النص الظاهر بس، والـ href نضيف
        const safeLabel = (label ?? '').replace(
          /(https?:\/\/[^\s)>\]]+)|(@[A-Za-z0-9._-]+)/g,
          (m: string) => `${LRI}${m}${PDI}`,
        );
        return `[${safeLabel}](${href})`;
      }
      if (url !== undefined) {
        // رابط bare — حوّله للينك حقيقي نصه الظاهر هو الرابط نفسه
        return `[${LRI}${url}${PDI}](${url})`;
      }
      return `${LRI}${handle ?? ''}${PDI}`;
    },
  );
}

export default function AiChat() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const flatRef = useRef<FlatList<AiMessage>>(null);

  const mdStyle = useMemo(
    () => ({
      body: { color: colors.text, fontSize: fonts.sizes.md, lineHeight: 22 },
      heading1: { color: colors.text, fontSize: fonts.sizes.lg, fontWeight: '700' as const },
      heading2: { color: colors.text, fontSize: fonts.sizes.md, fontWeight: '700' as const },
      heading3: { color: colors.text, fontSize: fonts.sizes.md, fontWeight: '700' as const },
      strong: { color: colors.text, fontWeight: '700' as const },
      link: { color: colors.primaryBright },
      code_inline: {
        color: colors.primaryBright,
        backgroundColor: colors.glassStrong,
        borderRadius: 6,
        paddingHorizontal: 4,
      },
      fence: {
        color: colors.text,
        backgroundColor: colors.glassStrong,
        borderRadius: radius.md,
        padding: spacing.sm,
      },
      code_block: {
        color: colors.text,
        backgroundColor: colors.glassStrong,
        borderRadius: radius.md,
        padding: spacing.sm,
      },
      blockquote: {
        backgroundColor: colors.glass,
        // شريط الاقتباس في بداية السطر: شمال في الإنجليزي، يمين في العربي
        ...(I18nManager.isRTL
          ? { borderRightColor: colors.primary, borderRightWidth: 3 }
          : { borderLeftColor: colors.primary, borderLeftWidth: 3 }),
      },
      bullet_list: { color: colors.text },
      ordered_list: { color: colors.text },
      table: { borderColor: colors.glassBorder, borderWidth: 1, borderRadius: radius.sm },
      thead: { backgroundColor: colors.glassStrong },
      th: { color: colors.text, fontWeight: '700' as const, padding: 6 },
      td: { color: colors.text, padding: 6 },
      tr: { borderBottomColor: colors.glassBorder, borderBottomWidth: 1 },
    }),
    [colors],
  );

  const loadRemaining = useCallback(async () => {
    if (!profile) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('ai_usage_daily')
      .select('message_count')
      .eq('user_id', profile.id)
      .eq('usage_date', today)
      .maybeSingle();
    const used = (data as { message_count?: number } | null)?.message_count ?? 0;
    setRemaining(Math.max(0, DEFAULT_DAILY_LIMIT - used));
  }, [profile]);

  const loadMessages = useCallback(async (convId: string) => {
    const { data } = await supabase
      .from('ai_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as AiMessage[]);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('ai_conversations')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
      .limit(50);
    setConversations((data ?? []) as AiConversation[]);
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await loadRemaining();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [loadRemaining]);

  useFocusEffect(
    useCallback(() => {
      if (view === 'history') loadHistory();
    }, [view, loadHistory]),
  );

  const openConversation = useCallback(
    async (conv: AiConversation) => {
      setConversationId(conv.id);
      setInlineError(null);
      setView('chat');
      setLoading(true);
      await loadMessages(conv.id);
      setLoading(false);
    },
    [loadMessages],
  );

  const startNewChat = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setInlineError(null);
    setView('chat');
  }, []);

  const deleteConversation = useCallback(
    (conv: AiConversation) => {
      appAlert(t('ai.deleteTitle'), t('ai.deleteBody'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await supabase.from('ai_conversations').delete().eq('id', conv.id);
            if (conv.id === conversationId) startNewChat();
            loadHistory();
          },
        },
      ]);
    },
    [conversationId, loadHistory, startNewChat, t],
  );

  const send = useCallback(
    async (rawText?: string) => {
      const text = (rawText ?? input).trim();
      if (!text || sending) return;
      if (text.length > MAX_INPUT) return;
      setInput('');
      setInlineError(null);
      setSending(true);
      setThinking(true);
      // رسالة المستخدم تظهر فورًا (متفائلة) — الرد بييجي من الـ Function.
      const tempId = `tmp-${makeRequestId()}`;
      const userMsg: AiMessage = {
        id: tempId,
        role: 'user',
        content: text,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      try {
        const { data, error } = await supabase.functions.invoke('darklink-ai-chat', {
          body: { message: text, conversation_id: conversationId, request_id: makeRequestId() },
        });
        if (error) {
          // جرّب نقرأ جسم الخطأ (الحد اليومي بييجي برسالة عربية جاهزة)
          let serverAr: string | null = null;
          try {
            const ctx = (error as unknown as { context?: Response }).context;
            if (ctx) {
              const body = (await ctx.clone().json()) as { error_ar?: string };
              serverAr = body?.error_ar ?? null;
            }
          } catch {
            serverAr = null;
          }
          const name = (error as Error).name ?? '';
          const msg = (error as Error).message ?? '';
          if (name === 'FunctionsFetchError' || /fetch|network|Failed to fetch/i.test(msg)) {
            setInlineError(t('ai.offline'));
          } else {
            setInlineError(serverAr ?? t('ai.errorGeneric'));
          }
          // شيل الرسالة المتفائلة لو فشل الإرسال
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          return;
        }
        const reply = (data as { reply?: string; conversation_id?: string; remaining_today?: number }) ?? {};
        if (typeof reply.remaining_today === 'number') setRemaining(reply.remaining_today);
        if (reply.conversation_id) {
          setConversationId(reply.conversation_id);
          await loadMessages(reply.conversation_id);
        }
      } catch {
        setInlineError(t('ai.offline'));
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      } finally {
        setSending(false);
        setThinking(false);
      }
    },
    [input, sending, conversationId, loadMessages, t],
  );

  const copyMessage = useCallback(
    async (m: AiMessage) => {
      await Clipboard.setStringAsync(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((cur) => (cur === m.id ? null : cur)), 1500);
    },
    [],
  );

  const listData = useMemo(() => [...messages].reverse(), [messages]);

  const renderMessage = useCallback(
    ({ item }: { item: AiMessage }) => {
      const rtl = isArabic(item.content);
      if (item.role === 'user') {
        return (
          <View style={[styles.msgRow, styles.msgRowUser]}>
            <LinearGradient colors={gradients.primary} style={styles.userBubble}>
              <Text style={[styles.userText, rtl ? { textAlign: 'right', writingDirection: 'rtl' } : null]}>
                {item.content}
              </Text>
              <Text style={styles.userTime}>{fmtTime(item.created_at)}</Text>
            </LinearGradient>
          </View>
        );
      }
      return (
        <View style={[styles.msgRow, styles.msgRowAi]}>
          <Image source={NOVA_GIFS.idle} style={styles.aiMiniAvatar} />
          <View style={[styles.aiBubble, { flexShrink: 1 }]}>
            <Text style={styles.aiLabel}>Darklink AI</Text>
            <Markdown
              style={mdStyle}
              onLinkPress={(url) => {
                Linking.openURL(url);
                return false;
              }}
            >
              {isolateLtrRuns(item.content)}
            </Markdown>
            <View style={styles.aiMeta}>
              <Text style={styles.aiTime}>{fmtTime(item.created_at)}</Text>
              <TouchableOpacity onPress={() => copyMessage(item)} hitSlop={8}>
                <Text style={styles.copyBtn}>
                  {copiedId === item.id ? `✓ ${t('ai.copied')}` : `⧉ ${t('common.copy')}`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    },
    [styles, mdStyle, copyMessage, copiedId, t],
  );

  if (!profile) return <Screen>{null}</Screen>;

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* تحميل مسبق: thinking وerror بيتركبوا بس لما يُحتاجوا (أثناء
            انتظار الرد / عند الفشل)، والملف ~1.9MB مكانش بيلحق يتحمل
            قبل ما الفقاعة تختفي — فبنحملهم من أول ما الشاشة تتفتح في
            صورتين مخفيتين 1×1، عشان يبقوا في الكاش جاهزين للعرض فورًا.
            (Image.prefetch مخصص للروابط البعيدة، مش للأصول المضمّنة.) */}
        <Image source={NOVA_GIFS.thinking} style={styles.preloader} />
        <Image source={NOVA_GIFS.error} style={styles.preloader} />
        {/* الهيدر الزجاجي العائم — زر رجوع دايمًا موجود */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Image source={NOVA_GIFS.idle} style={styles.headerAvatar} />
            <View>
              <Text style={styles.headerTitle}>Darklink AI</Text>
              <Text style={styles.headerStatus}>● {t('ai.online')}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => (view === 'history' ? setView('chat') : (setView('history'), loadHistory()))}
              style={styles.headerBtn}
              hitSlop={8}>
              <Ionicons
                name={view === 'history' ? 'chatbubbles-outline' : 'time-outline'}
                size={22}
                color={colors.text}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={startNewChat} style={styles.headerBtn} hitSlop={8}>
              <Ionicons name="create-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {view === 'history' ? (
          <View style={{ flex: 1, paddingHorizontal: spacing.md }}>
            <Text style={styles.sectionTitle}>{t('ai.history')}</Text>
            {historyLoading ? (
              <SkeletonList />
            ) : conversations.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>{t('ai.noHistory')}</Text>
              </View>
            ) : (
              <FlatList
                data={conversations}
                keyExtractor={(c) => c.id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.convCard} onPress={() => openConversation(item)}>
                    <View style={{ flex: 1, flexShrink: 1 }}>
                      <Text style={styles.convTitle} numberOfLines={1}>
                        {item.title || 'Darklink AI'}
                      </Text>
                      <Text style={styles.convDate}>{fmtDate(item.updated_at)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteConversation(item)} hitSlop={10}>
                      <Ionicons name="trash-outline" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        ) : loading ? (
          <View style={{ flex: 1, paddingHorizontal: spacing.md, paddingTop: spacing.md }}>
            <SkeletonChatRow />
            <SkeletonChatRow />
            <SkeletonChatRow />
          </View>
        ) : messages.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.welcomeWrap}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            <Image source={NOVA_GIFS.greeting} style={styles.welcomeAvatar} />
            <Text style={styles.welcomeTitle}>{t('ai.welcomeTitle')}</Text>
            <Text style={styles.welcomeBody}>{t('ai.welcomeBody')}</Text>
            <View style={styles.chips}>
              {[t('ai.s1'), t('ai.s2'), t('ai.s3'), t('ai.s4')].map((s) => (
                <TouchableOpacity key={s} style={styles.chip} onPress={() => send(s)}>
                  <Text style={styles.chipText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={flatRef}
            data={listData}
            keyExtractor={(m) => m.id}
            inverted
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
            renderItem={renderMessage}
            ListHeaderComponent={
              thinking ? (
                <View style={[styles.msgRow, styles.msgRowAi]}>
                  <Image source={NOVA_GIFS.idle} style={styles.aiMiniAvatar} />
                  <View style={styles.aiBubble}>
                    <Image source={NOVA_GIFS.thinking} style={styles.thinkingGif} />
                  </View>
                </View>
              ) : undefined
            }
          />
        )}

        {view === 'chat' && (
          <View style={styles.composerWrap}>
            {inlineError ? (
              <View style={styles.errorBubble}>
                <Image source={NOVA_GIFS.error} style={styles.errorGif} />
                <Text style={styles.errorText}>{inlineError}</Text>
              </View>
            ) : null}
            {remaining !== null ? (
              <Text style={styles.remaining}>{t('ai.remaining', { count: remaining })}</Text>
            ) : null}
            <View style={styles.composer}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={t('ai.placeholder')}
                placeholderTextColor={colors.faint}
                multiline
                maxLength={MAX_INPUT}
                style={styles.input}
                selectionColor={colors.primaryBright}
                returnKeyType="send"
                onSubmitEditing={() => send()}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                onPress={() => send()}
                disabled={!input.trim() || sending}
                style={{ opacity: !input.trim() || sending ? 0.45 : 1 }}>
                <LinearGradient colors={gradients.primary} style={styles.sendBtn}>
                  <Ionicons name="send" size={20} color={colors.white} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SkeletonList() {
  return (
    <View>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} width="100%" height={64} borderRadius={radius.lg} style={{ marginBottom: spacing.sm }} />
      ))}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      borderRadius: radius.xl,
    },
    headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    // مخفي تمامًا (1×1 + شفاف) لكنه بيجبر تحميل وفك ترميز الـ GIF —
    // شوف التعليق فوق الهيدر.
    preloader: { position: 'absolute', width: 1, height: 1, opacity: 0 },
    headerCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, justifyContent: 'center' },
    headerAvatar: { width: 40, height: 40 },
    headerTitle: { color: colors.text, fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
    headerStatus: { color: colors.success, fontSize: fonts.sizes.xs, fontWeight: fonts.weights.bold },
    headerActions: { flexDirection: 'row', alignItems: 'center' },
    sectionTitle: {
      color: colors.text,
      fontSize: fonts.sizes.lg,
      fontWeight: fonts.weights.bold,
      marginVertical: spacing.md,
    },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
    emptyText: { color: colors.muted, fontSize: fonts.sizes.md, textAlign: 'center' },
    convCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
    },
    convTitle: { color: colors.text, fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold },
    convDate: { color: colors.faint, fontSize: fonts.sizes.xs, marginTop: 2 },
    welcomeWrap: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingBottom: 40,
    },
    welcomeAvatar: { width: 140, height: 140, marginBottom: spacing.lg },
    welcomeTitle: {
      color: colors.text,
      fontSize: fonts.sizes.xl,
      fontWeight: fonts.weights.bold,
      textAlign: 'center',
    },
    welcomeBody: {
      color: colors.muted,
      fontSize: fonts.sizes.md,
      textAlign: 'center',
      marginTop: spacing.sm,
      lineHeight: 22,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.lg },
    chip: {
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorderStrong,
      borderRadius: radius.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    chipText: { color: colors.text, fontSize: fonts.sizes.sm, fontWeight: fonts.weights.bold },
    msgRow: { flexDirection: 'row', marginBottom: spacing.md, alignItems: 'flex-end' },
    msgRowUser: { justifyContent: 'flex-end' },
    msgRowAi: { justifyContent: 'flex-start' },
    userBubble: {
      maxWidth: '78%',
      borderRadius: radius.lg,
      borderBottomEndRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    userText: { color: colors.white, fontSize: fonts.sizes.md, lineHeight: 22 },
    userTime: { color: 'rgba(255,255,255,0.75)', fontSize: fonts.sizes.xs, marginTop: 4, textAlign: I18nManager.isRTL ? 'left' : 'right' },
    aiMiniAvatar: { width: 30, height: 30, marginEnd: spacing.sm },
    thinkingGif: { width: 56, height: 56 },
    aiBubble: {
      maxWidth: '80%',
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      borderRadius: radius.lg,
      borderBottomStartRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    aiLabel: { color: colors.primaryBright, fontSize: fonts.sizes.xs, fontWeight: fonts.weights.bold, marginBottom: 2 },
    aiMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: spacing.md },
    aiTime: { color: colors.faint, fontSize: fonts.sizes.xs },
    copyBtn: { color: colors.primaryBright, fontSize: fonts.sizes.xs, fontWeight: fonts.weights.bold },
    composerWrap: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
    errorBubble: {
      backgroundColor: colors.dangerSoft,
      borderRadius: radius.md,
      padding: spacing.sm,
      marginBottom: spacing.sm,
      alignItems: 'center',
    },
    errorGif: { width: 56, height: 56, marginBottom: spacing.xs },
    errorText: { color: colors.white, fontSize: fonts.sizes.sm, textAlign: 'center' },
    remaining: { color: colors.faint, fontSize: fonts.sizes.xs, textAlign: 'center', marginBottom: spacing.xs },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      borderRadius: radius.xl,
      padding: spacing.sm,
    },
    input: {
      flex: 1,
      flexShrink: 1,
      color: colors.text,
      fontSize: fonts.sizes.md,
      maxHeight: 110,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      // إزالة مستطيل التركيز على الويب: outlineWidth لوحده لا يكفي
      outlineWidth: 0,
      outlineStyle: 'none' as 'solid',
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
