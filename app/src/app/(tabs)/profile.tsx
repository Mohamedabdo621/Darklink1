import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { TabSwipe } from '../../components/TabSwipe';
import { useTranslation } from 'react-i18next';
import { Chip, GlowCard, GradientRing, NeonButton, Screen } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { shownNameOf } from '../../lib/types';
import {
  fetchMyLevel,
  fetchMyReferralCode,
  fetchMyReferralCount,
  type MyLevel,
} from '../../services/economy';
import { ACHIEVEMENT_KEYS, fetchMyAchievements } from '../../services/features';
import { avatarSignedUrl } from '../../services/profile';
import { colors, fonts, radius, spacing } from '../../theme';

export default function ProfileTab() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [received, setReceived] = useState(0);
  const [sent, setSent] = useState(0);
  const [achievements, setAchievements] = useState<string[]>([]);
  const [myLevel, setMyLevel] = useState<MyLevel | null>(null);
  const [refCode, setRefCode] = useState('');
  const [refCount, setRefCount] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    setAvatar(await avatarSignedUrl(profile.avatar_url));
    setAchievements(await fetchMyAchievements(profile.id));
    setMyLevel(await fetchMyLevel());
    setRefCode(await fetchMyReferralCode());
    setRefCount(await fetchMyReferralCount(profile.id));
    const r = await supabase
      .from('gift_sends')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', profile.id);
    const s = await supabase
      .from('gift_sends')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', profile.id);
    setReceived(r.count ?? 0);
    setSent(s.count ?? 0);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  if (!profile) return <Screen>{null}</Screen>;

  return (
    <TabSwipe current="profile">
      <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
          <GradientRing size={110}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={{ fontSize: 40 }}>👤</Text>
              </View>
            )}
          </GradientRing>
          <Text style={styles.name}>{shownNameOf(profile)}</Text>
          <Text style={{ color: colors.faint }}>@{profile.anonymous_alias}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
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

        <GlowCard style={{ marginTop: spacing.lg }}>
          <InfoRow label={t('profile.userId')} value={profile.id} mono />
          <InfoRow
            label={t('profile.username')}
            value={profile.username ? `@${profile.username}` : '—'}
          />
          <InfoRow label={t('profile.bio')} value={profile.bio ?? t('profile.noBio')} />
          <InfoRow
            label={t('profile.memberSince')}
            value={new Date(profile.created_at).toLocaleDateString()}
          />
        </GlowCard>

        <View style={styles.statsRow}>
          <GlowCard style={styles.stat}>
            <Text style={styles.statNum}>{received}</Text>
            <Text style={styles.statLabel}>🎁 {t('profile.giftsReceived')}</Text>
          </GlowCard>
          <GlowCard style={styles.stat}>
            <Text style={styles.statNum}>{sent}</Text>
            <Text style={styles.statLabel}>📤 {t('profile.giftsSent')}</Text>
          </GlowCard>
        </View>

        {/* المستوى والخبرة */}
        {myLevel ? (
          <GlowCard style={{ marginTop: spacing.lg }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: fonts.sizes.md }}>
                ⭐ {t('level.level')} {myLevel.level}
              </Text>
              <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>
                {myLevel.xp} {t('level.xp')}
                {myLevel.next_at
                  ? ` • ${t('level.nextAt', { at: myLevel.next_at })}`
                  : ` • ${t('level.max')}`}
              </Text>
            </View>
            {myLevel.next_at ? (
              <View style={styles.levelBarBg}>
                <View
                  style={[
                    styles.levelBarFill,
                    {
                      width: `${Math.min(100, Math.round((myLevel.xp / myLevel.next_at) * 100))}%`,
                    },
                  ]}
                />
              </View>
            ) : null}
          </GlowCard>
        ) : null}

        {/* الدعوات */}
        <GlowCard style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fonts.sizes.md }}>
            🎁 {t('referral.title')}
          </Text>
          <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 4, lineHeight: 19 }}>
            {t('referral.desc')}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: spacing.sm,
            }}>
            <Text
              selectable
              style={{
                color: colors.gold,
                fontSize: fonts.sizes.lg,
                fontWeight: fonts.weights.black,
                letterSpacing: 1,
              }}>
              {refCode}
            </Text>
            <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>
              {t('referral.invited', { count: refCount })}
            </Text>
          </View>
        </GlowCard>

        {/* الإنجازات */}
        <Text style={styles.sectionTitle}>🏆 {t('achievements.title')}</Text>
        <View style={styles.achGrid}>
          {ACHIEVEMENT_KEYS.map((k) => {
            const has = achievements.includes(k);
            return (
              <View key={k} style={[styles.achItem, !has && { opacity: 0.35 }]}>
                <Text style={{ fontSize: 24 }}>{has ? '🏅' : '🔒'}</Text>
                <Text style={styles.achLabel}>{t(`achievements.${k}`)}</Text>
              </View>
            );
          })}
        </View>

        <View style={{ gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.xl }}>
          <NeonButton
            title={t('profile.editProfile')}
            onPress={() => router.push('/edit-profile')}
          />
          <NeonButton
            title={`👀 ${t('visitors.title')}`}
            variant="ghost"
            onPress={() => router.push('/profile-visitors')}
          />
          <NeonButton
            title={`🎯 ${t('quests.title')}`}
            variant="ghost"
            onPress={() => router.push('/quests')}
          />
          {profile.is_admin ? (
            <NeonButton
              title={`🛠 ${t('admin.title')}`}
              variant="gold"
              onPress={() => router.push('/admin')}
            />
          ) : null}
          <NeonButton
            title={t('profile.privacySettings')}
            variant="ghost"
            onPress={() => router.push('/edit-profile')}
          />
        </View>
      </ScrollView>
    </Screen>
    </TabSwipe>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>{label}</Text>
      <Text
        selectable
        style={{
          color: colors.text,
          fontSize: fonts.sizes.sm,
          fontFamily: mono ? 'monospace' : undefined,
          flexShrink: 1,
          textAlign: 'right',
        }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 104, height: 104, borderRadius: 52 },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  name: {
    color: colors.text,
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.black,
    marginTop: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  achItem: {
    width: '31%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 5,
  },
  achLabel: {
    color: colors.text,
    fontSize: fonts.sizes.xs,
    textAlign: 'center',
    lineHeight: 15,
  },
  levelBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceLight,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  levelBarFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 4 },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { color: colors.text, fontSize: fonts.sizes.xxl, fontWeight: fonts.weights.black },
  statLabel: { color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 2 },
});
