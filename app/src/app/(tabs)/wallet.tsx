import React, { useCallback, useState, useMemo } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GlowCard, Screen } from '../../components/ui';
import { Skeleton, SkeletonChatRow } from '../../components/Skeleton';
import { GlassIconChip, type GlassIconName } from '../../components/GlassIconButton';
import { TabSwipe } from '../../components/TabSwipe';
import { useAuth } from '../../contexts/AuthContext';
import { appAlert } from '../../lib/dialog';
import type { Transaction } from '../../lib/types';
import { redeemPromo } from '../../services/economy';
import { fetchTransactions, fetchWallet } from '../../services/wallet';
import { fonts, radius, spacing } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
/** أيقونة كل نوع معاملة — VIP بيضل 👑 حسب قواعد الأيقونات */
const TX_ICON: Record<Exclude<Transaction['type'], 'vip'>, GlassIconName> = {
  purchase: 'diamond-outline',
  gift_sent: 'gift-outline',
  gift_received: 'gift-outline',
  bonus: 'star-outline',
  refund: 'return-up-back-outline',
  transfer_sent: 'paper-plane-outline',
  transfer_received: 'download-outline',
};

const TX_KEY: Record<Transaction['type'], string> = {
  purchase: 'wallet.txPurchase',
  gift_sent: 'wallet.txGiftSent',
  gift_received: 'wallet.txGiftReceived',
  bonus: 'wallet.txBonus',
  refund: 'wallet.txRefund',
  vip: 'wallet.txVip',
  transfer_sent: 'wallet.txTransferSent',
  transfer_received: 'wallet.txTransferReceived',
};

