import React, { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TabSwipe } from '../../components/TabSwipe';
import { useTranslation } from 'react-i18next';
import { NeonButton, Screen } from '../../components/ui';
import PostCard from '../../components/PostCard';
import { useAuth } from '../../contexts/AuthContext';
import { fetchTimeline } from '../../services/timeline';
import type { Post } from '../../lib/types';
import { fonts, shadowGlow, spacing } from '../../theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';

// صفحة التايم لاين المنفصلة — نفس فيد الهوم القديم (بوستات + تحميل المزيد)
// + تحديث بالسحب لتحت، وزرار منشور جديد عايم
export default function Timeline() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [timelineBusy, setTimelineBusy] = useState(false);
  const [timelineDone, setTimelineDone] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadTimeline = useCallback(async (before?: string) => {
    setTimelineBusy(true);
    const rows = await fetchTimeline(before);
    setTimelineBusy(false);
    if (rows.length < 20) setTimelineDone(true);
    if (before) {
      setPosts((prev) => [...prev, ...rows]);
    } else {
      setPosts(rows);
      setTimelineDone(rows.length < 20);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTimeline();
    setRefreshing(false);
  }, [loadTimeline]);

  useFocusEffect(
    useCallback(() => {
      loadTimeline();
    }, [loadTimeline]),
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
          {posts.length === 0 && !timelineBusy ? (
            <Text style={{ color: colors.muted, marginBottom: spacing.lg }}>
              {t('timeline.noPosts')}
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
