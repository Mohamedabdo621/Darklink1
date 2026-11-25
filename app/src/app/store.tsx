import React, { useCallback, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { appAlert } from '../lib/dialog';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GlowCard, NeonButton, Screen } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { giftImage } from '../lib/giftAssets';
import type { GemPackage, Gift } from '../lib/types';
import {
  activateVip,
  fetchGiftsCatalog,
  fetchPackages,
  fetchWallet,
  purchasePackage,
} from '../services/wallet';
import { colors, fonts, radius, spacing } from '../theme';

const VIP_PRICE = 1000;

export default function Store() {
  const { t } = useTranslation();
  const { profile: me, refreshProfile } = useAuth();
  const [packages, setPackages] = useState<GemPackage[]>([]);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [balance, setBalance] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    const [p, g, w] = await Promise.all([
      fetchPackages(),
      fetchGiftsCatalog(),
      fetchWallet(me.id),
    ]);
    setPackages(p);
    setGifts(g);
    if (w) setBalance(w.balance);
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!me) return <Screen>{null}</Screen>;

  const buy = (pkg: GemPackage) => {
    appAlert(
      t('store.title'),
      t('store.confirmBuy', { gems: pkg.gems, price: pkg.price_egp }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('store.buy'),
          onPress: async () => {
            setBusyId(pkg.id);
            const res = await purchasePackage(pkg);
            setBusyId(null);
            if (res.ok) {
              if (res.balance !== undefined) setBalance(res.balance);
              appAlert('✓', t('store.buySuccess'));
            } else {
              appAlert(t('common.error'), t('store.buyFailed'));
            }
          },
        },
      ],
    );
  };

  const buyVip = () => {
    appAlert(
      t('store.vipTitle'),
      t('store.vipPrice', { gems: VIP_PRICE }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('store.vipActivate'),
          onPress: async () => {
            setBusyId('vip');
            const res = await activateVip();
            setBusyId(null);
            if (res.ok) {
              if (res.balance !== undefined) setBalance(res.balance);
              await refreshProfile();
              appAlert('👑', t('store.vipSuccess'));
            } else if (res.error === 'insufficient') {
              appAlert(t('common.error'), t('store.insufficient'));
            } else {
              appAlert(t('common.error'), t('common.error'));
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
          💎 {balance} {t('common.gems')} • 🧪 {t('wallet.sandboxBadge')}
        </Text>

        <Text style={styles.section}>{t('store.packages')}</Text>
        <View style={styles.grid}>
          {packages.map((pkg) => (
            <GlowCard key={pkg.id} style={styles.pkg}>
              <Text style={{ fontSize: 30 }}>💎</Text>
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
              {t('store.vipActive', {
                date: new Date(me.vip_until).toLocaleDateString(),
              })}
            </Text>
          ) : null}
          <Text style={{ color: colors.gold, marginVertical: spacing.sm, fontWeight: '700' }}>
            {t('store.vipPrice', { gems: VIP_PRICE })}
          </Text>
          <NeonButton
            title={t('store.vipActivate')}
            variant="gold"
            loading={busyId === 'vip'}
            onPress={buyVip}
          />
        </GlowCard>

        <Text style={styles.section}>{t('store.giftsCatalog')}</Text>
        <View style={styles.grid}>
          {gifts.map((g) => (
            <View key={g.id} style={styles.giftItem}>
              {giftImage(g.asset) ? (
                <Image source={giftImage(g.asset)} style={styles.giftImg} />
              ) : null}
              <Text style={{ color: colors.text, fontSize: fonts.sizes.sm }}>
                {t(`gifts.${g.name_key}`)}
              </Text>
              <Text style={{ color: colors.primaryBright, fontSize: fonts.sizes.xs }}>
                {g.price_gems} 💎
              </Text>
            </View>
          ))}
        </View>
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
