import React, { useCallback, useEffect, useState } from 'react';
import { Animated, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { appAlert } from '../lib/dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { giftImage } from '../lib/giftAssets';
import type { Gift } from '../lib/types';
import { fetchGiftsCatalog, fetchWallet, sendGift } from '../services/wallet';
import { colors, fonts, radius, spacing } from '../theme';

export default function GiftPicker() {
  const { t } = useTranslation();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { profile: me } = useAuth();
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [balance, setBalance] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sentGift, setSentGift] = useState<Gift | null>(null);
  const [scale] = useState(() => new Animated.Value(0));

  const load = useCallback(async () => {
    if (!me) return;
    const [g, w] = await Promise.all([fetchGiftsCatalog(), fetchWallet(me.id)]);
    setGifts(g);
    if (w) setBalance(w.balance);
  }, [me]);

  useEffect(() => {
    // تحميل الكتالوج والرصيد عند الفتح (نمط جلب بيانات قياسي)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (sentGift) {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
      const id = setTimeout(() => router.back(), 1600);
      return () => clearTimeout(id);
    }
  }, [sentGift, scale]);

  if (!me || !userId) return <Screen>{null}</Screen>;

  const pick = (gift: Gift) => {
    appAlert(
      t('giftPicker.title'),
      t('giftPicker.confirmSend', {
        gift: t(`gifts.${gift.name_key}`),
        price: gift.price_gems,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.send'),
          onPress: async () => {
            setBusyId(gift.id);
            const res = await sendGift(userId, gift.id);
            setBusyId(null);
            if (res.ok) {
              if (res.balance !== undefined) setBalance(res.balance);
              setSentGift(gift);
            } else if (res.error === 'insufficient') {
              appAlert(t('common.error'), t('giftPicker.insufficient'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('wallet.buyGems'), onPress: () => router.push('/store') },
              ]);
            } else if (res.error === 'blocked') {
              appAlert(t('common.error'), t('giftPicker.blocked'));
            } else {
              appAlert(t('common.error'), t('common.error'));
            }
          },
        },
      ],
    );
  };

  if (sentGift) {
    return (
      <Screen>
        <View style={styles.sentWrap}>
          <Animated.View style={{ transform: [{ scale }] }}>
            {giftImage(sentGift.asset) ? (
              <Image source={giftImage(sentGift.asset)} style={styles.sentImg} />
            ) : (
              <Text style={{ fontSize: 90 }}>🎁</Text>
            )}
          </Animated.View>
          <Text style={styles.sentText}>{t('giftPicker.sent')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title}>{t('giftPicker.title')}</Text>
      <Text style={{ color: colors.muted, marginBottom: spacing.md }}>
        {t('giftPicker.yourBalance', { balance })}
      </Text>
      <FlatList
        data={gifts}
        keyExtractor={(g) => g.id}
        numColumns={3}
        columnWrapperStyle={{ gap: spacing.md }}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}
        renderItem={({ item }) => {
          const affordable = balance >= item.price_gems;
          return (
            <TouchableOpacity
              style={[styles.item, !affordable && { opacity: 0.45 }]}
              disabled={busyId !== null}
              onPress={() => pick(item)}>
              {giftImage(item.asset) ? (
                <Image source={giftImage(item.asset)} style={styles.img} />
              ) : null}
              <Text style={{ color: colors.text, fontSize: fonts.sizes.xs }}>
                {t(`gifts.${item.name_key}`)}
              </Text>
              <Text style={{ color: colors.primaryBright, fontSize: fonts.sizes.xs }}>
                {busyId === item.id ? '...' : `${item.price_gems} 💎`}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
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
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  img: { width: 64, height: 64, borderRadius: radius.md },
  sentWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  sentImg: { width: 170, height: 170, borderRadius: radius.xl },
  sentText: { color: colors.text, fontSize: fonts.sizes.xl, fontWeight: fonts.weights.bold },
});
