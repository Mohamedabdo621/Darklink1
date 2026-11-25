import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TabSwipe } from '../../components/TabSwipe';
import { useTranslation } from 'react-i18next';
import { Chip, GlowCard, Logo, NeonButton, Screen } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { appAlert } from '../../lib/dialog';
import { supabase } from '../../lib/supabase';
import { shownNameOf, type PublicProfile, type Story, type Wallet } from '../../lib/types';
import {
  checkAchievements,
  claimDailyReward,
  fetchDailyStatus,
  fetchStories,
  type DailyStatus,
} from '../../services/features';
import { avatarSignedUrl } from '../../services/profile';
import { fetchPublicProfile } from '../../services/social';
import { fetchUnreadNotifications } from '../../services/wallet';
import { colors, fonts, radius, spacing } from '../../theme';

interface StoryGroup {
  userId: string;
  user: PublicProfile | null;
  avatar: string | null;
  count: number;
  mine: boolean;
}

export default function Home() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', profile.id)
      .single();
    if (data) setWallet(data as Wallet);
    setAvatar(await avatarSignedUrl(profile.avatar_url));
    setUnreadNotifs(await fetchUnreadNotifications(profile.id));
    setDaily(await fetchDailyStatus());
    // الستوري: تجميع حسب المستخدم
    const stories = await fetchStories();
    const byUser = new Map<string, Story[]>();
    for (const s of stories) {
      const arr = byUser.get(s.user_id) ?? [];
      arr.push(s);
      byUser.set(s.user_id, arr);
    }
    const groups: StoryGroup[] = [];
    for (const [uid, arr] of byUser) {
      const pub = uid === profile.id ? null : await fetchPublicProfile(uid);
      groups.push({
        userId: uid,
        user: pub,
        avatar: await avatarSignedUrl(
          uid === profile.id ? profile.avatar_url : (pub?.avatar_url ?? null),
        ),
        count: arr.length,
        mine: uid === profile.id,
      });
    }
    groups.sort((a, b) => Number(b.mine) - Number(a.mine));
    setStoryGroups(groups);
    // إنجازات جديدة؟
    const fresh = await checkAchievements();
    if (fresh.length) {
      appAlert(
        '🏆 ' + t('achievements.unlocked'),
        fresh.map((k) => '• ' + t(`achievements.${k}`)).join('\n'),
      );
    }
  }, [profile, t]);

  const onClaim = async () => {
    setClaiming(true);
    const res = await claimDailyReward();
    setClaiming(false);
    if (res?.claimed) {
      appAlert(
        '🎁 ' + t('home.dailyTitle'),
        `${t('home.dailyGot')} ${res.amount} 💎 — ${res.streak} ${t('home.streakDays')}`,
      );
      load();
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!profile) return <Screen>{null}</Screen>;

  const name = shownNameOf(profile);

  return (
    <TabSwipe current="home">
      <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Logo size={22} />
          <TouchableOpacity
            onPress={() => router.push('/notifications')}
            style={styles.bell}>
            <Text style={{ fontSize: 20 }}>🔔</Text>
            {unreadNotifs > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={{ color: colors.white, fontSize: 9, fontWeight: '700' }}>
                  {unreadNotifs}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* شريط الستوري */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: spacing.md }}
          contentContainerStyle={{ gap: spacing.md, paddingVertical: 2 }}>
          <TouchableOpacity
            style={styles.storyItem}
            onPress={() => router.push('/story-new')}>
            <View style={styles.storyRing}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.storyAvatar} />
              ) : (
                <View style={[styles.storyAvatar, styles.avatarFallback]}>
                  <Text style={{ fontSize: 20 }}>👤</Text>
                </View>
              )}
              <View style={styles.storyPlus}>
                <Text style={{ color: colors.white, fontSize: 13, fontWeight: '700' }}>
                  +
                </Text>
              </View>
            </View>
            <Text style={styles.storyLabel}>{t('home.yourStory')}</Text>
          </TouchableOpacity>
          {storyGroups
            .filter((g) => !g.mine)
            .map((g) => (
              <TouchableOpacity
                key={g.userId}
                style={styles.storyItem}
                onPress={() =>
                  router.push({
                    pathname: '/story-viewer',
                    params: { userId: g.userId },
                  })
                }>
                <View style={styles.storyRing}>
                  {g.avatar ? (
                    <Image source={{ uri: g.avatar }} style={styles.storyAvatar} />
                  ) : (
                    <View style={[styles.storyAvatar, styles.avatarFallback]}>
                      <Text style={{ fontSize: 20 }}>👤</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.storyLabel} numberOfLines={1}>
                  {g.user?.shown_name ?? '—'}
                </Text>
              </TouchableOpacity>
            ))}
        </ScrollView>

        <GlowCard style={styles.identityCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={{ fontSize: 22 }}>👤</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>
                {t('home.welcome')}
              </Text>
              <Text style={styles.name}>{name}</Text>
              <Text style={{ color: colors.faint, fontSize: fonts.sizes.xs }}>
                @{profile.anonymous_alias}
              </Text>
            </View>
            <View style={{ gap: 6, alignItems: 'flex-end' }}>
              <Chip
                label={
                  profile.identity_mode === 'anonymous'
                    ? `🕶 ${t('common.anonymous')}`
                    : `🌐 ${t('common.public')}`
                }
              />
              {profile.is_vip ? <Chip label="👑 VIP" gold /> : null}
            </View>
          </View>
        </GlowCard>

        <GlowCard style={styles.walletCard}>
          <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>
            💎 {t('home.balance')}
          </Text>
          <Text style={styles.balance}>
            {wallet?.balance ?? 0}{' '}
            <Text style={{ fontSize: fonts.sizes.md, color: colors.primaryBright }}>
              {t('common.gems')}
            </Text>
          </Text>
        </GlowCard>

        {/* المكافأة اليومية */}
        <GlowCard style={styles.walletCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text style={{ fontSize: 30 }}>🎁</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold }}>
                {t('home.dailyTitle')}
              </Text>
              <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 2 }}>
                {daily && daily.streak > 0
                  ? `🔥 ${daily.streak} ${t('home.streakDays')} — `
                  : ''}
                {daily?.claimable
                  ? `+${daily.next_amount} 💎`
                  : t('home.dailyClaimed')}
              </Text>
            </View>
          </View>
          {daily?.claimable ? (
            <View style={{ marginTop: spacing.md }}>
              <NeonButton
                title={t('home.dailyClaim')}
                onPress={onClaim}
                loading={claiming}
              />
            </View>
          ) : null}
        </GlowCard>

        <Text style={styles.sectionTitle}>{t('home.shortcuts')}</Text>
        <View style={styles.grid}>
          <Shortcut
            emoji="🔮"
            label={t('tabs.discover')}
            onPress={() => router.push('/(tabs)/discover')}
          />
          <Shortcut
            emoji="💬"
            label={t('tabs.chats')}
            onPress={() => router.push('/(tabs)/chats')}
          />
          <Shortcut
            emoji="✏️"
            label={t('home.editProfile')}
            onPress={() => router.push('/edit-profile')}
          />
          <Shortcut
            emoji="⚙️"
            label={t('home.settings')}
            onPress={() => router.push('/settings')}
          />
          <Shortcut
            emoji="👤"
            label={t('tabs.profile')}
            onPress={() => router.push('/(tabs)/profile')}
          />
          <Shortcut
            emoji="🏆"
            label={t('home.leaderboard')}
            onPress={() => router.push('/leaderboard')}
          />
        </View>
      </ScrollView>
    </Screen>
    </TabSwipe>
  );
}

function Shortcut({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.shortcut}>
      <Text style={{ fontSize: 26 }}>{emoji}</Text>
      <Text style={styles.shortcutLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
  },
  bell: { width: 40, alignItems: 'center' },
  bellBadge: {
    position: 'absolute',
    top: -4,
    end: 2,
    backgroundColor: colors.danger,
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  storyItem: { alignItems: 'center', width: 68 },
  storyRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatar: { width: 54, height: 54, borderRadius: 27 },
  storyPlus: {
    position: 'absolute',
    bottom: -2,
    end: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  storyLabel: {
    color: colors.text,
    fontSize: fonts.sizes.xs,
    marginTop: 5,
    textAlign: 'center',
  },
  identityCard: { marginBottom: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  name: { color: colors.text, fontSize: fonts.sizes.lg, fontWeight: fonts.weights.bold },
  walletCard: { marginBottom: spacing.lg },
  balance: {
    color: colors.text,
    fontSize: fonts.sizes.hero,
    fontWeight: fonts.weights.black,
    marginTop: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginBottom: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  shortcut: {
    width: '30%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  shortcutLabel: { color: colors.text, fontSize: fonts.sizes.sm, fontWeight: fonts.weights.medium },
});
