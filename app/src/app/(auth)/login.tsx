import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Logo, NeonButton, NeonInput, Screen } from '../../components/ui';
import { isSupabaseConfigured } from '../../lib/supabase';
import { isValidEmail, signIn } from '../../services/auth';
import { colors, fonts, spacing } from '../../theme';

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailErr, setEmailErr] = useState('');

  const submit = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert('DARKLINK', 'Supabase is not configured yet (stage: backend deploy).');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailErr(t('auth.invalidEmail'));
      return;
    }
    setEmailErr('');
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) {
      if (res.errorKey === 'auth.emailNotConfirmed') {
        router.push({ pathname: '/(auth)/check-email', params: { email, mode: 'signup' } });
        return;
      }
      Alert.alert(t('common.error'), t(res.errorKey));
      return;
    }
    router.replace('/(tabs)/home');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.xxl }}>
          <Logo size={36} />
          <Text style={styles.subtitle}>{t('auth.login')}</Text>
        </View>

        <NeonInput
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          error={emailErr}
          placeholder="name@mail.com"
        />
        <NeonInput
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          placeholder="••••••••"
        />

        <TouchableOpacity
          onPress={() => router.push('/(auth)/forgot-password')}
          style={{ alignSelf: 'flex-end', marginBottom: spacing.lg }}>
          <Text style={{ color: colors.primaryBright }}>{t('auth.forgotPassword')}</Text>
        </TouchableOpacity>

        <NeonButton title={t('auth.login')} onPress={submit} loading={busy} />

        <View style={styles.footer}>
          <Text style={{ color: colors.muted }}>{t('auth.noAccount')} </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>
              {t('auth.register')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: colors.text,
    fontSize: fonts.sizes.xl,
    fontWeight: fonts.weights.bold,
    marginTop: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
});
