import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { appAlert } from '../../lib/dialog';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Logo, NeonButton, NeonInput, Screen } from '../../components/ui';
import { setNewPassword } from '../../services/auth';
import { colors, fonts, spacing } from '../../theme';

// تعيين كلمة مرور جديدة بعد فتح لينك الاستعادة (الجلسة قائمة من اللينك)
export default function SetPassword() {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

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
    router.replace('/(tabs)/home');
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <Logo size={30} />
          <Text style={styles.title}>{t('auth.newPassword')}</Text>
        </View>
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
});
