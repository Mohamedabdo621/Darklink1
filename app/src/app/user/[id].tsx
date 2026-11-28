import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { appAlert, appPrompt } from '../../lib/dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chip, GlowCard, NeonButton, Screen } from '../../components/ui';
import { GlassIconChip } from '../../components/GlassIconButton';
import { Avatar } from '../../components/Avatar';
import { formatTimeAr } from '../../lib/format';
import { useAuth } from '../../contexts/AuthContext';
import { giftEmoji, giftImage } from '../../lib/giftAssets';
import type { PublicProfile } from '../../lib/types';
import { getOrCreateConversation } from '../../services/chat';
import { fetchUserLevel } from '../../services/economy';
import { recordProfileVisit } from '../../services/features';
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
import { fonts, radius, spacing } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
export default function UserProfile() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: me } = useAuth();
  const [user, setUser] = useState<PublicProfile | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [gifts, setGifts] = useState<ReceivedGiftSummary[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [seenText, setSeenText] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!id || !me) return;
    // الـ id ممكن يكون الكود العام (A-1…) أو UUID قديم — الملف بيرجع
    // الـ UUID الداخلي، وباقي الطلبات (هدايا/مستوى/حظر/زيارة) بتستخدمه.
    const u = await fetchPublicProfile(id);
    if (!u) {
      setUser(null);
      setLoaded(true);
      return;
    }
    const [g, b] = await Promise.all([
      fetchReceivedGifts(u.id),
      isBlockedByMe(me.id, u.id),
    ]);
    setUser(u);
    setGifts(g);
    setBlocked(b);
    setLevel(await fetchUserLevel(u.id));
    setAvatar(await avatarSignedUrl(u.avatar_url));
    recordProfileVisit(u.id);
    if (u.last_seen_at) {
      const seen = new Date(u.last_seen_at);
      setSeenText(
        Date.now() - seen.getTime() < 90000
          ? `● ${t('chat.online')}`
          : `${t('chat.lastSeen')} ${formatTimeAr(seen)}`,
      );
    } else setSeenText(null);
    setLoaded(true);
  }, [id, me, t]);

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
      if (!blocked) appAlert(t('userProfile.blocked'));
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
          <Avatar uri={avatar} name={user.shown_name} size={104} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md }}>
            <Text style={[styles.name, { marginTop: 0 }]}>{user.shown_name}</Text>
            {user.follows_me ? (
              <View style={styles.followsYouBadge}>
                <Text style={styles.followsYouText}>يتابعك</Text>
              </View>
            ) : null}
          </View>
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
            {level ? <Chip label={`⭐ ${t('level.level')} ${level}`} /> : null}
          </View>
          {/* عدّادات المتابعة — دوسة بتفتح قائمة الأسماء */}
          <View style={styles.followRow}>
            <TouchableOpacity
              style={styles.followStat}
              onPress={() =>
                router.push({
                  pathname: '/follow-list',
                  params: { userId: user.id, type: 'followers' },
                })
              }>
              <Text style={styles.followNum}>
                {user.followers_count !== undefined ? user.followers_count : '—'}
              </Text>
              <Text style={styles.followLabel}>المتابعون</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.followStat}
              onPress={() =>
                router.push({
                  pathname: '/follow-list',
                  params: { userId: user.id, type: 'following' },
                })
              }>
              <Text style={styles.followNum}>
                {user.following_count !== undefined ? user.following_count : '—'}
              </Text>
              <Text style={styles.followLabel}>يتابع</Text>
            </TouchableOpacity>
          </View>
          {seenText ? (
            <Text style={{ color: colors.faint, fontSize: fonts.sizes.xs, marginTop: spacing.sm }}>
              {seenText}
            </Text>
          ) : null}
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
          {user.interests?.length ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
                justifyContent: 'center',
                marginTop: spacing.sm,
              }}>
              {user.interests.map((k) => (
                <Chip key={k} label={t(`interests.${k}`)} />
              ))}
            </View>
          ) : null}
        </View>

        {/* الكود العام للحساب (A-1…) — دوسة بتنسخه */}
        {user.public_code ? (
          <TouchableOpacity
            style={styles.accountIdRow}
            onPress={async () => {
              await Clipboard.setStringAsync(user.public_code as string);
              appAlert('✓', t('profile.accountIdCopied'));
            }}>
            <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>
              {t('profile.accountId')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}>
              <Text
                style={{
                  color: colors.text,
                  fontSize: fonts.sizes.sm,
                  fontFamily: 'monospace',
                }}>
                {user.public_code}
              </Text>
              <Ionicons name="copy-outline" size={14} color={colors.muted} />
            </View>
          </TouchableOpacity>
        ) : null}

        <View style={styles.sectionRow}>
          <GlassIconChip name="gift-outline" size={15} />
          <Text style={[styles.section, { marginTop: 0, marginBottom: 0 }]}>
            {t('userProfile.receivedGifts')}
          </Text>
        </View>
        {gifts.length === 0 ? (
          <Text style={{ color: colors.muted }}>{t('userProfile.noGifts')}</Text>
        ) : (
          <View style={styles.giftGrid}>
            {gifts.map((g) => (
              <View key={g.name_key} style={styles.giftItem}>
                {giftImage(g.asset) ? (
                  <Image source={giftImage(g.asset)} style={styles.giftImg} />
                ) : giftEmoji(g.asset) ? (
                  <Text style={{ fontSize: 34 }}>{giftEmoji(g.asset)}</Text>
                ) : null}
                <Text style={{ color: colors.text, fontSize: fonts.sizes.xs }}>
                  {t(`gifts.${g.name_key}`)} ×{g.total}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
          <NeonButton
            title={t('profile.sendMessage')}
            icon="chatbubble-outline"
            onPress={startChat}
          />
          <NeonButton
            title={t('profile.sendGift')}
            icon="gift-outline"
            variant="gold"
            onPress={() =>
              router.push({ pathname: '/gift-picker', params: { userId: user.id } })
            }
          />
          <NeonButton
            title={t('transfer.title')}
            icon="swap-horizontal-outline"
            variant="ghost"
            onPress={() =>
              router.push({
                pathname: '/transfer',
                params: { userId: user.id, name: user.shown_name },
              })
            }
          />
        </View>

        <GlowCard style={{ marginTop: spacing.lg, marginBottom: spacing.xl }}>
          <TouchableOpacity style={styles.row} onPress={toggleBlock}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <GlassIconChip name="ban-outline" size={14} danger />
              <Text style={{ color: colors.danger, fontSize: fonts.sizes.md }}>
                {blocked ? t('userProfile.unblock') : t('userProfile.block')}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={report}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <GlassIconChip name="flag-outline" size={14} />
              <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
                {t('userProfile.report')}
              </Text>
            </View>
          </TouchableOpacity>
        </GlowCard>
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
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
  /** شارة «يتابعك» — بتظهر جنب الاسم لما صاحب الملف بيتابعني */
  followsYouBadge: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(168,85,247,0.15)',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  followsYouText: { color: colors.primaryBright, fontSize: fonts.sizes.sm, fontWeight: '700' },
  followRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  followStat: { alignItems: 'center' },
  followNum: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.black,
  },
  followLabel: { color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 2 },
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
  /** صف عنوان قسم: شريحة أيقونة زجاجية + العنوان */
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  giftItem: { alignItems: 'center', width: 72, gap: 4 },
  giftImg: { width: 56, height: 56, borderRadius: 12 },
  row: { paddingVertical: spacing.md },
  accountIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
  },
});
