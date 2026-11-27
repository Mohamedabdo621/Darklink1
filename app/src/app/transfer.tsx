import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GlowCard, NeonButton, Screen } from '../components/ui';
import { appAlert } from '../lib/dialog';
import {
  fetchTransferQuote,
  transferGems,
  type TransferQuote,
} from '../services/economy';
import { fetchWallet } from '../services/wallet';
import { useAuth } from '../contexts/AuthContext';
import { fonts, radius, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
export default function Transfer() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  const { userId, name } = useLocalSearchParams<{ userId: string; name: string }>();
  const [amountTxt, setAmountTxt] = useState('');
  const [quote, setQuote] = useState<TransferQuote | null>(null);
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);

  const amount = parseInt(amountTxt, 10) || 0;

  useEffect(() => {
    if (!me) return;
    fetchWallet(me.id).then((w) => {
      if (w) setBalance(w.balance);
    });
  }, [me]);

  useEffect(() => {
    if (amount < 10) return;
    const id = setTimeout(async () => {
      setQuote(await fetchTransferQuote(amount));
    }, 350);
    return () => clearTimeout(id);
  }, [amount]);

  const shownQuote = amount >= 10 ? quote : null;

  const send = () => {
    if (!userId || !shownQuote) return;
    appAlert(
      `🔄 ${t('transfer.title')}`,
      t('transfer.confirm', {
        amount,
        fee: shownQuote.fee,
        net: shownQuote.net,
        name: name ?? '',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.send'),
          onPress: async () => {
            setBusy(true);
            const res = await transferGems(userId, amount);
            setBusy(false);
            if (res.ok) {
              appAlert('✓', t('transfer.done', { net: res.net }), [
                { text: t('common.ok'), onPress: () => router.back() },
              ]);
            } else {
              const key = res.error?.includes('insufficient_balance')
                ? 'transfer.errBalance'
                : res.error?.includes('daily_cap')
                  ? 'transfer.errCap'
                  : res.error?.includes('blocked')
                    ? 'transfer.errBlocked'
                    : res.error?.includes('below_min')
                      ? 'transfer.errMin'
                      : 'common.error';
              appAlert(t('common.error'), t(key));
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Text style={styles.title}>🔄 {t('transfer.title')}</Text>
      <Text style={{ color: colors.muted }}>
        {t('transfer.toUser', { name: name ?? '' })} • 💎 {balance}
      </Text>

      <Text style={styles.label}>{t('transfer.amount')}</Text>
      <TextInput
        style={styles.input}
        value={amountTxt}
        onChangeText={setAmountTxt}
        placeholder="100"
        placeholderTextColor={colors.faint}
        keyboardType="number-pad"
      />
      <Text style={{ color: colors.faint, fontSize: fonts.sizes.xs, marginTop: 4 }}>
        {t('transfer.minNote')}
      </Text>

      {shownQuote ? (
        <GlowCard style={{ marginTop: spacing.lg }}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('transfer.fee')}</Text>
            <Text style={{ color: colors.danger, fontWeight: '700' }}>
              {shownQuote.fee} 💎 ({Math.round(shownQuote.fee_pct * 100)}%)
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>{t('transfer.net')}</Text>
            <Text style={{ color: colors.success, fontWeight: '700' }}>
              {shownQuote.net} 💎
            </Text>
          </View>
          <Text style={{ color: colors.faint, fontSize: fonts.sizes.xs }}>
            {t('transfer.feeNote')}
          </Text>
        </GlowCard>
      ) : null}

      <View style={{ height: spacing.lg }} />
      <NeonButton
        title={t('common.send')}
        loading={busy}
        disabled={!shownQuote || amount > balance}
        onPress={send}
      />
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
  label: {
    color: colors.text,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: fonts.sizes.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: { color: colors.muted },
});
