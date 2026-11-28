import React, { useCallback, useState, useMemo } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { TabSwipe } from '../../components/TabSwipe';
import { useTranslation } from 'react-i18next';
import { Chip, GlowCard, NeonButton, Screen } from '../../components/ui';
import { Skeleton } from '../../components/Skeleton';
import { GlassIconChip } from '../../components/GlassIconButton';
import { Avatar } from '../../components/Avatar';
import { useAuth } from '../../contexts/AuthContext';
import { appAlert } from '../../lib/dialog';
import { supabase } from '../../lib/supabase';
import { shownNameOf } from '../../lib/types';
import {
  fetchMyLevel,
  fetchMyReferralCount,
  type MyLevel,
} from '../../services/economy';
import { fetchMyReferralStats, fetchTimeline } from '../../services/timeline';
import { fetchPublicProfile } from '../../services/social';
import PostCard from '../../components/PostCard';
import type { Post } from '../../lib/types';
import { ACHIEVEMENT_KEYS, fetchMyAchievements } from '../../services/features';
import { avatarSignedUrl } from '../../services/profile';
import { fonts, radius, spacing } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
export default function ProfileTab() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [received, setReceived] = useState(0);
  const [sent, setSent] = useState(0);
  const [achievements, setAchievements] = useState<string[]>([]);
  const [myLevel, setMyLevel] = useState<MyLevel | null>(null);
  const [refCode, setRefCode] = useState('');
  const [refCount, setRefCount] = useState(0);
  const [refEarned, setRefEarned] = useState(0);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  /** عدّادات المتابعة — بتيجي من get_public_profile (null لحد ما الهجرة تتطبق) */
  const [followersCount, setFollowersCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  /** أول تحميل اكتمل؟ — الأرقام بتبدأ 0، فقبل التحميل لازم هياكل مش 0/0 */
  const [firstLoaded, setFirstLoaded] = useState(false);

  const inviteLink = `https://mohamedabdo621.github.io/Darklink1/register?ref=${refCode}`;

  const shareInvite = async () => {
    if (!refCode) return;
    await Share.share({
      message: t('referral.shareText', { code: refCode, link: inviteLink }),
    });
  };

  /** مشاركة البوستر: نص جاهز فيه الكود والرابط (نفس محتوى البوستر).
   *  تصدير البوستر كصورة فعلية محتاج react-native-view-shot — مش
   *  مثبّتة، فمفيش تثبيت جديد هنا؛ المشاركة النصية هي المتاحة دلوقتي. */
  const sharePoster = async () => {
    if (!refCode) return;
    await Share.share({
      message:
        '🌙 DARKLINK — انضم عن طريقي وخد 25 جوهرة هدية!\n' +
        `كود الدعوة: ${refCode}\n` +
        `الرابط: ${inviteLink}`,
    });
  };

  const copyInviteCode = async () => {
    if (!refCode) return;
    await Clipboard.setStringAsync(refCode);
    appAlert('✓', t('referral.copied'));
  };

  const load = useCallback(async () => {
    if (!profile) return;
    setAvatar(await avatarSignedUrl(profile.avatar_url));
    setAchievements(await fetchMyAchievements(profile.id));
    setMyLevel(await fetchMyLevel());
    setMyPosts((await fetchTimeline(undefined, 'mine')).slice(0, 3));
    const pub = await fetchPublicProfile(profile.id);
    if (pub) {
      setFollowersCount(pub.followers_count ?? null);
      setFollowingCount(pub.following_count ?? null);
    }
    const stats = await fetchMyReferralStats();
    if (stats) {
      setRefCode(stats.code);
      setRefCount(stats.invited);
      setRefEarned(stats.gems_earned);
    } else {
      setRefCount(await fetchMyReferralCount(profile.id));
    }
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
    setFirstLoaded(true);
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
          <Avatar uri={avatar} name={shownNameOf(profile)} size={110} />
          {/* شارة VIP جنب الاسم نفسه (الشريحة اللي تحت لسه موجودة) */}
          <Text style={styles.name}>
            {shownNameOf(profile)}
            {profile.is_vip ? ' 👑' : ''}
          </Text>
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
          {/* عدّادات المتابعة — دوسة بتفتح قائمة الأسماء */}
          <View style={styles.followRow}>
            <TouchableOpacity
              style={styles.followStat}
              onPress={() =>
                router.push({
                  pathname: '/follow-list',
                  params: { userId: profile.id, type: 'followers' },
                })
              }>
              <Text style={styles.followNum}>
                {followersCount !== null ? followersCount : '—'}
              </Text>
              <Text style={styles.followLabel}>المتابعون</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.followStat}
              onPress={() =>
                router.push({
                  pathname: '/follow-list',
                  params: { userId: profile.id, type: 'following' },
                })
              }>
              <Text style={styles.followNum}>
                {followingCount !== null ? followingCount : '—'}
              </Text>
              <Text style={styles.followLabel}>يتابع</Text>
            </TouchableOpacity>
          </View>
        </View>

        <GlowCard style={{ marginTop: spacing.lg }}>
          <InfoRow
            label={t('profile.accountId')}
            value={profile.public_id ? String(profile.public_id) : '—'}
            mono
            onCopy={
              profile.public_id
                ? async () => {
                    await Clipboard.setStringAsync(String(profile.public_id));
                    appAlert('✓', t('profile.accountIdCopied'));
                  }
                : undefined
            }
          />
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
            {!firstLoaded ? (
              <Skeleton width="50%" height={26} borderRadius={8} />
            ) : (
              <Text style={styles.statNum}>{received}</Text>
            )}
            <View style={styles.statLabelRow}>
              <GlassIconChip name="gift-outline" size={13} />
              <Text style={styles.statLabel}>{t('profile.giftsReceived')}</Text>
            </View>
          </GlowCard>
          <GlowCard style={styles.stat}>
            {!firstLoaded ? (
              <Skeleton width="50%" height={26} borderRadius={8} />
            ) : (
              <Text style={styles.statNum}>{sent}</Text>
            )}
            <View style={styles.statLabelRow}>
              <GlassIconChip name="paper-plane-outline" size={13} />
              <Text style={styles.statLabel}>{t('profile.giftsSent')}</Text>
            </View>
          </GlowCard>
        </View>

        {/* منشوراتي — المثبّت أولاً */}
        {myPosts.length > 0 ? (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.sectionTitle}>{t('profile.myPosts')}</Text>
            {myPosts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                currentUserId={profile.id}
                isAdmin={profile.is_admin}
                onChanged={(np) =>
                  setMyPosts((prev) => prev.map((x) => (x.id === np.id ? np : x)))
                }
                onDeleted={(id) => setMyPosts((prev) => prev.filter((x) => x.id !== id))}
                onOpenComments={(pp) =>
                  router.push({ pathname: '/post/[id]', params: { id: pp.id } })
                }
              />
            ))}
          </View>
        ) : null}

        {/* المستوى والخبرة */}
        {myLevel ? (
          <GlowCard style={{ marginTop: spacing.lg }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <GlassIconChip name="star-outline" size={14} color={colors.gold} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: fonts.sizes.md }}>
                  {t('level.level')} {myLevel.level}
                </Text>
              </View>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <GlassIconChip name="gift-outline" size={14} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: fonts.sizes.md }}>
              {t('referral.title')}
            </Text>
          </View>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <GlassIconChip name="diamond-outline" size={13} color={colors.gold} />
            <Text style={{ color: colors.gold, fontSize: fonts.sizes.sm, fontWeight: '700' }}>
              {t('referral.earned', { count: refEarned })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <View style={{ flex: 1 }}>
              <NeonButton
                title={t('referral.share')}
                icon="paper-plane-outline"
                onPress={shareInvite}
              />
            </View>
            <View style={{ flex: 1 }}>
              <NeonButton
                title={t('referral.copy')}
                icon="copy-outline"
                variant="ghost"
                onPress={copyInviteCode}
              />
            </View>
          </View>
          {/* بوستر الدعوة — بطاقة جاهزة للمشاركة (كود + رابط + مكافأة).
              تصديرها كصورة محتاج react-native-view-shot (مش مثبّتة)؛
              زرار "مشاركة البوستر" بيشارك نفس المحتوى كنص دلوقتي. */}
          {firstLoaded && refCode ? (
            <View style={{ marginTop: spacing.md }}>
              <LinearGradient
                colors={['#7c3aed', '#a855f7', '#d946ef']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.poster}>
                <Text style={styles.posterLogo}>DARKLINK 🌙</Text>
                <Text style={styles.posterTag}>انضم وخد 25 جوهرة هدية!</Text>
                <Text style={styles.posterCode}>{refCode}</Text>
                <Text style={styles.posterLink} numberOfLines={1}>
                  {inviteLink}
                </Text>
                <Text style={styles.posterName}>{shownNameOf(profile)}</Text>
              </LinearGradient>
              <View style={{ height: spacing.sm }} />
              <NeonButton
                title="مشاركة البوستر"
                icon="share-social-outline"
                variant="ghost"
                onPress={sharePoster}
              />
            </View>
          ) : null}
        </GlowCard>

        {/* الإنجازات */}
        <View style={styles.sectionTitleRow}>
          <GlassIconChip name="trophy-outline" size={15} color={colors.gold} />
          <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>
            {t('achievements.title')}
          </Text>
        </View>
        <View style={styles.achGrid}>
          {ACHIEVEMENT_KEYS.map((k) => {
            const has = achievements.includes(k);
            return (
              <View key={k} style={[styles.achItem, !has && { opacity: 0.35 }]}>
                <Ionicons
                  name={has ? 'trophy' : 'lock-closed-outline'}
                  size={24}
                  color={has ? colors.gold : colors.muted}
                />
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
            title={t('visitors.title')}
            icon="eye-outline"
            variant="ghost"
            onPress={() => router.push('/profile-visitors')}
          />
          <NeonButton
            title={t('quests.title')}
            icon="list-outline"
            variant="ghost"
            onPress={() => router.push('/quests')}
          />
          {profile.is_admin ? (
            <NeonButton
              title={t('admin.title')}
              icon="construct-outline"
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
        {/* مساحة سفلية على الويب بس: الشريط السفلي position:fixed فوق
            المحتوى، ومن غيرها آخر العناصر بتقعد تحته. */}
        <View style={{ height: Platform.OS === 'web' ? 86 : 0 }} />
      </ScrollView>
    </Screen>
    </TabSwipe>
  );
}

function InfoRow({
  label,
  value,
  mono,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onCopy?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.infoRow}>
      <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
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
        {onCopy ? (
          <TouchableOpacity onPress={onCopy} hitSlop={8}>
            <Ionicons name="copy-outline" size={16} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
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
  /** صف عنوان قسم: شريحة أيقونة زجاجية + العنوان */
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 2,
  },
  statLabel: { color: colors.muted, fontSize: fonts.sizes.sm },
  poster: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  posterLogo: {
    color: colors.white,
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.black,
    letterSpacing: 3,
  },
  posterTag: { color: colors.white, fontSize: fonts.sizes.md, fontWeight: '700' },
  posterCode: {
    color: colors.white,
    fontSize: fonts.sizes.hero,
    fontWeight: fonts.weights.black,
    letterSpacing: 2,
    marginTop: spacing.sm,
  },
  posterLink: { color: 'rgba(255,255,255,0.85)', fontSize: fonts.sizes.xs },
  posterName: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: fonts.sizes.sm,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
});
