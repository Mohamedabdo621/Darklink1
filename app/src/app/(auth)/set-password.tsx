import React, { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { appAlert } from '../../lib/dialog';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Logo, NeonButton, NeonInput, Screen } from '../../components/ui';
import { setNewPassword } from '../../services/auth';
import { supabase } from '../../lib/supabase';
import { fonts, spacing } from '../../theme';

import { useTheme } from '../../contexts/ThemeContext';
import type { ThemeColors } from '../../theme';
// تعيين كلمة مرور جديدة بعد فتح لينك الاستعادة (الجلسة قائمة من اللينك)
export default function SetPassword() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [checking, setChecking] = useState(true);
  const [noSession, setNoSession] = useState(false);
  const [done, setDone] = useState(false);

  // اللينك لازم يفتح بجلسة قائمة — من غيرها مفيش كلمة سر تتغير.
  // لو مفيش جلسة (لينك منتهي أو اتفتح قبل كده) بنقول كده بوضوح
  // بدل ما الزرار يفشل بصمت.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) setNoSession(true);
      setChecking(false);
    })();
  }, []);

  const submit = async () => {
    const e: typeof errors = {};
    if (password.length < 8) e.password = t('auth.passwordShort');
    if (confirm !== password) e.confirm = t('auth.passwordMismatch');
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const res = await setNewPassword(password);
    setBusy(false);
    if (!res.ok) {
      appAlert(t('common.error'), res.raw ? `${t(res.errorKey)}

${res.raw}` : t(res.errorKey));
      return;
    }
    setDone(true);
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <Logo size={30} />
          <Text style={styles.title}>
            {done
              ? t('auth.passwordChanged')
              : noSession
                ? t('auth.invalidLink')
                : t('auth.newPassword')}
          </Text>
        </View>
        {checking ? (
          <ActivityIndicator color={colors.primary} size="large" />
        ) : done ? (
          <NeonButton title={t('tabs.home')} onPress={() => router.replace('/(tabs)/home')} />
        ) : noSession ? (
          <NeonButton
            title={t('auth.requestNewLink')}
            onPress={() => router.replace('/(auth)/forgot-password')}
          />
        ) : (
          <>
            <NeonInput
              label={t('auth.newPassword')}
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
            <NeonButton title={t('auth.setNewPassword')} onPress={submit} loading={busy} />
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fonts.sizes.xxl,
    fontWeight: fonts.weights.black,
    marginTop: spacing.lg,
  },
});
