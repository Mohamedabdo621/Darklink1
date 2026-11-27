import React, { useCallback, useState, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../components/ui';
import { GlassIconChip } from '../components/GlassIconButton';
import { useAuth } from '../contexts/AuthContext';
import type { PaymentOrder } from '../services/admin';
import { fetchMyOrders } from '../services/economy';
import { fonts, radius, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
const STATUS_COLOR: Record<string, string> = {
  pending: '#fbbf24',
  approved: '#34d399',
  rejected: '#f87171',
};

export default function MyOrders() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  const [orders, setOrders] = useState<PaymentOrder[]>([]);

  const load = useCallback(async () => {
    if (!me) return;
    setOrders(await fetchMyOrders(me.id));
  }, [me]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <View style={styles.titleRow}>
        <GlassIconChip name="receipt-outline" size={16} />
        <Text style={[styles.title, { marginVertical: 0 }]}>{t('orders.title')}</Text>
      </View>
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        ListEmptyComponent={() => (
          <Text style={styles.empty}>{t('orders.empty')}</Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.gems + item.bonus_gems} 💎 • {item.amount_egp}{' '}
                {t('common.egp')}
              </Text>
              <Text style={{ color: colors.muted, fontSize: fonts.sizes.xs }}>
                {item.method === 'vodafone'
                  ? t('store.vodafone')
                  : t('store.etisalat')}{' '}
                • {item.code} •{' '}
                {new Date(item.created_at).toLocaleString()}
              </Text>
              {item.status === 'rejected' && item.reject_reason ? (
                <Text style={{ color: colors.danger, fontSize: fonts.sizes.xs }}>
                  {item.reject_reason}
                </Text>
              ) : null}
            </View>
            <Text
              style={{
                color: STATUS_COLOR[item.status] ?? colors.muted,
                fontWeight: '700',
              }}>
              {t(`orders.${item.status}`)}
            </Text>
          </View>
        )}
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
  /** صف عنوان الصفحة: شريحة أيقونة زجاجية + العنوان */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  empty: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
});
