import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { appAlert } from '../../lib/dialog';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Logo, NeonButton, NeonInput, Screen } from '../../components/ui';
import { isValidEmail, requestPasswordReset } from '../../services/auth';
import { colors, fonts, spacing } from '../../theme';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!isValidEmail(email)) {
      setErr(t('auth.invalidEmail'));
      return;
    }
    setErr('');
    setBusy(true);
    const res = await requestPasswordReset(email);
    setBusy(false);
    if (!res.ok) {
      appAlert(t('common.error'), res.raw ? `${t(res.errorKey)}

${res.raw}` : t(res.errorKey));
      return;
    }
    router.push({ pathname: '/(auth)/check-email', params: { email, mode: 'recovery' } });
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <Logo size={30} />
          <Text style={styles.title}>{t('auth.resetTitle')}</Text>
          <Text style={styles.body}>{t('auth.resetBody')}</Text>
        </View>
        <NeonInput
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={err}
          placeholder="name@mail.com"
        />
        <NeonButton title={t('auth.send')} onPress={submit} loading={busy} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.black,
    marginTop: spacing.lg,
  },
  body: { color: colors.muted, fontSize: fonts.sizes.md, marginTop: spacing.sm, textAlign: 'center' },
});
