import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, GlowCard, NeonButton, Screen } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { shownNameOf } from '../../lib/types';
import { avatarSignedUrl } from '../../services/profile';
import { colors, fonts, spacing } from '../../theme';

export default function ProfileTab() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [received, setReceived] = useState(0);
  const [sent, setSent] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    setAvatar(await avatarSignedUrl(profile.avatar_url));
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
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={{ fontSize: 40 }}>👤</Text>
            </View>
          )}
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

        <View style={{ gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.xl }}>
          <NeonButton
            title={t('profile.editProfile')}
            onPress={() => router.push('/edit-profile')}
          />
          <NeonButton
            title={t('profile.privacySettings')}
            variant="ghost"
            onPress={() => router.push('/edit-profile')}
          />
        </View>
      </ScrollView>
    </Screen>
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
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { color: colors.text, fontSize: fonts.sizes.xxl, fontWeight: fonts.weights.black },
  statLabel: { color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 2 },
});
