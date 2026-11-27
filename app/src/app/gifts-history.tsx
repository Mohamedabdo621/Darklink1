import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { giftImage } from '../lib/giftAssets';
import type { PublicProfile } from '../lib/types';
import { fetchPublicProfile } from '../services/social';
import {
  fetchReceivedGiftsFull,
  fetchSentGifts,
  type GiftSendRow,
} from '../services/wallet';
import { fonts, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
export default function GiftsHistory() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  const [tab, setTab] = useState<'sent' | 'received'>('received');
  const [rows, setRows] = useState<GiftSendRow[]>([]);
  const [names, setNames] = useState<Record<string, PublicProfile>>({});

  const load = useCallback(async () => {
    if (!me) return;
    const data =
      tab === 'sent' ? await fetchSentGifts(me.id) : await fetchReceivedGiftsFull(me.id);
    setRows(data);
    const otherIds = Array.from(
      new Set(data.map((r) => (tab === 'sent' ? r.receiver_id : r.sender_id))),
    );
    const map: Record<string, PublicProfile> = {};
    for (const oid of otherIds) {
      const p = await fetchPublicProfile(oid);
      if (p) map[oid] = p;
    }
    setNames(map);
  }, [me, tab]);

  useEffect(() => {
    // تحميل السجل عند الفتح (نمط جلب بيانات قياسي)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <Screen>
      <Text style={styles.title}>{t('giftsHistory.title')}</Text>
      <View style={styles.tabs}>
        {(['received', 'sent'] as const).map((k) => (
          <TouchableOpacity
            key={k}
            onPress={() => setTab(k)}
            style={[styles.tab, tab === k && styles.tabActive]}>
            <Text style={{ color: tab === k ? colors.white : colors.muted, fontWeight: '700' }}>
              {k === 'sent' ? t('giftsHistory.sent') : t('giftsHistory.received')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={() => <Text style={styles.empty}>{t('giftsHistory.empty')}</Text>}
        renderItem={({ item }) => {
          const otherId = tab === 'sent' ? item.receiver_id : item.sender_id;
          const other = names[otherId];
          return (
            <View style={styles.row}>
              {item.gift && giftImage(item.gift.asset) ? (
                <Image source={giftImage(item.gift.asset)} style={styles.img} />
              ) : (
                <Text style={{ fontSize: 30 }}>🎁</Text>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: fonts.sizes.md }}>
                  {item.gift ? t(`gifts.${item.gift.name_key}`) : '🎁'}
                </Text>
                <Text style={{ color: colors.muted, fontSize: fonts.sizes.xs }}>
                  {tab === 'sent' ? t('giftsHistory.to') : t('giftsHistory.from')}:{' '}
                  {other?.shown_name ?? '—'} •{' '}
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Text style={{ color: colors.primaryBright, fontWeight: '700' }}>
                {item.price_gems} 💎
              </Text>
            </View>
          );
        }}
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
  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primaryBright },
  empty: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
  },
  img: { width: 48, height: 48, borderRadius: 10 },
});
