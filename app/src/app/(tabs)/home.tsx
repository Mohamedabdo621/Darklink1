import React, { useCallback, useState, useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { TabSwipe } from '../../components/TabSwipe';
import { useTranslation } from 'react-i18next';
import { Chip, GlowCard, Logo, NeonButton, Screen } from '../../components/ui';
import { Skeleton } from '../../components/Skeleton';
import { Avatar } from '../../components/Avatar';
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
import { fonts, radius, spacing, textGlow } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
interface StoryGroup {
  userId: string;
  user: PublicProfile | null;
  avatar: string | null;
  count: number;
  mine: boolean;
}

export default function Home() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  /** أول تحميل اكتمل؟ — قبلها مفيش أي رقم/حالة بتتعرض (لا "0 جواهر" ولا
   *  "استلمت ✓" كاذبة): هياكل بس. بعد أول تحميل البيانات القديمة بتفضل
   *  ظاهرة لحد ما الجديد ييجي (مفيش وميض هياكل مع كل رجوع للصفحة). */
  const [firstLoaded, setFirstLoaded] = useState(false);

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
        t('achievements.unlocked'),
        fresh.map((k) => '• ' + t(`achievements.${k}`)).join('\n'),
      );
    }
    setFirstLoaded(true);
  }, [profile, t]);

  const onClaim = async () => {
    setClaiming(true);
    const res = await claimDailyReward();
    setClaiming(false);
    if (res?.claimed) {
      appAlert(
        t('home.dailyTitle'),
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
  // مجموعتي أنا (لو عندي ستوريهات) — بتظهر أول واحد في الصف
  const myGroup = storyGroups.find((g) => g.mine);

  return (
    <TabSwipe current="home">
      <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Logo size={24} />
          <TouchableOpacity
            onPress={() => router.push('/notifications')}
            style={styles.bell}>
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
            {/* الشارة بتظهر بس بعد ما عدد غير المقروء يتحمل فعلًا:
                قبلها 0 مش معناها "مفيش إشعارات" — معناها "لسه متحملش".
                والعدد بيتصفّر بجد لما تفتح صفحة الإشعارات (هي اللي بتعلّم
                الكل كمقروء)، فمقارنة لقطتين قبل/بعد فتحها مش اختلاف ثيم. */}
            {firstLoaded && unreadNotifs > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={{ color: colors.white, fontSize: 9, fontWeight: '700' }}>
                  {unreadNotifs}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* شريط الستوري */}
        {!firstLoaded ? (
          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width={68} height={68} borderRadius={34} />
            ))}
          </View>
        ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: spacing.md }}
          contentContainerStyle={{ gap: spacing.md, paddingVertical: 2 }}>
          {/* "قصتي": لو عندي ستوريهات الدوس عليها يفتح الستوري بتاعي (وضع المالك)،
              ولو مفيش يفتح إنشاء قصة جديدة — وعلامة + بتضيف قصة جديدة على طول */}
          <TouchableOpacity
            style={styles.storyItem}
            onPress={() =>
              myGroup
                ? router.push({
                    pathname: '/story-viewer',
                    params: { userId: profile.id },
                  })
                : router.push('/story-new')
            }>
            <View>
              <Avatar uri={avatar} name={name} size={72} />
              <TouchableOpacity
                style={styles.storyPlus}
                onPress={() => router.push('/story-new')}>
                <Text style={{ color: colors.white, fontSize: 13, fontWeight: '700' }}>
                  +
                </Text>
              </TouchableOpacity>
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
                <Avatar uri={g.avatar} name={g.user?.shown_name} size={72} />
                <Text style={styles.storyLabel} numberOfLines={1}>
                  {g.user?.shown_name ?? '—'}
                </Text>
              </TouchableOpacity>
            ))}
        </ScrollView>
        )}

        <GlowCard style={styles.identityCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Avatar uri={avatar} name={name} size={68} />
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="diamond" size={15} color={colors.accent} />
            <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>
              {t('home.balance')}
            </Text>
          </View>
          {!firstLoaded ? (
            <Skeleton width="45%" height={34} borderRadius={8} style={{ marginTop: 8 }} />
          ) : (
            <Text style={styles.balance}>
              {wallet?.balance ?? 0}{' '}
              <Text style={{ fontSize: fonts.sizes.md, color: colors.accent }}>
                {t('common.gems')}
              </Text>
            </Text>
          )}
        </GlowCard>

        {/* المكافأة اليومية — تحذير: daily بيبدأ null، والنص القديم كان
            بيعتبر أي قيمة غير claimable = "استلمت ✓"، فأثناء التحميل
            أو لو الـ RPC فشل كانت البطاقة بتقول "استلمت" من غير ما
            يتستلم حاجة (ده سبب اختلاف الفاتح/الغامق: لقطة قبل وبعد
            اكتمال الجلب، مش بيانات مختلفة حسب الثيم — الـ RPC خادمي
            وملوش أي علاقة بالثيم). دلوقتي: هيكل أثناء التحميل، ولو
            الجلب فشل بعد التحميل بتظهر "تعذّر التحميل" مع إعادة محاولة،
            ومفيش حكم "استلمت" إلا لما daily_status يرجع claimable=false. */}
        <GlowCard style={styles.walletCard}>
          {!firstLoaded ? (
            <View style={{ gap: 10 }}>
              <Skeleton width="60%" height={16} borderRadius={8} />
              <Skeleton width="40%" height={14} borderRadius={7} />
            </View>
          ) : daily === null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Ionicons name="gift-outline" size={30} color={colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: fonts.sizes.md, fontWeight: fonts.weights.bold }}>
                  {t('home.dailyTitle')}
                </Text>
                <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 2 }}>
                  تعذّر تحميل الحالة — دوس لإعادة المحاولة
                </Text>
              </View>
              <TouchableOpacity onPress={() => void load()} hitSlop={8}>
                <Ionicons name="refresh-outline" size={24} color={colors.primaryBright} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Ionicons name="gift-outline" size={30} color={colors.accent} />
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
            </>
          )}
        </GlowCard>

        <Text style={styles.sectionTitle}>{t('home.shortcuts')}</Text>
        <View style={styles.grid}>
          <Shortcut
            icon="compass"
            label={t('tabs.discover')}
            onPress={() => router.push('/(tabs)/discover')}
          />
          <Shortcut
            icon="chatbubbles"
            label={t('tabs.chats')}
            onPress={() => router.push('/(tabs)/chats')}
          />
          <Shortcut
            icon="pencil"
            label={t('home.editProfile')}
            onPress={() => router.push('/edit-profile')}
          />
          <Shortcut
            icon="settings"
            label={t('home.settings')}
            onPress={() => router.push('/settings')}
          />
          <Shortcut
            icon="person"
            label={t('tabs.profile')}
            onPress={() => router.push('/(tabs)/profile')}
          />
          <Shortcut
            icon="trophy"
            label={t('home.leaderboard')}
            onPress={() => router.push('/leaderboard')}
          />
          <Shortcut
            icon="sparkles"
            label={t('ai.title')}
            onPress={() => router.push('/ai-chat')}
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

function Shortcut({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // بلاطة زجاجية واحدة (نفس نظام GlowCard): BlurView فوق خلفية شفافة،
  // من غير أي ظل/elevation — الـ elevation مع خلفية شفافة على أندرويد
  // كان بيرسم مستطيل صلب (مربعات بيضاء في الفاتح / غامقة في الداكن).
  return (
    <TouchableOpacity onPress={onPress} style={styles.shortcut}>
      <BlurView
        intensity={resolved === 'light' ? 20 : 32}
        tint={resolved === 'light' ? 'light' : 'dark'}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.shortcutContent}>
        <Ionicons name={icon as never} size={28} color={colors.primaryBright} />
        <Text style={styles.shortcutLabel}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
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
    ...textGlow,
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
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    overflow: 'hidden',
  },
  shortcutContent: {
    position: 'relative',
    alignItems: 'center',
    gap: spacing.sm,
  },
  shortcutLabel: { color: colors.text, fontSize: fonts.sizes.sm, fontWeight: fonts.weights.medium },
});
