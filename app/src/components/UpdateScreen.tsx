// DARKLINK — شاشة التحديث (قناة-واعية)
// - إجباري (المثبتة < min): شاشة كاملة مانعة، مفيش تخطّي.
// - اختياري (min ≤ المثبتة < latest): بطاقة قابلة للتجاهل.
// - Play: الزرار بيفتح صفحة المتجر. APK: الزرار بينزّل ملف الـ APK من
//   الرابط اللي في app_config. (صفحة المتجر لسه مش موجودة لحد ما
//   يتقدَّم التطبيق للنشر — الزرار هيفتح صفحة غير موجودة لحد ساعتها.)
import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlowCard, NeonButton, Screen } from './ui';
import { useTheme } from '../contexts/ThemeContext';
import { fonts, spacing, type ThemeColors } from '../theme';
import { PLAY_STORE_URL, type UpdateInfo } from '../services/updateCheck';

export default function UpdateScreen({
  info,
  onDismiss,
}: {
  info: UpdateInfo;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const forced = info.status === 'forced';

  const onAction = () => {
    const url = info.channel === 'play' ? PLAY_STORE_URL : info.downloadUrl;
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  const actionLabel =
    info.channel === 'play' ? 'حدّث من Google Play' : 'نزّل التحديث (APK)';
  const title = forced ? 'تحديث إجباري' : 'تحديث جديد متاح';

  const body = (
    <GlowCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="cloud-download-outline" size={28} color={colors.primaryBright} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.version}>
            النسخة الجديدة: {info.latest}
            {info.installed ? ` • المثبتة: ${info.installed}` : ''}
          </Text>
        </View>
      </View>
      {info.changelog ? (
        <Text style={styles.changelog}>{info.changelog}</Text>
      ) : null}
      {forced ? (
        <Text style={styles.forcedNote}>
          لازم تحدّث عشان تكمّل استخدام التطبيق — النسخة دي مبقتش مدعومة.
        </Text>
      ) : null}
      <View style={{ height: spacing.md }} />
      <NeonButton title={actionLabel} onPress={onAction} />
      {!forced ? (
        <View style={{ height: spacing.sm }} />
      ) : null}
      {!forced ? (
        <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
          <Text style={styles.dismissText}>مش دلوقتي</Text>
        </TouchableOpacity>
      ) : null}
    </GlowCard>
  );

  if (forced) {
    // مانعة تمامًا: مفيش وصول لأي شاشة تانية قبل التحديث
    return (
      <Screen>
        <View style={styles.forcedWrap}>{body}</View>
      </Screen>
    );
  }
  // اختيارية: بطاقة عايمة فوق التطبيق
  return <View style={styles.optionalWrap}>{body}</View>;
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    forcedWrap: { flex: 1, justifyContent: 'center' },
    optionalWrap: {
      position: 'absolute',
      start: spacing.lg,
      end: spacing.lg,
      top: spacing.lg,
      zIndex: 50,
    },
    title: {
      color: colors.text,
      fontSize: fonts.sizes.lg,
      fontWeight: fonts.weights.bold,
    },
    version: { color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 2 },
    changelog: {
      color: colors.text,
      fontSize: fonts.sizes.md,
      lineHeight: 22,
      marginTop: spacing.md,
    },
    forcedNote: {
      color: colors.danger,
      fontSize: fonts.sizes.sm,
      lineHeight: 20,
      marginTop: spacing.sm,
    },
    dismissBtn: { alignItems: 'center', paddingVertical: spacing.sm },
    dismissText: { color: colors.muted, fontSize: fonts.sizes.md, fontWeight: '700' },
  });
