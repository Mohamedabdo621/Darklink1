import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Animated,
  Image,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { GlowCard, NeonButton } from './ui';
import { Avatar } from './Avatar';
import VoiceBubble from './VoiceBubble';
import { appAlert, appPrompt } from '../lib/dialog';
import { loadDataSaver } from '../lib/dataSaver';
import type { Post } from '../lib/types';
import { avatarSignedUrl } from '../services/profile';
import {
  deletePost,
  editPost,
  findByUsername,
  postMediaUrl,
  reportPost,
  toggleFollow,
  togglePinPost,
  togglePostLike,
  toggleRepost,
  toggleSavePost,
  votePoll,
} from '../services/timeline';
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

/** نص البوست مع منشن @ وهاشتاج # قابلين للضغط */
function RichBody({ text, style }: { text: string; style: TextStyle }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const parts = text.split(/(#[^\s#]+|@[^\s@]+)/g);
  const openMention = async (name: string) => {
    const u = await findByUsername(name);
    if (u) {
      router.push({ pathname: '/user/[id]', params: { id: u.public_code ?? u.id } });
    } else {
      appAlert(t('common.error'), t('timeline.userNotFound'));
    }
  };
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (part.startsWith('#') && part.length > 1) {
          return (
            <Text
              key={i}
              style={{ color: colors.primaryBright, fontWeight: '700' }}
              onPress={() =>
                router.push({ pathname: '/(tabs)/timeline', params: { tag: part.slice(1) } })
              }>
              {part}
            </Text>
          );
        }
        if (part.startsWith('@') && part.length > 1) {
          return (
            <Text
              key={i}
              style={{ color: colors.primaryBright, fontWeight: '700' }}
              onPress={() => void openMention(part.slice(1))}>
              {part}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
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
  // إعادة النشر عدّاد — نفس نمط اللايك: حالة محلية بتتزامن مع onChanged
  const [reposted, setReposted] = useState(post.reposted_by_me);
  const [reposts, setReposts] = useState(post.reposts_count);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [repostImgUrl, setRepostImgUrl] = useState<string | null>(null);
  // توفير البيانات: صورة البوست متنزلش إلا لما المستخدم يدوس عليها
  const [dataSaver, setDataSaver] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const lastTap = useRef(0);
  // حفظ / متابعة / استطلاع / تعديل — حالة محلية بتتزامن مع onChanged
  const [saved, setSaved] = useState(post.saved_by_me);
  const [following, setFollowing] = useState(post.following_author);
  const [votes, setVotes] = useState<number[] | null>(post.poll_votes);
  const [myVote, setMyVote] = useState<number | null>(post.my_vote);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [editBusy, setEditBusy] = useState(false);

  // دخول ناعم للبوست الجديد
  const [enter] = useState(() => new Animated.Value(0));
  // نبضة زر اللايك
  const [likePop] = useState(() => new Animated.Value(1));
  // القلب الكبير في النص
  const [bigHeart] = useState(() => new Animated.Value(0));
  // القلوب الصغيرة الطايرة
  const [floaters] = useState(() => BURST_HEARTS.map(() => new Animated.Value(0)));

  const player = useVideoPlayer(post.media_type === 'video' ? mediaUrl : null);

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
        if (alive) setMediaUrl(u);
      });
    }
    if (post.repost_media_path && post.repost_media_type === 'image') {
      postMediaUrl(post.repost_media_path).then((u) => {
        if (alive) setRepostImgUrl(u);
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
  }, [post.media_path, post.repost_media_path, post.repost_media_type, post.avatar_url, dataSaver, imgLoaded]);

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

  const doRepost = useCallback(async () => {
    const wasReposted = reposted;
    setReposted(!wasReposted);
    setReposts((n) => n + (wasReposted ? -1 : 1));
    const res = await toggleRepost(post.id);
    if (res.ok && res.reposted !== undefined) {
      setReposted(res.reposted);
      if (res.reposts_count !== undefined) setReposts(res.reposts_count);
      onChanged({
        ...post,
        reposted_by_me: res.reposted,
        reposts_count: res.reposts_count ?? reposts,
      });
    }
  }, [reposted, post, reposts, onChanged]);

  const doSave = useCallback(async () => {
    const res = await toggleSavePost(post.id);
    if (res.ok && res.saved !== undefined) {
      setSaved(res.saved);
      onChanged({ ...post, saved_by_me: res.saved });
    }
  }, [post, onChanged]);

  const doFollow = useCallback(async () => {
    const res = await toggleFollow(post.author_id);
    if (res.ok && res.following !== undefined) {
      setFollowing(res.following);
      onChanged({ ...post, following_author: res.following });
    }
  }, [post, onChanged]);

  const doVote = useCallback(
    async (option: number) => {
      const res = await votePoll(post.id, option);
      if (res.ok && res.votes) {
        setVotes(res.votes);
        setMyVote(res.my_vote ?? option);
        onChanged({ ...post, poll_votes: res.votes, my_vote: res.my_vote ?? option });
      }
    },
    [post, onChanged],
  );

  const saveEdit = useCallback(async () => {
    if (editBody.trim().length < 1) return;
    setEditBusy(true);
    const res = await editPost(post.id, editBody.trim());
    setEditBusy(false);
    if (res.ok) {
      onChanged({ ...post, body: editBody.trim(), edited: true });
      setEditing(false);
    }
  }, [editBody, post, onChanged]);

  const onMenu = useCallback(() => {
    const mine = post.author_id === currentUserId;
    if (mine) {
      appAlert(t('timeline.postOptions'), undefined, [
        {
          text: t('timeline.editPost'),
          onPress: () => {
            setEditBody(post.body);
            setEditing(true);
          },
        },
        {
          text: post.is_pinned ? t('timeline.unpin') : t('timeline.pin'),
          onPress: async () => {
            const res = await togglePinPost(post.id);
            if (res.ok) {
              onChanged({ ...post, is_pinned: res.pinned ?? !post.is_pinned });
            }
          },
        },
        {
          text: t('timeline.delete'),
          onPress: () => {
            appAlert(t('timeline.delete'), t('timeline.deleteConfirm'), [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('timeline.delete'),
                onPress: async () => {
                  if (await deletePost(post.id)) onDeleted(post.id);
                },
              },
            ]);
          },
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
      return;
    }
    if (isAdmin) {
      appAlert(t('timeline.delete'), t('timeline.deleteConfirm'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('timeline.delete'),
          onPress: async () => {
            if (await deletePost(post.id)) onDeleted(post.id);
          },
        },
      ]);
      return;
    }
    appPrompt(t('timeline.report'), undefined, t('common.send'), async (reason) => {
      const res = await reportPost(post.id, reason ?? '');
      if (res.ok) appAlert('✓', t('timeline.reported'));
    });
  }, [post, currentUserId, isAdmin, onDeleted, onChanged, t]);

  const bigScale = bigHeart.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1.25, 1],
  });
  const bigOpacity = bigHeart.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0, 1, 0],
  });

  const totalVotes = (votes ?? []).reduce((a, b) => a + b, 0);

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}>
      <GlowCard style={styles.card}>
        <View style={styles.header}>
          <Avatar uri={avatarUrl} name={post.shown_name} size={44} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name} numberOfLines={1}>
                {post.shown_name}
                {post.is_vip ? ' 👑' : ''}
              </Text>
              {post.follows_me ? (
                <View style={styles.followsYouBadge}>
                  <Text style={styles.followsYouText}>يتابعك</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.time}>
              {timeAgo(t, post.created_at)}
              {post.edited ? ` • ${t('timeline.edited')}` : ''}
              {post.is_pinned ? ' • 📌' : ''}
            </Text>
          </View>
          {post.author_id !== currentUserId ? (
            <TouchableOpacity onPress={() => void doFollow()} style={[styles.followChip, following && styles.followChipOn]}>
              <Text style={[styles.followText, following && styles.followTextOn]}>
                {following ? `✓ ${t('timeline.following')}` : t('timeline.follow')}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={onMenu} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {editing ? (
          <View>
            <TextInput
              style={styles.editInput}
              value={editBody}
              onChangeText={(v) => setEditBody(v.slice(0, 500))}
              multiline
              autoFocus
            />
            <View style={styles.editRow}>
              <TouchableOpacity onPress={() => setEditing(false)}>
                <Text style={styles.editCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <NeonButton title={t('common.save')} onPress={() => void saveEdit()} loading={editBusy} />
            </View>
          </View>
        ) : (
          <TouchableOpacity activeOpacity={1} onPress={onTap}>
            {post.body ? <RichBody text={post.body} style={styles.body} /> : null}
            {mediaUrl && post.media_type === 'image' ? (
              <Image source={{ uri: mediaUrl }} style={styles.postImg} resizeMode="cover" />
            ) : null}
            {mediaUrl && post.media_type === 'video' ? (
              <VideoView
                player={player}
                style={styles.postVideo}
                nativeControls
                contentFit="cover"
              />
            ) : null}
            {post.media_type === 'voice' ? (
              <View style={styles.voiceRow}>
                <VoiceBubble
                  mediaPath={post.media_path}
                  durationSec={post.voice_duration}
                  mine={false}
                  bucket="post-media"
                />
              </View>
            ) : null}
            {post.repost_of ? (
              <View style={styles.repostCard}>
                <Text style={styles.repostName}>{post.repost_author_name ?? ''}</Text>
                {post.repost_body ? (
                  <Text style={styles.repostBody} numberOfLines={4}>{post.repost_body}</Text>
                ) : null}
                {repostImgUrl ? (
                  <Image source={{ uri: repostImgUrl }} style={styles.repostImg} resizeMode="cover" />
                ) : null}
              </View>
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
        )}

        {post.poll ? (
          <View style={styles.poll}>
            {post.poll.question ? (
              <Text style={styles.pollQ}>{post.poll.question}</Text>
            ) : null}
            {post.poll.options.map((opt, i) => {
              const v = votes?.[i] ?? 0;
              const pct = totalVotes > 0 ? Math.round((v / totalVotes) * 100) : 0;
              const mine = myVote === i;
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => void doVote(i)}
                  style={[styles.pollOpt, mine && styles.pollOptMine]}
                  activeOpacity={0.8}>
                  {myVote !== null ? (
                    <View style={[styles.pollBar, { width: `${pct}%` }]} />
                  ) : null}
                  <Text style={[styles.pollOptText, mine && styles.pollOptTextMine]}>
                    {opt.text}
                  </Text>
                  {myVote !== null ? <Text style={styles.pollPct}>{pct}%</Text> : null}
                </TouchableOpacity>
              );
            })}
            <Text style={styles.pollTotal}>{t('timeline.votesCount', { count: totalVotes })}</Text>
          </View>
        ) : null}

        {post.media_path && dataSaver && !imgLoaded ? (
          <TouchableOpacity
            style={styles.tapToLoad}
            onPress={() => setImgLoaded(true)}>
            <Ionicons
              name={post.media_type === 'video' ? 'videocam-outline' : 'image-outline'}
              size={30}
              color={colors.muted}
            />
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
          <TouchableOpacity onPress={() => void doRepost()} style={styles.actionBtn}>
            <Ionicons
              name={reposted ? 'repeat' : 'repeat-outline'}
              size={24}
              color={reposted ? colors.accent : colors.text}
            />
            <Text style={styles.actionCount}>{reposts}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void doSave()} style={styles.actionBtn}>
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color={saved ? colors.accent : colors.text}
            />
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
  name: { color: colors.text, fontWeight: '700', fontSize: fonts.sizes.md, flexShrink: 1 },
  /** شارة «يتابعك» — بتظهر جنب اسم كاتب البوست لما يكون بيتابعني */
  followsYouBadge: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(168,85,247,0.15)',
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  followsYouText: { color: colors.primaryBright, fontSize: fonts.sizes.xs, fontWeight: '700' },
  time: { color: colors.faint, fontSize: fonts.sizes.xs, marginTop: 2 },
  body: { color: colors.text, fontSize: fonts.sizes.md, lineHeight: 23 },
  postImg: {
    width: '100%',
    height: 260,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
  },
  postVideo: {
    width: '100%',
    height: 260,
    borderRadius: radius.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
  },
  voiceRow: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  repostCard: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  repostName: { color: colors.muted, fontSize: fonts.sizes.sm, fontWeight: '700' },
  repostBody: { color: colors.text, fontSize: fonts.sizes.sm, lineHeight: 20, marginTop: 2 },
  repostImg: {
    width: '100%',
    height: 140,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceLight,
  },
  poll: { marginTop: spacing.md, gap: spacing.sm },
  pollQ: { color: colors.text, fontWeight: '700', fontSize: fonts.sizes.md },
  pollOpt: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
  },
  pollOptMine: { borderColor: colors.primary },
  pollBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(168,85,247,0.22)',
  },
  pollOptText: { color: colors.text, fontSize: fonts.sizes.md, fontWeight: '600' },
  pollOptTextMine: { color: colors.primaryBright },
  pollPct: { color: colors.muted, fontSize: fonts.sizes.sm, fontWeight: '700' },
  pollTotal: { color: colors.faint, fontSize: fonts.sizes.xs },
  followChip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  followChipOn: { backgroundColor: 'rgba(168,85,247,0.15)' },
  followText: { color: colors.primaryBright, fontSize: fonts.sizes.sm, fontWeight: '700' },
  followTextOn: { color: colors.primaryBright },
  editInput: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    lineHeight: 23,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.sm,
    backgroundColor: colors.surfaceLight,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  editCancel: { color: colors.muted, fontSize: fonts.sizes.md },
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
