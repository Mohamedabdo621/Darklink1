import React, { useCallback, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { GlowCard, NeonButton, Screen } from '../components/ui';
import { appAlert } from '../lib/dialog';
import { createPaymentOrder, fetchCashNumbers, uploadProof } from '../services/economy';
import { colors, fonts, radius, spacing } from '../theme';
import { useAuth } from '../contexts/AuthContext';

export default function ManualPay() {
  const { t } = useTranslation();
  const { profile: me } = useAuth();
  const { packageId, gems, price } = useLocalSearchParams<{
    packageId: string;
    gems: string;
    price: string;
  }>();
  const [cash, setCash] = useState({ vodafone: '', etisalat: '', bonusPct: 0 });
  const [method, setMethod] = useState<'vodafone' | 'etisalat'>('vodafone');
  const [phone, setPhone] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setCash(await fetchCashNumbers());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const gemsNum = parseInt(gems ?? '0', 10);
  const bonus = Math.floor((gemsNum * cash.bonusPct) / 100);
  const number = method === 'vodafone' ? cash.vodafone : cash.etisalat;
  const available = cash.vodafone !== '' || cash.etisalat !== '';

  const pickProof = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (!res.canceled && res.assets[0]) setProofUri(res.assets[0].uri);
  };

  const submit = async () => {
    if (!me || !packageId) return;
    if (phone.trim().length < 10) {
      appAlert(t('common.error'), t('store.phoneInvalid'));
      return;
    }
    if (!number) {
      appAlert(t('common.error'), t('store.methodUnavailable'));
      return;
    }
    setBusy(true);
    let proofPath: string | null = null;
    if (proofUri) proofPath = await uploadProof(me.id, proofUri);
    const res = await createPaymentOrder(packageId, method, phone.trim(), proofPath);
    setBusy(false);
    if (res.ok && res.result) {
      appAlert(
        '✅',
        t('store.orderCreated', {
          code: res.result.code,
          gems: res.result.gems + res.result.bonus_gems,
        }),
        [
          {
            text: t('common.ok'),
            onPress: () => router.replace('/my-orders'),
          },
        ],
      );
    } else if (res.error?.includes('pending_exists')) {
      appAlert(t('common.error'), t('store.pendingExists'));
    } else if (res.error?.includes('method_unavailable')) {
      appAlert(t('common.error'), t('store.methodUnavailable'));
    } else {
      appAlert(t('common.error'), res.error ?? t('common.error'));
    }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>💳 {t('store.manualPay')}</Text>
        <Text style={{ color: colors.muted, lineHeight: 21 }}>
          {t('store.manualPayDesc')}
        </Text>

        <GlowCard style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fonts.sizes.md }}>
            {gemsNum} 💎 = {price} {t('common.egp')}
          </Text>
          {bonus > 0 ? (
            <Text style={{ color: colors.gold, marginTop: 4, fontWeight: '700' }}>
              🎁 +{bonus} {t('store.bonusNote', { pct: cash.bonusPct })}
            </Text>
          ) : null}
        </GlowCard>

        {!available ? (
          <Text style={{ color: colors.danger, marginTop: spacing.lg }}>
            {t('store.methodUnavailable')}
          </Text>
        ) : (
          <>
            <View style={styles.methodRow}>
              {(['vodafone', 'etisalat'] as const).map((m) => {
                const num = m === 'vodafone' ? cash.vodafone : cash.etisalat;
                return (
                  <TouchableOpacity
                    key={m}
                    disabled={!num}
                    onPress={() => setMethod(m)}
                    style={[
                      styles.methodBtn,
                      method === m && styles.methodActive,
                      !num && { opacity: 0.35 },
                    ]}>
                    <Text
                      style={{
                        color: method === m ? colors.white : colors.text,
                        fontWeight: '700',
                      }}>
                      {m === 'vodafone' ? '🔴' : '🟢'} {t(`store.${m}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>{t('store.payTo')}</Text>
            <Text style={styles.number}>{number || '—'}</Text>
            <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm, lineHeight: 20 }}>
              {t('store.paySteps')}
            </Text>

            <Text style={styles.label}>{t('store.senderPhone')}</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="01xxxxxxxxx"
              placeholderTextColor={colors.faint}
              keyboardType="phone-pad"
            />

            <Text style={styles.label}>{t('store.proof')}</Text>
            {proofUri ? (
              <Image source={{ uri: proofUri }} style={styles.proofImg} />
            ) : null}
            <NeonButton
              title={t('store.attachProof')}
              variant="ghost"
              onPress={pickProof}
            />
            <View style={{ height: spacing.md }} />
            <NeonButton
              title={t('store.submitOrder')}
              loading={busy}
              onPress={submit}
            />
          </>
        )}
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
  methodRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  methodBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  methodActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: {
    color: colors.text,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  number: {
    color: colors.gold,
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.black,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: fonts.sizes.md,
  },
  proofImg: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
});
