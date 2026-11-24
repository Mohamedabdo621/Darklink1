import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, gradients, radius, shadowGlow, spacing } from '../theme';

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <SafeAreaView style={[styles.screen, style]}>
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />
      {children}
    </SafeAreaView>
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[styles.logo, { fontSize: size }]}>
        DARK<Text style={{ color: colors.accent }}>LINK</Text>
      </Text>
      <View style={styles.logoLine} />
    </View>
  );
}

export function NeonButton({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'gold' | 'ghost' | 'danger';
}) {
  const off = disabled || loading;
  if (variant === 'ghost' || variant === 'danger') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={off}
        style={[
          styles.ghostBtn,
          variant === 'danger' && { borderColor: colors.danger },
          off && { opacity: 0.5 },
        ]}>
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text
            style={[
              styles.ghostBtnText,
              variant === 'danger' && { color: colors.danger },
            ]}>
            {title}
          </Text>
        )}
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} disabled={off} style={off && { opacity: 0.5 }}>
      <LinearGradient
        colors={variant === 'gold' ? [...gradients.gold] : [...gradients.button]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.btn, shadowGlow]}>
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.btnText}>{title}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function NeonInput({
  label,
  error,
  ...props
}: TextInputProps & { label?: string; error?: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        style={[styles.input, error ? { borderColor: colors.danger } : null]}
        {...props}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function GlowCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ToggleRow({
  title,
  desc,
  value,
  onChange,
}: {
  title: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {desc ? <Text style={styles.toggleDesc}>{desc}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#3b2358', true: colors.primary }}
        thumbColor={value ? colors.primaryBright : colors.muted}
      />
    </View>
  );
}

export function Chip({ label, gold }: { label: string; gold?: boolean }) {
  return (
    <View style={[styles.chip, gold && { borderColor: colors.gold }]}>
      <Text style={[styles.chipText, gold && { color: colors.gold }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  glowTop: {
    position: 'absolute',
    top: -120,
    start: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(124,58,237,0.20)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -140,
    end: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(217,70,239,0.12)',
  },
  logo: {
    color: colors.text,
    fontWeight: fonts.weights.black,
    letterSpacing: 3,
  },
  logoLine: {
    marginTop: 6,
    width: 64,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  btn: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    color: colors.white,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.bold,
  },
  ghostBtn: {
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.card,
  },
  ghostBtnText: {
    color: colors.text,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.medium,
  },
  label: {
    color: colors.muted,
    fontSize: fonts.sizes.sm,
    marginBottom: 6,
    textAlign: 'left',
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: fonts.sizes.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    textAlign: 'left',
  },
  errorText: { color: colors.danger, fontSize: fonts.sizes.xs, marginTop: 4 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.stroke,
    gap: spacing.md,
  },
  toggleTitle: { color: colors.text, fontSize: fonts.sizes.md, fontWeight: fonts.weights.medium },
  toggleDesc: { color: colors.muted, fontSize: fonts.sizes.sm, marginTop: 2 },
  chip: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.card,
  },
  chipText: { color: colors.primaryBright, fontSize: fonts.sizes.xs, fontWeight: fonts.weights.bold },
});
