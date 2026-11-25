import React, { useCallback, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GlowCard, Screen } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { appAlert } from '../../lib/dialog';
import type { Transaction } from '../../lib/types';
import { redeemPromo } from '../../services/economy';
import { fetchTransactions, fetchWallet } from '../../services/wallet';
import { colors, fonts, radius, spacing } from '../../theme';

const TX_ICON: Record<Transaction['type'], string> = {
  purchase: '💎',
  gift_sent: '🎁',
  gift_received: '🎁',
  bonus: '⭐',
  refund: '↩️',
  vip: '👑',
  transfer_sent: '📤',
  transfer_received: '📥',
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
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  const [balance, setBalance] = useState(0);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [page, setPage] = useState(0);
  const [ended, setEnded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
        '🎟',
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
    <Screen>
      <Text style={styles.title}>{t('wallet.title')}</Text>

      <GlowCard style={styles.balanceCard}>
        <Text style={{ color: colors.muted }}>💎 {t('wallet.balance')}</Text>
        <Text style={styles.balance}>
          {balance}{' '}
          <Text style={{ fontSize: fonts.sizes.md, color: colors.primaryBright }}>
            {t('common.gems')}
          </Text>
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push('/store')}>
            <Text style={styles.actionText}>🛒 {t('wallet.buyGems')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push('/gifts-history')}>
            <Text style={styles.actionText}>🎁 {t('wallet.giftsHistory')}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.actionBtn, { marginTop: spacing.md, backgroundColor: colors.card }]}
          onPress={() => router.push('/my-orders')}>
          <Text style={styles.actionText}>🧾 {t('wallet.myOrders')}</Text>
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
          <Text style={styles.actionText}>
            {promoBusy ? '...' : `🎟 ${t('wallet.promoRedeem')}`}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>{t('wallet.history')}</Text>
      <FlatList
        data={txs}
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
            <Text style={{ fontSize: 22 }}>{TX_ICON[item.type]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
                {t(TX_KEY[item.type])}
              </Text>
              <Text style={{ color: colors.faint, fontSize: fonts.sizes.xs }}>
                {new Date(item.created_at).toLocaleString()}
                {item.status === 'sandbox_verified' ? ` • ${t('wallet.sandboxBadge')}` : ''}
              </Text>
            </View>
            <Text
              style={{
                color: item.amount >= 0 ? colors.success : colors.danger,
                fontWeight: '700',
                fontSize: fonts.sizes.md,
              }}>
              {item.amount >= 0 ? '+' : ''}
              {item.amount} 💎
            </Text>
          </View>
        )}
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
