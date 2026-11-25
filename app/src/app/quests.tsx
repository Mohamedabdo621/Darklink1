import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NeonButton, Screen } from '../components/ui';
import { appAlert } from '../lib/dialog';
import { claimQuest, fetchQuests, type Quest } from '../services/economy';
import { colors, fonts, radius, spacing } from '../theme';

export default function Quests() {
  const { t } = useTranslation();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setQuests(await fetchQuests());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const claim = async (q: Quest) => {
    setBusyKey(q.key);
    const res = await claimQuest(q.key);
    setBusyKey(null);
    if (res.ok) {
      appAlert('🎉', t('quests.claimed', { amount: res.amount }));
      load();
    } else {
      appAlert(t('common.error'), t('common.error'));
    }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>🎯 {t('quests.title')}</Text>
        <Text style={{ color: colors.muted, marginBottom: spacing.md }}>
          {t('quests.desc')}
        </Text>
        {quests.map((q) => {
          const done = q.progress >= q.target;
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          return (
            <View key={`${q.key}-${q.period}`} style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {t(`quests.${q.key}`)}
                  </Text>
                  <Text style={{ color: colors.faint, fontSize: fonts.sizes.xs }}>
                    {q.period === 'daily' ? t('quests.daily') : t('quests.weekly')}{' '}
                    • {q.progress}/{q.target} • +{q.reward} 💎
                  </Text>
                </View>
                {q.claimed ? (
                  <Text style={{ color: colors.success, fontWeight: '700' }}>
                    ✓ {t('quests.done')}
                  </Text>
                ) : (
                  <NeonButton
                    title={t('quests.claim')}
                    loading={busyKey === q.key}
                    disabled={!done}
                    onPress={() => claim(q)}
                  />
                )}
              </View>
              <View style={styles.barBg}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${pct}%` },
                    done && { backgroundColor: colors.success },
                  ]}
                />
              </View>
            </View>
          );
        })}
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
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  barBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceLight,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
});
