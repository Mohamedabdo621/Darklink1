import React, { useCallback, useState, useMemo } from 'react';
import { Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '../lib/dialog';
import { supabase } from '../lib/supabase';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GlowCard, NeonButton, Screen } from '../components/ui';
import GiftAnimation from '../components/GiftAnimation';
import { useAuth } from '../contexts/AuthContext';
import { giftEmoji, giftImage } from '../lib/giftAssets';
import type { GemPackage, Gift } from '../lib/types';
import { activateVipTier } from '../services/economy';
import { fetchGiftsCatalog, fetchPackages, fetchWallet } from '../services/wallet';
import { fonts, radius, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
/** أسعار VIP الافتراضية = القيم الحالية في app_config — احتياطي بس لحد
 *  ما الـ RPC يرجّع المفتاحين (انظر fetchVipPrices). */
const VIP_SILVER_FALLBACK = 500;
const VIP_GOLD_FALLBACK = 1000;

/** أسعار VIP من app_config — بنفس الطريق اللي بيجيب أرقام الكاش
 *  (RPC الـ public_cash_info اللي بيقرا app_config من السيرفر، لأن
 *  الجدول نفسه بلا وصول عميل). ملحوظة: الـ RPC الحالي بيرجّع بس
 *  vodafone/etisalat/bonus_pct — لازم يتضاف له المفتاحين
 *  vip_silver_price و vip_price_gems (migration) عشان القيم دي
 *  تيجي من الإعدادات فعلًا؛ لحد ما ده يحصل بيظهر الاحتياطي. */
async function fetchVipPrices(): Promise<{ silver: number; gold: number }> {
  const { data } = await supabase.rpc('public_cash_info');
  const d = (data ?? {}) as {
    vip_silver_price?: string | number;
    vip_price_gems?: string | number;
  };
  const silver = Number(d.vip_silver_price);
  const gold = Number(d.vip_price_gems);
  return {
    silver:
      Number.isFinite(silver) && silver > 0 ? silver : VIP_SILVER_FALLBACK,
    gold: Number.isFinite(gold) && gold > 0 ? gold : VIP_GOLD_FALLBACK,
  };
}

export default function Store() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile: me, refreshProfile } = useAuth();
  const [packages, setPackages] = useState<GemPackage[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [balance, setBalance] = useState(0);
  const [vipPrices, setVipPrices] = useState({
    silver: VIP_SILVER_FALLBACK,
    gold: VIP_GOLD_FALLBACK,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewGift, setPreviewGift] = useState<Gift | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    const [p, g, w, vip] = await Promise.all([
      fetchPackages(),
      fetchGiftsCatalog(),
      fetchWallet(me.id),
      fetchVipPrices(),
    ]);
    setPackages(p);
    setGifts(
      g.filter(
        (x) =>
          !x.seasonal ||
          !x.available_until ||
          new Date(x.available_until).getTime() > Date.now(),
      ),
    );
    if (w) setBalance(w.balance);
    setVipPrices(vip);
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!me) return <Screen>{null}</Screen>;

  // الشراء يدوي فقط حالياً: زر "شراء" يفتح شاشة التحويل اليدوي
  // (فودافون/اتصالات كاش) — لا جواهر فورية. الشراء عبر Google Play
  // سيُفعّل لاحقاً عند النشر على المتجر (purchasePackage يبقى جاهزاً).
  const buy = (pkg: GemPackage) => {
    router.push({
      pathname: '/manual-pay',
      params: {
        packageId: pkg.id,
        gems: String(pkg.gems),
        price: String(pkg.price_egp),
      },
    });
  };

  const buyVipTier = (tier: 'silver' | 'gold') => {
    const price = tier === 'silver' ? vipPrices.silver : vipPrices.gold;
    appAlert(
      tier === 'silver' ? `🥈 ${t('store.vipSilver')}` : `👑 ${t('store.vipGold')}`,
      t('store.vipPrice', { gems: price }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('store.vipActivate'),
          onPress: async () => {
            setBusyId(`vip-${tier}`);
            const res = await activateVipTier(tier);
            setBusyId(null);
            if (res.ok) {
              setBalance((b) => Math.max(0, b - price));
              await refreshProfile();
              appAlert('👑', t('store.vipSuccess'));
            } else if (res.error?.includes('insufficient_balance')) {
              appAlert(t('common.error'), t('store.insufficient'));
            } else {
              appAlert(t('common.error'), res.error ?? t('common.error'));
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('store.title')}</Text>
        <Text style={{ color: colors.muted, marginBottom: spacing.md }}>
          💎 {balance} {t('common.gems')}
        </Text>

        <Text style={styles.section}>{t('store.packages')}</Text>
        <View style={styles.grid}>
          {packages.map((pkg) => (
            <GlowCard key={pkg.id} style={styles.pkg}>
              <Ionicons name="diamond-outline" size={30} color={colors.primaryBright} />
              <Text style={styles.pkgGems}>{pkg.gems}</Text>
              <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>
                {t(`packages.${pkg.name_key}`)}
              </Text>
              <Text style={styles.pkgPrice}>
                {t('store.priceEgp', { price: pkg.price_egp })}
              </Text>
              <NeonButton
                title={t('store.buy')}
                loading={busyId === pkg.id}
                onPress={() => buy(pkg)}
              />
            </GlowCard>
          ))}
        </View>

        <Text style={styles.section}>👑 {t('store.vipTitle')}</Text>
        <GlowCard style={styles.vipCard}>
          <Text style={{ color: colors.text, fontSize: fonts.sizes.md, lineHeight: 22 }}>
            {t('store.vipDesc')}
          </Text>
          {me.is_vip && me.vip_until ? (
            <Text style={{ color: colors.gold, marginTop: spacing.sm, fontWeight: '700' }}>
              {me.vip_tier === 'silver' ? '🥈' : '👑'}{' '}
              {t('store.vipActive', {
                date: new Date(me.vip_until).toLocaleDateString(),
              })}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                🥈 {t('store.vipSilver')}
              </Text>
              <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>
                {t('store.vipPrice', { gems: vipPrices.silver })}
              </Text>
              <NeonButton
                title={t('store.vipActivate')}
                loading={busyId === 'vip-silver'}
                onPress={() => buyVipTier('silver')}
              />
            </View>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Text style={{ color: colors.gold, fontWeight: '700' }}>
                👑 {t('store.vipGold')}
              </Text>
              <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>
                {t('store.vipPrice', { gems: vipPrices.gold })}
              </Text>
              <NeonButton
                title={t('store.vipActivate')}
                variant="gold"
                loading={busyId === 'vip-gold'}
                onPress={() => buyVipTier('gold')}
              />
            </View>
          </View>
        </GlowCard>

        <Text style={styles.section}>{t('store.giftsCatalog')}</Text>
        <View style={styles.grid}>
          {gifts.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={styles.giftItem}
              activeOpacity={0.85}
              onPress={() => setPreviewGift(g)}>
              {giftImage(g.asset) ? (
                <Image source={giftImage(g.asset)} style={styles.giftImg} />
              ) : giftEmoji(g.asset) ? (
                <Text style={{ fontSize: 40 }}>{giftEmoji(g.asset)}</Text>
              ) : null}
              <Text style={{ color: colors.text, fontSize: fonts.sizes.sm }}>
                {t(`gifts.${g.name_key}`)}
              </Text>
              <Text style={{ color: colors.primaryBright, fontSize: fonts.sizes.xs }}>
                {g.price_gems} 💎
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <GiftAnimation
          visible={!!previewGift}
          giftNameKey={previewGift?.name_key ?? null}
          giftLabel={previewGift ? t(`gifts.${previewGift.name_key}`) : undefined}
          title={t('giftAnimation.preview')}
          onClose={() => setPreviewGift(null)}
        />
        {/* مسافة سفلية: على الويب الشريط السفلي مثبّت (fixed) فوق المحتوى،
            فلازم مساحة تكفي ارتفاعه (62) + بعده عن الحافة (8) + نفس */}
        <View style={{ height: Platform.OS === 'web' ? 86 : spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    marginVertical: spacing.md,
  },
  section: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  pkg: { width: '47%', alignItems: 'center', gap: 4 },
  pkgGems: { color: colors.text, fontSize: fonts.sizes.xxl, fontWeight: fonts.weights.black },
  pkgPrice: { color: colors.gold, fontWeight: '700', marginBottom: spacing.sm },
  vipCard: { borderColor: colors.gold },
  giftItem: {
    width: '30%',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  giftImg: { width: 62, height: 62, borderRadius: radius.md },
});
