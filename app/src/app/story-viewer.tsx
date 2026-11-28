import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Animated,
  I18nManager,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { GlassIconButton } from '../components/GlassIconButton';
import { formatTimeAr } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';
import { appAlert } from '../lib/dialog';
import type { Story } from '../lib/types';
import {
  addStoryComment,
  deleteStory,
  fetchStories,
  getStoryComments,
  getStoryLikeState,
  getStoryStats,
  recordStoryView,
  storySignedUrl,
  toggleStoryLike,
  type StoryComment,
  type StoryStats,
} from '../services/features';
import { avatarSignedUrl } from '../services/profile';
import { fetchPublicProfile } from '../services/social';
import { getOrCreateConversation, sendTextMessage } from '../services/chat';
import { fonts, gradients, radius, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';

/** مدة القصة الواحدة — شريط التقدم بيمتلئ خلالها */
const STORY_MS = 5000;

/** عارض قصص مستخدم واحد: تقدم تلقائي + تنقل باللمس */
export default function StoryViewer() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { userId, storyId } = useLocalSearchParams<{ userId: string; storyId?: string }>();
  const { profile: me } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [idx, setIdx] = useState(0);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  // تفاعلات الستوري: قلب + تعليقات + إحصائيات المالك
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentFocused, setCommentFocused] = useState(false);
  const [stats, setStats] = useState<StoryStats | null>(null);
  const [sheet, setSheet] = useState<'none' | 'views' | 'comments'>('none');
  const viewedRef = useRef(new Set<string>());
  // شريط التقدم المتحرك: القيمة الحالية (0→1) + آخر قيمة وصلها عند الإيقاف
  const [barAnim] = useState(() => new Animated.Value(0));
  const barValueRef = useRef(0);
  // ضغطة مطولة على الستوري = إيقاف مؤقت (زي واتساب)
  const [holding, setHolding] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const all = await fetchStories();
    const mine = all.filter((s) => s.user_id === userId);
    setStories(mine);
    // فتح على قصة معينة (من إشعار مثلًا) بدل أول قصة
    if (storyId) {
      const i = mine.findIndex((s) => s.id === storyId);
      if (i >= 0) setIdx(i);
    }
    const pub = await fetchPublicProfile(userId);
    if (pub) {
      setName(pub.shown_name);
      setAvatar(await avatarSignedUrl(pub.avatar_url));
    }
  }, [userId, storyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const current = stories[idx];

  useEffect(() => {
    let live = true;
    if (current?.type === 'image') {
      storySignedUrl(current.media_path).then((u) => {
        if (live) setMediaUrl(u);
      });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMediaUrl(null);
    }
    return () => {
      live = false;
    };
  }, [current]);

  // تفاعلات القصة الحالية: سجّل المشاهدة مرة واحدة، وحمّل القلب/التعليقات/الإحصائيات
  useEffect(() => {
    if (!current || !me) return;
    const isMine = current.user_id === me.id;
    if (!isMine && !viewedRef.current.has(current.id)) {
      viewedRef.current.add(current.id);
      void recordStoryView(current.id);
    }
    let live = true;
    if (isMine) {
      void getStoryStats(current.id).then((s) => {
        if (live) setStats(s);
      });
    } else {
      void getStoryLikeState(current.id).then((s) => {
        if (live && s) {
          setLiked(s.liked);
          setLikesCount(s.likes);
        }
      });
    }
    void getStoryComments(current.id).then((list) => {
      if (live) setComments(list);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCommentText('');
    return () => {
      live = false;
    };
  }, [current, me]);

  // شريط التقدم بيمتلئ 0→100% خلال مدة القصة، والانتقال للقصة اللي بعدها
  // بيحصل لما الأنيميشن يخلص — فالإيقاف المؤقت (تعليق/ورقة/ضغطة مطولة)
  // بيوقف الشريط والمؤقت مع بعض، والإفلات بيكمل من نفس النقطة
  const paused = commentFocused || sheet !== 'none' || holding;
  /** ضغطة سريعة (<250ms) على الثلث الأيمن/الأيسر = تنقّل، والضغطة
   *  المطولة = إيقاف مؤقت طول ما الإصبع على الشاشة */
  const HOLD_TAP_MS = 250;
  const holdZoneRef = useRef<'start' | 'center' | 'end'>('center');
  const holdPressAtRef = useRef(0);
  const holdGrant = (zone: 'start' | 'center' | 'end') => {
    holdZoneRef.current = zone;
    holdPressAtRef.current = Date.now();
    setHolding(true);
  };
  const holdRelease = () => {
    const pressMs = Date.now() - holdPressAtRef.current;
    setHolding(false);
    if (pressMs < HOLD_TAP_MS) {
      if (holdZoneRef.current === 'start') {
        if (idx > 0) setIdx(idx - 1);
      } else if (holdZoneRef.current === 'end') {
        if (idx < stories.length - 1) setIdx(idx + 1);
        else router.back();
      }
    }
  };
  const holdTerminate = () => {
    // النظام قتل اللمسة من برّه — عاملها زي الإفلات
    holdRelease();
  };
  useEffect(() => {
    // قصة جديدة = شريط من الصفر
    barValueRef.current = 0;
    barAnim.setValue(0);
  }, [idx, barAnim]);
  useEffect(() => {
    if (!stories.length || !current) return;
    if (paused) {
      barAnim.stopAnimation((v) => {
        barValueRef.current = v;
      });
      return;
    }
    const remaining = Math.max(200, (1 - barValueRef.current) * STORY_MS);
    const anim = Animated.timing(barAnim, {
      toValue: 1,
      duration: remaining,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (!finished) return;
      if (idx < stories.length - 1) setIdx(idx + 1);
      else router.back();
    });
    return () => anim.stop();
  }, [idx, paused, stories.length, current, barAnim]);

  if (!current) {
    return (
      <Screen>
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: spacing.xxl }}>
          …
        </Text>
      </Screen>
    );
  }

  const mine = current.user_id === me?.id;

  const onDelete = () => {
    appAlert(t('stories.delete'), t('stories.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (await deleteStory(current)) router.back();
        },
      },
    ]);
  };

  /** قلب / إلغاء قلب — تحديث متفائل وتراجع لو فشل */
  const onToggleLike = async () => {
    if (!current) return;
    const prevLiked = liked;
    const prevCount = likesCount;
    setLiked(!prevLiked);
    setLikesCount(prevCount + (prevLiked ? -1 : 1));
    const res = await toggleStoryLike(current.id);
    if (!res) {
      setLiked(prevLiked);
      setLikesCount(prevCount);
    } else {
      setLiked(res.liked);
      setLikesCount(res.likes);
    }
  };

  const onSendComment = async () => {
    if (!current || !commentText.trim()) return;
    const body = commentText.trim();
    setCommentText('');
    if (await addStoryComment(current.id, body)) {
      setComments(await getStoryComments(current.id));
      if (mine) {
        const s = await getStoryStats(current.id);
        if (s) setStats(s);
      }
    }
  };

  /** رد خاص على القصة: نفس النص بيتبعت رسالة خاصة لصاحب القصة
   *  (زي رد الستوري في إنستجرام) — التعليق العام بيفضل زي ما هو. */
  const onReplyDM = async () => {
    if (!current || !me || !commentText.trim()) return;
    const body = commentText.trim();
    const convId = await getOrCreateConversation(current.user_id);
    if (!convId) {
      appAlert(t('common.error'), t('common.error'));
      return;
    }
    const sent = await sendTextMessage(convId, me.id, `📩 رد على قصتك: ${body}`);
    if (sent) {
      setCommentText('');
      appAlert('✓', 'تم إرسال الرد برسالة خاصة');
    } else {
      appAlert(t('common.error'), t('common.error'));
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* أشرطة التقدم — الحالية بتمتلئ مع الوقت، اللي فاتت ممتلئة، واللي جاية فاضية */}
      <View style={styles.bars}>
        {stories.map((s, i) => (
          <View key={s.id} style={styles.barTrack}>
            {i < idx ? (
              <View style={[styles.barFill, { width: '100%' }]} />
            ) : i === idx ? (
              <Animated.View
                style={[
                  styles.barFill,
                  {
                    width: barAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            ) : (
              <View style={[styles.barFill, { width: '0%' }]} />
            )}
          </View>
        ))}
      </View>
      <View style={styles.header}>
        <Avatar uri={avatar} name={name} size={34} />
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.time}>
          {formatTimeAr(current.created_at)}
        </Text>
        <View style={{ flex: 1 }} />
        {mine ? (
          <GlassIconButton name="trash-outline" size={18} inverse danger onPress={onDelete} />
        ) : null}
        <GlassIconButton name="close" size={20} inverse onPress={() => router.back()} />
      </View>

      {current.type === 'image' ? (
        mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={styles.image} resizeMode="contain" />
        ) : (
          <Text style={styles.loading}>…</Text>
        )
      ) : (
        <LinearGradient colors={[...gradients.button]} style={styles.textBox}>
          <Text style={styles.storyText}>{current.body}</Text>
        </LinearGradient>
      )}

      {/* مناطق اللمس للتنقل — ضغطة سريعة يمين/شمال بتنقّل، وضغطة مطولة
          في أي حتة بتوقف الستوري والشريط لحد ما تسيب إيدك (زي واتساب).
          responder مباشر (مش TouchableOpacity) عشان المتصفح على موبايل
          الويب بيسرق الضغطة المطولة بعد ~ثانية ويفصل الإيقاف: الزرار
          بيرفض يسلّم اللمسة (onResponderTerminationRequest false) فالإيقاف
          بيفضل شغال طول ما الإصبع على الشاشة — نفس إصلاح المايك. */}
      <View
        style={styles.tapStart}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={() => holdGrant('start')}
        onResponderRelease={holdRelease}
        onResponderTerminate={holdTerminate}
      />
      <View
        style={styles.tapCenter}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={() => holdGrant('center')}
        onResponderRelease={holdRelease}
        onResponderTerminate={holdTerminate}
      />
      <View
        style={styles.tapEnd}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={() => holdGrant('end')}
        onResponderRelease={holdRelease}
        onResponderTerminate={holdTerminate}
      />

      {/* شريط التفاعل: قلب + تعليق (مشاهد) أو إحصائيات (مالك) */}
      <KeyboardAvoidingView behavior="padding" style={styles.bottomBarWrap}>
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}>
          {mine ? (
            <>
              <TouchableOpacity style={styles.barBtn} onPress={() => setSheet('views')}>
                <Ionicons name="eye-outline" size={22} color={colors.white} />
                <Text style={styles.barBtnText}>{stats?.views ?? 0}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.barBtn} onPress={() => setSheet('comments')}>
                <Ionicons name="chatbubble-outline" size={22} color={colors.white} />
                <Text style={styles.barBtnText}>
                  {stats?.comments ?? comments.length}
                </Text>
              </TouchableOpacity>
              <View style={styles.barBtn}>
                <Ionicons name="heart" size={22} color={colors.danger} />
                <Text style={styles.barBtnText}>{stats?.likes ?? 0}</Text>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.barBtn} onPress={() => void onToggleLike()}>
                <Ionicons
                  name={liked ? 'heart' : 'heart-outline'}
                  size={24}
                  color={liked ? colors.danger : colors.white}
                />
                <Text style={styles.barBtnText}>{likesCount}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.barBtn} onPress={() => setSheet('comments')}>
                <Ionicons name="chatbubble-outline" size={22} color={colors.white} />
                <Text style={styles.barBtnText}>{comments.length}</Text>
              </TouchableOpacity>
              <View style={styles.commentBox}>
                <TextInput
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder={t('stories.addComment')}
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  style={styles.commentInput}
                  onFocus={() => setCommentFocused(true)}
                  onBlur={() => setCommentFocused(false)}
                  maxLength={500}
                />
                <TouchableOpacity onPress={() => void onSendComment()} hitSlop={6}>
                  <Ionicons name="send" size={20} color={colors.white} />
                </TouchableOpacity>
              </View>
              {/* رد خاص لصاحب القصة (رسالة خاصة مش تعليق عام) */}
              <TouchableOpacity
                style={styles.barBtn}
                onPress={() => void onReplyDM()}
                hitSlop={6}>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.white} />
                <Text style={styles.barBtnText}>رد</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ورقة المشاهدات / التعليقات */}
      <Modal
        transparent
        visible={sheet !== 'none'}
        animationType="fade"
        onRequestClose={() => setSheet('none')}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheet('none')}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>
              {sheet === 'views' ? t('stories.viewers') : t('stories.comments')}
            </Text>
            <ScrollView style={{ maxHeight: 380 }}>
              {sheet === 'views' ? (
                stats?.viewers.length ? (
                  stats.viewers.map((v) => (
                    <View key={v.user_id} style={styles.personRow}>
                      <PersonAvatar
                        key={v.avatar_url ?? 'none'}
                        path={v.avatar_url}
                        name={v.shown_name}
                        size={36}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.personName}>
                          {v.shown_name}
                          {v.is_vip ? ' 👑' : ''}
                        </Text>
                        <Text style={styles.personTime}>{formatTimeAr(v.viewed_at)}</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>{t('stories.noViews')}</Text>
                )
              ) : comments.length ? (
                comments.map((c) => (
                  <View key={c.id} style={styles.personRow}>
                    <PersonAvatar
                      key={c.avatar_url ?? 'none'}
                      path={c.avatar_url}
                      name={c.shown_name}
                      size={36}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>
                        {c.shown_name}
                        {c.is_vip ? ' 👑' : ''}
                      </Text>
                      <Text style={styles.personBody}>{c.body}</Text>
                      <Text style={styles.personTime}>{formatTimeAr(c.created_at)}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>{t('stories.noComments')}</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** صورة شخص في ورقة المشاهدات/التعليقات — مسار التخزين بيتحول لرابط موقّع */
function PersonAvatar({
  path,
  name,
  size,
}: {
  path: string | null;
  name: string;
  size: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!path) return;
    avatarSignedUrl(path).then((u) => {
      if (live) setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [path]);
  return <Avatar uri={url} name={name} size={size} />;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bars: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.sm },
  barTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.white, fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold },
  time: { color: 'rgba(255,255,255,0.7)', fontSize: fonts.sizes.xs },
  image: { flex: 1, width: '100%' },
  loading: { color: colors.white, textAlign: 'center', marginTop: 200 },
  textBox: {
    flex: 1,
    margin: spacing.md,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  storyText: {
    color: colors.white,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    textAlign: 'center',
    lineHeight: 34,
  },
  // userSelect: none عشان المتصفح ما يبدأش تحديد نص / قائمة ضغطة مطولة
  // ويسرق اللمسة من الـ responder
  tapStart: { position: 'absolute', start: 0, top: 110, bottom: 0, width: '35%', userSelect: 'none' },
  tapCenter: { position: 'absolute', left: '35%', right: '35%', top: 110, bottom: 0, userSelect: 'none' },
  tapEnd: { position: 'absolute', end: 0, top: 110, bottom: 0, width: '35%', userSelect: 'none' },
  /** شريط التفاعل السفلي — فوق مناطق اللمس (بيترسم بعدها) */
  bottomBarWrap: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  barBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  barBtnText: {
    color: colors.white,
    fontSize: fonts.sizes.sm,
    fontWeight: fonts.weights.bold,
  },
  commentBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  commentInput: {
    flex: 1,
    color: colors.white,
    fontSize: fonts.sizes.md,
    textAlign: I18nManager.isRTL ? 'right' : 'left',
  },
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
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  sheetTitle: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginBottom: spacing.sm,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  personName: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.bold,
  },
  personBody: { color: colors.text, fontSize: fonts.sizes.md, marginTop: 2 },
  personTime: { color: colors.muted, fontSize: fonts.sizes.xs, marginTop: 2 },
  emptyText: {
    color: colors.muted,
    fontSize: fonts.sizes.md,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
