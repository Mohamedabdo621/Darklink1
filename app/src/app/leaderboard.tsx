import React, { useCallback, useState, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../components/ui';
import { GlassIconChip } from '../components/GlassIconButton';
import { Avatar } from '../components/Avatar';
import { fetchLeaderboard, type LeaderRow } from '../services/features';
import { avatarSignedUrl } from '../services/profile';
import { fonts, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
/** لوحة شرف الهدايا — الأكثر إهداءً واستقبالًا في آخر ٧ أيام */
export default function Leaderboard() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [tab, setTab] = useState<'givers' | 'receivers'>('givers');
  const [givers, setGivers] = useState<LeaderRow[]>([]);
  const [receivers, setReceivers] = useState<LeaderRow[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    const res = await fetchLeaderboard();
    setGivers(res.givers);
    setReceivers(res.receivers);
    const map: Record<string, string | null> = {};
    for (const r of [...res.givers, ...res.receivers]) {
      if (r.profile) map[r.user_id] = await avatarSignedUrl(r.profile.avatar_url);
    }
    setAvatars(map);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const rows = tab === 'givers' ? givers : receivers;
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <Screen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <GlassIconChip name="trophy-outline" size={15} color={colors.gold} />
          <Text style={styles.title}>{t('leaderboard.title')}</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>
      <Text style={styles.note}>{t('leaderboard.weekNote')}</Text>

      <View style={styles.tabs}>
        {(['givers', 'receivers'] as const).map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.tabBtn, tab === k && styles.tabBtnActive]}
            onPress={() => setTab(k)}>
            <Text
              style={[styles.tabText, tab === k && { color: colors.white }]}>
              {t(`leaderboard.${k}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>{t('leaderboard.empty')}</Text>
        ) : (
          rows.map((r, i) => (
            <TouchableOpacity
              key={r.user_id}
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: '/user/[id]',
                  params: { id: r.profile?.public_code ?? r.user_id },
                })
              }>
              <Text style={styles.rank}>{medals[i] ?? `${i + 1}`}</Text>
              <Avatar
                uri={avatars[r.user_id]}
                name={r.profile?.shown_name}
                size={46}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {r.profile?.shown_name ?? '—'}
                  {r.profile?.is_vip ? ' 👑' : ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <GlassIconChip name="gift-outline" size={12} />
                  <Text style={styles.sub}>
                    {r.gifts} — {r.total} {t('common.gems')}
                  </Text>
                </View>
              </View>
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
  note: { color: colors.faint, fontSize: fonts.sizes.sm, textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.md },
  tabBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    borderRadius: 999,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.muted, fontSize: fonts.sizes.sm, fontWeight: fonts.weights.bold },
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
  rank: { fontSize: 19, width: 30, textAlign: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.text, fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold },
  sub: { color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 2 },
});
