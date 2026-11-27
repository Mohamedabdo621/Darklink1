import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Animated,
  Image,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { GlowCard, GradientRing } from './ui';
import { AvatarInitial } from './Avatar';
import { appAlert, appPrompt } from '../lib/dialog';
import { loadDataSaver } from '../lib/dataSaver';
import type { Post } from '../lib/types';
import { avatarSignedUrl } from '../services/profile';
import { deletePost, postMediaUrl, reportPost, togglePostLike } from '../services/timeline';
import { fonts, radius, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
const BURST_HEARTS = [
  { left: '18%', delay: 0, size: 18 },
  { left: '32%', delay: 90, size: 24 },
  { left: '46%', delay: 40, size: 16 },
  { left: '58%', delay: 130, size: 22 },
  { left: '72%', delay: 70, size: 18 },
];

function timeAgo(t: TFunction<'translation', undefined>, iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('timeline.justNow');
  if (s < 3600) return t('timeline.minutesAgo', { count: Math.floor(s / 60) });
  if (s < 86400) return t('timeline.hoursAgo', { count: Math.floor(s / 3600) });
  return t('timeline.daysAgo', { count: Math.floor(s / 86400) });
}

export default function PostCard({
  post,
  currentUserId,
  isAdmin,
  onChanged,
  onDeleted,
  onOpenComments,
}: {
  post: Post;
  currentUserId: string;
  isAdmin: boolean;
  onChanged: (p: Post) => void;
  onDeleted: (id: string) => void;
  onOpenComments: (p: Post) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [liked, setLiked] = useState(post.liked_by_me);
  const [likes, setLikes] = useState(post.likes_count);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // توفير البيانات: صورة البوست متنزلش إلا لما المستخدم يدوس عليها
  const [dataSaver, setDataSaver] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const lastTap = useRef(0);

  // دخول ناعم للبوست الجديد
  const [enter] = useState(() => new Animated.Value(0));
  // نبضة زر اللايك
  const [likePop] = useState(() => new Animated.Value(1));
  // القلب الكبير في النص
  const [bigHeart] = useState(() => new Animated.Value(0));
  // القلوب الصغيرة الطايرة
  const [floaters] = useState(() => BURST_HEARTS.map(() => new Animated.Value(0)));

  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [enter]);

  useEffect(() => {
    loadDataSaver().then(setDataSaver);
  }, []);

  useEffect(() => {
    let alive = true;
    // وضع توفير البيانات: متنزلش صورة البوست إلا لما المستخدم يدوس عليها
    if (post.media_path && (!dataSaver || imgLoaded)) {
      postMediaUrl(post.media_path).then((u) => {
        if (alive) setImgUrl(u);
      });
    }
    if (post.avatar_url) {
      avatarSignedUrl(post.avatar_url).then((u) => {
        if (alive) setAvatarUrl(u);
      });
    }
    return () => {
      alive = false;
    };
  }, [post.media_path, post.avatar_url, dataSaver, imgLoaded]);

  const burst = useCallback(() => {
    bigHeart.setValue(0);
    floaters.forEach((v) => v.setValue(0));
    Animated.sequence([
      Animated.timing(bigHeart, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(bigHeart, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
    const runs = floaters.map((v, i) =>
      Animated.sequence([
        Animated.delay(BURST_HEARTS[i].delay),
        Animated.timing(v, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    Animated.parallel(runs).start();
  }, [bigHeart, floaters]);

  const doLike = useCallback(async () => {
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikes((n) => n + (wasLiked ? -1 : 1));
    Animated.sequence([
      Animated.spring(likePop, { toValue: 1.35, useNativeDriver: true, speed: 40 }),
      Animated.spring(likePop, { toValue: 1, useNativeDriver: true, speed: 20 }),
    ]).start();
    const res = await togglePostLike(post.id);
    if (res.ok && res.liked !== undefined) {
      setLiked(res.liked);
      if (res.likes !== undefined) setLikes(res.likes);
      onChanged({ ...post, liked_by_me: res.liked, likes_count: res.likes ?? likes });
    }
  }, [liked, likePop, post, likes, onChanged]);

  const onTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      if (!liked) {
        burst();
        doLike();
      } else {
        burst();
      }
    } else {
      lastTap.current = now;
    }
  }, [liked, burst, doLike]);

  const onShare = useCallback(async () => {
    await Share.share({
      message: `${post.shown_name}: ${post.body}\nhttps://mohamedabdo621.github.io/Darklink1/post/${post.id}`,
    });
  }, [post]);

  const onMenu = useCallback(() => {
    const mine = post.author_id === currentUserId;
    if (mine || isAdmin) {
      appAlert(t('timeline.delete'), t('timeline.deleteConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('timeline.delete'),
          onPress: async () => {
            if (await deletePost(post.id)) onDeleted(post.id);
          },
        },
      ]);
    } else {
      appPrompt(t('timeline.report'), undefined, t('common.send'), async (reason) => {
        const res = await reportPost(post.id, reason ?? '');
        if (res.ok) appAlert('✓', t('timeline.reported'));
      });
    }
  }, [post, currentUserId, isAdmin, onDeleted, t]);

  const bigScale = bigHeart.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1.25, 1],
  });
  const bigOpacity = bigHeart.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, 1, 0],
  });

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}>
      <GlowCard style={styles.card}>
        <View style={styles.header}>
          <GradientRing size={44}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <AvatarInitial name={post.shown_name} size={38} />
            )}
          </GradientRing>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {post.shown_name}
              {post.is_vip ? ' 👑' : ''}
            </Text>
            <Text style={styles.time}>{timeAgo(t, post.created_at)}</Text>
          </View>
          <TouchableOpacity onPress={onMenu} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.muted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity activeOpacity={1} onPress={onTap}>
          <Text style={styles.body}>{post.body}</Text>
          {imgUrl ? (
            <Image source={{ uri: imgUrl }} style={styles.postImg} resizeMode="cover" />
          ) : null}
          <View pointerEvents="none" style={styles.burstLayer}>
            <Animated.View
              style={{
                opacity: bigOpacity,
                transform: [{ scale: bigScale }],
              }}>
              <Ionicons name="heart" size={84} color={colors.pink} />
            </Animated.View>
            {floaters.map((v, i) => (
              <Animated.View
                key={i}
                style={{
                  position: 'absolute',
                  left: BURST_HEARTS[i].left,
                  bottom: 10,
                  opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
                  transform: [
                    { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -110] }) },
                    { scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.1, 0.9] }) },
                  ],
                }}>
                <Ionicons name="heart" size={BURST_HEARTS[i].size} color={colors.accent} />
              </Animated.View>
            ))}
          </View>
        </TouchableOpacity>

        {post.media_path && dataSaver && !imgLoaded ? (
          <TouchableOpacity
            style={styles.tapToLoad}
            onPress={() => setImgLoaded(true)}>
            <Text style={{ fontSize: 30 }}>🖼</Text>
            <Text style={styles.tapToLoadText}>↓ {t('chat.tapToLoad')}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity onPress={doLike} style={styles.actionBtn}>
            <Animated.View style={{ transform: [{ scale: likePop }] }}>
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={26}
                color={liked ? colors.pink : colors.text}
              />
            </Animated.View>
            <Text style={styles.actionCount}>{likes}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onOpenComments(post)} style={styles.actionBtn}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
            <Text style={styles.actionCount}>{post.comments_count}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onShare} style={styles.actionBtn}>
            <Ionicons name="share-social-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
      </GlowCard>
    </Animated.View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  card: { marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  name: { color: colors.text, fontWeight: '700', fontSize: fonts.sizes.md },
  time: { color: colors.faint, fontSize: fonts.sizes.xs, marginTop: 2 },
  body: { color: colors.text, fontSize: fonts.sizes.md, lineHeight: 23 },
  postImg: {
    width: '100%',
    height: 260,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
  },
  /** مكان صورة البوست في وضع توفير البيانات — دوس لتحميلها */
  tapToLoad: {
    width: '100%',
    height: 160,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tapToLoadText: { color: colors.muted, fontSize: fonts.sizes.sm },
  burstLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionCount: { color: colors.text, fontSize: fonts.sizes.sm, fontWeight: '700' },
});
