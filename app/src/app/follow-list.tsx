import React, { useCallback, useState, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Screen } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { avatarSignedUrl } from '../services/profile';
import { fetchFollowers, fetchFollowing } from '../services/timeline';
import type { FollowUser } from '../lib/types';
import { fonts, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
/** قائمة المتابعين / المتابَعين لمستخدم — بتتفتح من عدّادات المتابعة في الملف */
export default function FollowList() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { userId, type } = useLocalSearchParams<{
    userId: string;
    type: 'followers' | 'following';
  }>();
  const isFollowers = type !== 'following';
  const [rows, setRows] = useState<FollowUser[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const res = isFollowers
      ? await fetchFollowers(userId)
      : await fetchFollowing(userId);
    setRows(res);
    const map: Record<string, string | null> = {};
    for (const r of res) {
      map[r.user_id] = await avatarSignedUrl(r.avatar_url);
    }
    setAvatars(map);
    setLoaded(true);
  }, [userId, isFollowers]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{isFollowers ? 'المتابعون' : 'يتابع'}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {loaded && rows.length === 0 ? (
          <Text style={styles.empty}>
            {isFollowers ? 'لسه مفيش متابعين' : 'لسه مبيتابعش حد'}
          </Text>
        ) : (
          rows.map((r) => (
            <TouchableOpacity
              key={r.user_id}
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: '/user/[id]',
                  params: { id: r.user_id },
                })
              }>
              <Avatar uri={avatars[r.user_id]} name={r.shown_name} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {r.shown_name}
                </Text>
                {r.username ? (
                  <Text style={styles.sub}>@{r.username}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
  },
  title: { color: colors.text, fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xxl,
    fontSize: fonts.sizes.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
  },
  name: { color: colors.text, fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold },
  sub: { color: colors.faint, fontSize: fonts.sizes.sm, marginTop: 2 },
});