export default function WalletTab() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  /** الرصيد null لحد ما يتحمل — 0 قبل التحميل كانت بتتعرض كرصيد حقيقي */
  const [balance, setBalance] = useState<number | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [page, setPage] = useState(0);
  const [ended, setEnded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [firstLoaded, setFirstLoaded] = useState(false);

  const load = useCallback(
    async (p: number, replace: boolean) => {
      if (!me) return;
      const [w, rows] = await Promise.all([
        fetchWallet(me.id),
        fetchTransactions(me.id, p),
      ]);
      if (w) setBalance(w.balance);
      setEnded(rows.length < 30);
      setTxs((prev) => (replace ? rows : [...prev, ...rows]));
      setPage(p);
      setFirstLoaded(true);
    },
    [me],
  );

  useFocusEffect(
    useCallback(() => {
      load(0, true);
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load(0, true);
    setRefreshing(false);
  };

  const [promoCode, setPromoCode] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const onRedeem = async () => {
    if (!promoCode.trim() || promoBusy) return;
    setPromoBusy(true);
    const res = await redeemPromo(promoCode);
    setPromoBusy(false);
    if (res.ok) {
      setPromoCode('');
      appAlert(
        res.kind === 'gems'
          ? t('wallet.promoGems', { value: res.value })
          : t('wallet.promoVip', { value: res.value }),
      );
      load(0, true);
    } else {
      appAlert(t('common.error'), t(`wallet.promoErr_${res.reason ?? 'invalid'}`));
    }
  };

  return (
    <TabSwipe current="wallet">
      <Screen>
      <Text style={styles.title}>{t('wallet.title')}</Text>

      <GlowCard style={styles.balanceCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <GlassIconChip name="diamond-outline" size={14} />
          <Text style={{ color: colors.muted }}>{t('wallet.balance')}</Text>
        </View>
        {balance === null ? (
          <Skeleton width="45%" height={34} borderRadius={8} style={{ marginTop: 8 }} />
        ) : (
          <Text style={styles.balance}>
            {balance}{' '}
            <Text style={{ fontSize: fonts.sizes.md, color: colors.primaryBright }}>
              {t('common.gems')}
            </Text>
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/store')}>
            <View style={styles.btnContent}>
              <GlassIconChip name="cart-outline" size={14} color={colors.white} />
              <Text style={styles.actionText}>{t('wallet.buyGems')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/gifts-history')}>
            <View style={styles.btnContent}>
              <GlassIconChip name="gift-outline" size={14} color={colors.white} />
              <Text style={styles.actionText}>{t('wallet.giftsHistory')}</Text>
            </View>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.actionBtn, { marginTop: spacing.md, backgroundColor: colors.card }]}
          onPress={() => router.push('/my-orders')}>
          <View style={styles.btnContent}>
            <GlassIconChip name="receipt-outline" size={14} color={colors.white} />
            <Text style={styles.actionText}>{t('wallet.myOrders')}</Text>
          </View>
        </TouchableOpacity>
      </GlowCard>

      <View style={styles.promoRow}>
        <TextInput
          style={styles.promoInput}
          value={promoCode}
          onChangeText={setPromoCode}
          placeholder={t('wallet.promoPlaceholder')}
          placeholderTextColor={colors.faint}
          autoCapitalize="characters"
        />
        <TouchableOpacity style={styles.promoBtn} onPress={onRedeem}>
          <View style={styles.btnContent}>
            <GlassIconChip name="ticket-outline" size={14} />
            <Text style={styles.actionText}>
              {promoBusy ? '...' : t('wallet.promoRedeem')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>{t('wallet.history')}</Text>
      {!firstLoaded ? (
        <View style={{ gap: 4, paddingBottom: Platform.OS === 'web' ? 86 : 0 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SkeletonChatRow key={i} />
          ))}
        </View>
      ) : (
      <FlatList
        data={txs}
        style={{ flex: 1 }}
        // مساحة سفلية على الويب بس: الشريط السفلي position:fixed فوق
        // المحتوى، ومن غيرها آخر المعاملات بتقعد تحته.
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 86 : 0 }}
        keyExtractor={(tx) => tx.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={() => {
          if (!ended) load(page + 1, false);
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={() => (
          <Text style={styles.empty}>{t('wallet.noTransactions')}</Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.txRow}>
            {item.type === 'vip' ? (
              <View style={styles.txIconWrap}>
                <Text style={{ fontSize: 18 }}>👑</Text>
              </View>
            ) : (
              <GlassIconChip name={TX_ICON[item.type]} size={18} />
            )}
            {/* minWidth:0 + numberOfLines عشان التاريخ ميتقصّش من اليمين:
                النص الطويل كان بيطلع برّه حدود الصف وبيتقص. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontSize: fonts.sizes.md }} numberOfLines={1}>
                {t(TX_KEY[item.type])}
              </Text>
              <Text
                style={{ color: colors.faint, fontSize: fonts.sizes.xs }}
                numberOfLines={1}
                ellipsizeMode="tail">
                {new Date(item.created_at).toLocaleString(undefined, {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {item.status === 'sandbox_verified' ? ` • ${t('wallet.sandboxBadge')}` : ''}
              </Text>
            </View>
            <Text
              style={{
                color: item.amount >= 0 ? colors.success : colors.danger,
                fontWeight: '700',
                fontSize: fonts.sizes.md,
                flexShrink: 0,
              }}>
              {item.amount >= 0 ? '+' : ''}
              {item.amount} 💎
            </Text>
          </View>
        )}
      />
      )}
    </Screen>
    </TabSwipe>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    marginVertical: spacing.md,
  },
  balanceCard: { marginBottom: spacing.lg },
  balance: {
    color: colors.text,
    fontSize: fonts.sizes.hero,
    fontWeight: fonts.weights.black,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionText: { color: colors.white, fontWeight: '700', fontSize: fonts.sizes.sm },
  /** صف محتوى الزر: أيقونة + نص */
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  /** حاوية أيقونة معاملة VIP (👑 بيضل إيموجي حسب قواعد الأيقونات) */
  txIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginBottom: spacing.sm,
  },
  promoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  promoInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.text,
    fontSize: fonts.sizes.md,
  },
  promoBtn: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { color: colors.muted, textAlign: 'center', marginTop: spacing.lg },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
  },
});
