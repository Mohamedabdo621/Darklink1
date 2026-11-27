import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Logo, NeonButton, Screen } from '../components/ui';
import { handleAuthLink } from '../services/auth';
import { fonts, spacing } from '../theme';

import { useTheme } from '../contexts/ThemeContext';
import type { ThemeColors } from '../theme';
// نقطة هبوط لينكات الإيميل (darklink://auth-callback):
// تفعيل الحساب → الرئيسية، استعادة كلمة المرور → شاشة تعيين كلمة مرور جديدة.
export default function AuthCallback() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const params = useLocalSearchParams<Record<string, string>>();
  const [failed, setFailed] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const entries = Object.entries(params).filter(
        ([, v]) => typeof v === 'string' && v.length > 0,
      );
      let url = '';
      if (entries.length) {
        url =
          'darklink://auth-callback?' +
          entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      } else {
        url = (await Linking.getInitialURL()) ?? '';
      }
      if (!url) {
        setFailed(true);
        return;
      }
      const res = await handleAuthLink(url);
      if (!res.ok) {
        setFailed(true);
        return;
      }
      if (res.intent === 'recovery') router.replace('/(auth)/set-password');
      else router.replace('/(tabs)/home');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- بنعالج اللينك مرة واحدة عند فتح الشاشة
  }, []);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Logo size={32} />
        {!failed ? (
          <>
            <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: spacing.xl }} />
            <Text style={styles.text}>{t('auth.linkProcessing')}</Text>
          </>
        ) : (
          <>
            <Text style={[styles.text, { marginBottom: spacing.lg }]}>
              {t('auth.invalidLink')}
            </Text>
            <NeonButton
              title={t('auth.backToLogin')}
              onPress={() => router.replace('/(auth)/login')}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  text: {
    color: colors.text,
    fontSize: fonts.sizes.lg,
    fontWeight: fonts.weights.bold,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
});
