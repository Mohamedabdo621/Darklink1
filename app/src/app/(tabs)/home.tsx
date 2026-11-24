import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, GlowCard, Logo, Screen } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { shownNameOf, type Wallet } from '../../lib/types';
import { avatarSignedUrl } from '../../services/profile';
import { fetchUnreadNotifications } from '../../services/wallet';
import { colors, fonts, radius, spacing } from '../../theme';

export default function Home() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

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
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!profile) return <Screen>{null}</Screen>;

  const name = shownNameOf(profile);

  return (
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
        </View>
      </ScrollView>
    </Screen>
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
