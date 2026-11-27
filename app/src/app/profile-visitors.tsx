import React, { useCallback, useState, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NeonButton, Screen } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyVisitors, type VisitRow } from '../services/features';
import { avatarSignedUrl } from '../services/profile';
import { fonts, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
/** مين زار بروفايلي — ميزة VIP */
export default function ProfileVisitors() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  const [rows, setRows] = useState<VisitRow[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    if (!me?.is_vip) return;
    const res = await fetchMyVisitors(me.id);
    setRows(res);
    const map: Record<string, string | null> = {};
    for (const r of res) {
      map[r.visitor.id] = await avatarSignedUrl(r.visitor.avatar_url);
    }
    setAvatars(map);
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.text, fontSize: 22 }}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>👀 {t('visitors.title')}</Text>
        <View style={{ width: 22 }} />
      </View>

      {!me?.is_vip ? (
        <View style={styles.vipBox}>
          <Text style={{ fontSize: 44 }}>👑</Text>
          <Text style={styles.vipTitle}>{t('visitors.vipOnly')}</Text>
          <Text style={styles.vipBody}>{t('visitors.vipOnlyBody')}</Text>
          <View style={{ width: '100%', marginTop: spacing.lg }}>
            <NeonButton
              title={t('tabs.wallet')}
              variant="gold"
              onPress={() => router.push('/store')}
            />
          </View>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {rows.length === 0 ? (
            <Text style={styles.empty}>{t('visitors.empty')}</Text>
          ) : (
            rows.map((r) => (
              <TouchableOpacity
                key={r.visitor.id}
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/user/[id]',
                    params: { id: r.visitor.id },
                  })
                }>
                <Avatar
                  uri={avatars[r.visitor.id]}
                  name={r.visitor.shown_name}
                  size={46}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {r.visitor.shown_name}
                    {r.visitor.is_vip ? ' 👑' : ''}
                  </Text>
                  <Text style={styles.sub}>
                    {new Date(r.visited_at).toLocaleString([], {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
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
  vipBox: { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.sm },
  vipTitle: { color: colors.gold, fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold },
  vipBody: { color: colors.muted, fontSize: fonts.sizes.md, textAlign: 'center', lineHeight: 24 },
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
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.text, fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold },
  sub: { color: colors.faint, fontSize: fonts.sizes.sm, marginTop: 2 },
});
