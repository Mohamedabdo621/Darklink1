import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TabSwipe } from '../../components/TabSwipe';
import { useTranslation } from 'react-i18next';
import { NeonButton, Screen } from '../../components/ui';
import PostCard from '../../components/PostCard';
import { useAuth } from '../../contexts/AuthContext';
import { fetchTimeline, fetchTrending, type TimelineFilter } from '../../services/timeline';
import type { Post, TrendingPost } from '../../lib/types';
import { fonts, radius, shadowGlow, spacing } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';

const TABS: { key: TimelineFilter; label: string }[] = [
  { key: 'all', label: 'timeline.filterAll' },
  { key: 'friends', label: 'timeline.filterFriends' },
  { key: 'trending', label: 'timeline.filterTrending' },
  { key: 'saved', label: 'timeline.filterSaved' },
];

// صفحة المجتمع — تبويبات (الكل/أصدقائي/الرائج/محفوظ) + شريط الرائج اليوم
// + تحديث بالسحب لتحت، وزرار منشور جديد عايم، وفلترة بالهاشتاج
export default function Timeline() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ tag?: string }>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineDone, setTimelineDone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [trending, setTrending] = useState<TrendingPost[]>([]);

  const loadTimeline = useCallback(
    async (before?: string, f: TimelineFilter = filter, tag: string | null = activeTag) => {
      setTimelineBusy(true);
      const rows = await fetchTimeline(before, f, tag);
      setTimelineBusy(false);
      if (rows.length < 20) setTimelineDone(true);
      if (before) {
        setPosts((prev) => [...prev, ...rows]);
      } else {
        setPosts(rows);
        setTimelineDone(rows.length < 20);
      }
    },
    [filter, activeTag],
  );

  const loadTrending = useCallback(async () => {
    const rows = await fetchTrending();
    setTrending(rows);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTimeline();
    if (filter === 'all' && !activeTag) await loadTrending();
    setRefreshing(false);
  }, [loadTimeline, loadTrending, filter, activeTag]);

  const switchFilter = useCallback(
    (f: TimelineFilter) => {
      setActiveTag(null);
      setFilter(f);
      setPosts([]);
      setTimelineDone(false);
      void loadTimeline(undefined, f, null);
    },
    [loadTimeline],
  );

  // فتح من هاشتاج # في بوست — فلترة بالتاج
  useEffect(() => {
    if (params.tag) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTag(params.tag);
      setFilter('tag');
      setPosts([]);
      setTimelineDone(false);
      void loadTimeline(undefined, 'tag', params.tag);
    }
  }, [params.tag, loadTimeline]);

  useFocusEffect(
    useCallback(() => {
      loadTimeline();
      if (filter === 'all' && !activeTag) loadTrending();
    }, [loadTimeline, loadTrending, filter, activeTag]),
  );

  if (!profile) return <Screen>{null}</Screen>;

  return (
    <TabSwipe current="timeline">
      <Screen>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }>
          <Text style={[styles.title, { marginTop: spacing.lg }]}>
            {t('timeline.title')}
          </Text>

          {activeTag ? (
            <TouchableOpacity
              style={styles.tagChip}
              onPress={() => switchFilter('all')}>
              <Text style={styles.tagChipText}>#{activeTag}</Text>
              <Ionicons name="close" size={16} color={colors.white} />
            </TouchableOpacity>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}>
              {TABS.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => switchFilter(tab.key)}
                  style={[styles.tab, filter === tab.key && styles.tabOn]}>
                  <Text style={[styles.tabText, filter === tab.key && styles.tabTextOn]}>
                    {t(tab.label)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {filter === 'all' && !activeTag && trending.length > 0 ? (
            <View style={styles.trendBox}>
              <Text style={styles.trendTitle}>🔥 {t('timeline.trendingToday')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {trending.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.trendCard}
                    onPress={() =>
                      router.push({ pathname: '/post/[id]', params: { id: p.id } })
                    }>
                    <Text style={styles.trendName} numberOfLines={1}>
                      {p.shown_name}
                    </Text>
                    <Text style={styles.trendBody} numberOfLines={2}>
                      {p.body}
                    </Text>
                    <Text style={styles.trendLikes}>❤️ {p.likes_count}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {posts.length === 0 && !timelineBusy ? (
            <Text style={{ color: colors.muted, marginBottom: spacing.lg }}>
              {filter === 'friends'
                ? t('timeline.noFriendsPosts')
                : filter === 'saved'
                  ? t('timeline.noSavedPosts')
                  : t('timeline.noPosts')}
            </Text>
          ) : null}
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              currentUserId={profile.id}
              isAdmin={profile.is_admin}
              onChanged={(np) =>
                setPosts((prev) => prev.map((x) => (x.id === np.id ? np : x)))
              }
              onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))}
              onOpenComments={(pp) =>
                router.push({ pathname: '/post/[id]', params: { id: pp.id } })
              }
              onReposted={() => void loadTimeline()}
            />
          ))}
          {!timelineDone && posts.length > 0 ? (
            <View style={{ marginBottom: spacing.xl }}>
              <NeonButton
                title={t('common.loading')}
                variant="ghost"
                loading={timelineBusy}
                onPress={() => loadTimeline(posts[posts.length - 1]?.created_at)}
              />
            </View>
          ) : (
            <View style={{ height: spacing.xxl }} />
          )}
        </ScrollView>
        {/* زر منشور جديد عايم فوق الشريط السفلي */}
        <TouchableOpacity
          onPress={() => router.push('/compose-post')}
          style={styles.fab}
          hitSlop={8}>
          <Ionicons name="add" size={28} color={colors.white} />
        </TouchableOpacity>
      </Screen>
    </TabSwipe>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: {
      color: colors.text,
      fontSize: fonts.sizes.lg,
      fontWeight: fonts.weights.bold,
      marginBottom: spacing.md,
    },
    tabsRow: { gap: spacing.sm, paddingBottom: spacing.md },
    tab: {
      borderWidth: 1,
      borderColor: colors.glassBorder,
      borderRadius: radius.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surfaceLight,
    },
    tabOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabText: { color: colors.text, fontSize: fonts.sizes.sm, fontWeight: '700' },
    tabTextOn: { color: colors.white },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      marginBottom: spacing.md,
    },
    tagChipText: { color: colors.white, fontWeight: '700' },
    trendBox: { marginBottom: spacing.md },
    trendTitle: {
      color: colors.text,
      fontSize: fonts.sizes.md,
      fontWeight: fonts.weights.bold,
      marginBottom: spacing.sm,
    },
    trendCard: {
      width: 220,
      marginEnd: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceLight,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    trendName: { color: colors.primaryBright, fontWeight: '700', fontSize: fonts.sizes.sm },
    trendBody: { color: colors.text, fontSize: fonts.sizes.sm, lineHeight: 19, marginTop: 4 },
    trendLikes: { color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 6, fontWeight: '700' },
    /** زر منشور جديد عايم — فوق الشريط السفلي على الطرف */
    fab: {
      position: 'absolute',
      bottom: spacing.lg,
      start: spacing.lg,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadowGlow,
    },
  });
