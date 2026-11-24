import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Logo, NeonButton, Screen } from '../../components/ui';
import { requestPasswordReset, resendConfirmation } from '../../services/auth';
import { colors, fonts, spacing } from '../../theme';

export default function CheckEmail() {
  const { t } = useTranslation();
  const { email = '', mode = 'signup' } = useLocalSearchParams<{
    email: string;
    mode: 'signup' | 'recovery';
  }>();
  const [seconds, setSeconds] = useState(30);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const resend = async () => {
    if (seconds > 0 || busy) return;
    setBusy(true);
    if (mode === 'signup') await resendConfirmation(email);
    else await requestPasswordReset(email);
    setBusy(false);
    setSeconds(30);
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <Logo size={30} />
          <Text style={{ fontSize: 52, marginTop: spacing.lg }}>📧</Text>
          <Text style={styles.title}>{t('auth.checkEmailTitle')}</Text>
          <Text style={styles.body}>
            {mode === 'signup' ? t('auth.checkEmailBody') : t('auth.checkEmailRecoveryBody')}
          </Text>
          <Text style={{ color: colors.primaryBright, fontWeight: '700' }}>{email}</Text>
          <Text style={styles.spam}>{t('auth.checkSpam')}</Text>
        </View>

        <TouchableOpacity
          onPress={resend}
          disabled={seconds > 0}
          style={{ alignItems: 'center', marginVertical: spacing.md }}>
          <Text style={{ color: seconds > 0 ? colors.faint : colors.accent, fontWeight: '600' }}>
            {seconds > 0 ? t('auth.resendIn', { seconds }) : t('auth.resend')}
          </Text>
        </TouchableOpacity>

        <NeonButton
          title={t('auth.backToLogin')}
          variant="ghost"
          onPress={() => router.replace('/(auth)/login')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.black,
    marginTop: spacing.md,
  },
  body: {
    color: colors.muted,
    fontSize: fonts.sizes.md,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  spam: { color: colors.faint, fontSize: fonts.sizes.sm, marginTop: spacing.md },
});
