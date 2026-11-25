import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { appAlert } from '../../lib/dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Logo, NeonButton, NeonInput, Screen } from '../../components/ui';
import { isSupabaseConfigured } from '../../lib/supabase';
import { isValidEmail, signUp } from '../../services/auth';
import { bindReferral } from '../../services/economy';
import { colors, fonts, spacing } from '../../theme';

export default function Register() {
  const { t } = useTranslation();
  const { ref } = useLocalSearchParams<{ ref?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [inviteCode, setInviteCode] = useState(
    typeof ref === 'string' ? ref.toUpperCase() : '',
  );
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});

  const submit = async () => {
    const e: typeof errors = {};
    if (!isValidEmail(email)) e.email = t('auth.invalidEmail');
    if (password.length < 8) e.password = t('auth.passwordShort');
    if (confirm !== password) e.confirm = t('auth.passwordMismatch');
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!agree) {
      appAlert(t('common.error'), t('auth.termsRequired'));
      return;
    }
    if (!isSupabaseConfigured) {
      appAlert('DARKLINK', 'Supabase is not configured yet (stage: backend deploy).');
      return;
    }
    setBusy(true);
    const res = await signUp(email, password);
    setBusy(false);
    if (!res.ok) {
      appAlert(t('common.error'), res.raw ? `${t(res.errorKey)}

${res.raw}` : t(res.errorKey));
      return;
    }
    if (res.needsConfirm) {
      router.push({ pathname: '/(auth)/check-email', params: { email, mode: 'signup' } });
    } else {
      const code = inviteCode.trim().toUpperCase();
      if (code) {
        const bound = await bindReferral(code);
        if (!bound.ok && bound.reason === 'bad_code') {
          appAlert(t('common.error'), t('referral.err_bad_code'));
        }
      }
      router.replace('/(tabs)/home');
    }
  };

  return (
    <Screen>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <Logo size={32} />
          <Text style={styles.subtitle}>{t('auth.createAccount')}</Text>
        </View>

        <NeonInput
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          error={errors.email}
          placeholder="name@mail.com"
        />
        <NeonInput
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          error={errors.password}
          placeholder="••••••••"
        />
        <NeonInput
          label={t('auth.confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          error={errors.confirm}
          placeholder="••••••••"
        />
        <NeonInput
          label={`${t('referral.bindTitle')} (${t('common.optional')})`}
          value={inviteCode}
          onChangeText={(v) => setInviteCode(v.toUpperCase())}
          autoCapitalize="characters"
          placeholder="DLXXXXXX"
        />

        <View style={styles.agreeRow}>
          <Switch
            value={agree}
            onValueChange={setAgree}
            trackColor={{ false: '#3b2358', true: colors.primary }}
            thumbColor={agree ? colors.primaryBright : colors.muted}
          />
          <TouchableOpacity onPress={() => router.push('/legal')} style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, fontSize: fonts.sizes.sm }}>
              {t('auth.agreeTerms')}
            </Text>
          </TouchableOpacity>
        </View>

        <NeonButton title={t('auth.createAccount')} onPress={submit} loading={busy} />

        <View style={styles.footer}>
          <Text style={{ color: colors.muted }}>{t('auth.haveAccount')} </Text>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
            <Text style={{ color: colors.accent, fontWeight: '700' }}>{t('auth.login')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
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
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
});
