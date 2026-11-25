import React, { useCallback, useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { appAlert, appPrompt } from '../../lib/dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, GlowCard, NeonButton, Screen } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { giftImage } from '../../lib/giftAssets';
import type { PublicProfile } from '../../lib/types';
import { getOrCreateConversation } from '../../services/chat';
import { avatarSignedUrl } from '../../services/profile';
import {
  blockUser,
  fetchPublicProfile,
  fetchReceivedGifts,
  isBlockedByMe,
  reportUser,
  unblockUser,
  type ReceivedGiftSummary,
} from '../../services/social';
import { colors, fonts, spacing } from '../../theme';

export default function UserProfile() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useAuth();
  const [user, setUser] = useState<PublicProfile | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [gifts, setGifts] = useState<ReceivedGiftSummary[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!id || !me) return;
    const [u, g, b] = await Promise.all([
      fetchPublicProfile(id),
      fetchReceivedGifts(id),
      isBlockedByMe(me.id, id),
    ]);
    setUser(u);
    setGifts(g);
    setBlocked(b);
    if (u) setAvatar(await avatarSignedUrl(u.avatar_url));
    setLoaded(true);
  }, [id, me]);

  useEffect(() => {
    // تحميل الملف عند الفتح (نمط جلب بيانات قياسي)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (!me) return <Screen>{null}</Screen>;
  if (loaded && !user) {
    return (
      <Screen>
        <Text style={styles.notFound}>{t('userProfile.notFound')}</Text>
      </Screen>
    );
  }
  if (!user) return <Screen>{null}</Screen>;

  const startChat = async () => {
    const cid = await getOrCreateConversation(user.id);
    if (!cid) {
      appAlert(t('common.error'), t('chat.blockedNotice'));
      return;
    }
    router.push({ pathname: '/chat/[id]', params: { id: cid } });
  };

  const toggleBlock = async () => {
    const ok = blocked
      ? await unblockUser(me.id, user.id)
      : await blockUser(me.id, user.id);
    if (ok) {
      if (!blocked) appAlert('🚫', t('userProfile.blocked'));
      setBlocked(!blocked);
    }
  };

  const report = () => {
    appPrompt(
      t('userProfile.report'),
      t('userProfile.reportReason'),
      t('common.send'),
      async (reason) => {
        if (!reason?.trim()) return;
        const ok = await reportUser(me.id, user.id, reason.trim());
        if (ok) appAlert('✓', t('userProfile.reportSent'));
      },
    );
  };

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
          <Text style={styles.name}>{user.shown_name}</Text>
          {user.username ? (
            <Text style={{ color: colors.faint }}>@{user.username}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: spacing.sm }}>
            <Chip
              label={
                user.identity_mode === 'anonymous'
                  ? `🕶 ${t('common.anonymous')}`
                  : `🌐 ${t('common.public')}`
              }
            />
            {user.is_vip ? <Chip label="👑 VIP" gold /> : null}
          </View>
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
        </View>

        <Text style={styles.section}>🎁 {t('userProfile.receivedGifts')}</Text>
        {gifts.length === 0 ? (
          <Text style={{ color: colors.muted }}>{t('userProfile.noGifts')}</Text>
        ) : (
          <View style={styles.giftGrid}>
            {gifts.map((g) => (
              <View key={g.name_key} style={styles.giftItem}>
                {giftImage(g.asset) ? (
                  <Image source={giftImage(g.asset)} style={styles.giftImg} />
                ) : null}
                <Text style={{ color: colors.text, fontSize: fonts.sizes.xs }}>
                  {t(`gifts.${g.name_key}`)} ×{g.total}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          <NeonButton title={`💬 ${t('profile.sendMessage')}`} onPress={startChat} />
          <NeonButton
            title={`🎁 ${t('profile.sendGift')}`}
            variant="gold"
            onPress={() =>
              router.push({ pathname: '/gift-picker', params: { userId: user.id } })
            }
          />
        </View>

        <GlowCard style={{ marginTop: spacing.lg, marginBottom: spacing.xl }}>
          <TouchableOpacity style={styles.row} onPress={toggleBlock}>
            <Text style={{ color: colors.danger, fontSize: fonts.sizes.md }}>
              🚫 {blocked ? t('userProfile.unblock') : t('userProfile.block')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={report}>
            <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
              ⚑ {t('userProfile.report')}
            </Text>
          </TouchableOpacity>
        </GlowCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notFound: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 80,
    fontSize: fonts.sizes.md,
  },
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
  bio: {
    color: colors.muted,
    fontSize: fonts.sizes.md,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 22,
  },
  section: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  giftItem: { alignItems: 'center', width: 72, gap: 4 },
  giftImg: { width: 56, height: 56, borderRadius: 12 },
  row: { paddingVertical: spacing.md },
});
