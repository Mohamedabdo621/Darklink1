import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  Pressable,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import {
  fonts,
  gradients,
  lightShadowGlow,
  lightShadowGlowSoft,
  lightTextGlow,
  radius,
  shadowGlow,
  shadowGlowSoft,
  spacing,
  textGlow,
  type ThemeColors,
} from '../theme';

// نجوم خلفية ثابتة (مولّدة رياضياً — نفس الشكل في كل مرة)
const STARS = Array.from({ length: 42 }, (_, i) => {
  const x = (i * 37.7 + 11) % 100;
  const y = (i * 53.3 + 7) % 100;
  const size = (i % 3) + 1;
  const opacity = 0.2 + ((i * 13) % 10) / 18;
  const accent = i % 7 === 0;
  return { left: `${x}%`, top: `${y}%`, size, opacity, accent };
});

function FadeIn({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translate] = useState(() => new Animated.Value(8));
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [opacity, translate]);
  return (
    <Animated.View
      style={[{ flex: 1, opacity, transform: [{ translateY: translate }] }, style]}>
      {children}
    </Animated.View>
  );
}

export function Screen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <SafeAreaView style={[styles.screen, style]}>
      {/* الخلفية الموحّدة 2K لكل التطبيق (فاتحة/غامقة حسب الثيم) */}
      <Image
        source={
          resolved === 'light'
            ? require('../assets/chat-bg-light.jpg')
            : require('../assets/chat-bg-dark.jpg')
        }
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        resizeMode="cover"
      />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {STARS.map((s, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: s.left as never,
              top: s.top as never,
              width: s.size,
              height: s.size,
              borderRadius: s.size / 2,
              backgroundColor: s.accent ? colors.accent : colors.white,
              opacity: s.opacity,
            }}
          />
        ))}
        <View style={styles.glowTop} />
        <View style={styles.glowMid} />
        <View style={styles.glowBottom} />
      </View>
      <FadeIn>{children}</FadeIn>
    </SafeAreaView>
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[styles.logo, { fontSize: size }]}>
        DARK<Text style={[styles.logoAccent, resolved === 'light' ? lightTextGlow : textGlow]}>LINK</Text>
      </Text>
      <LinearGradient
        colors={[...gradients.neon]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.logoLine}
      />
    </View>
  );
}

// حلقة تدرج نيون (قوس قزح) حول الصورة الرمزية — مثل الصورة المرجعية
export function GradientRing({
  children,
  size = 88,
}: {
  children: React.ReactNode;
  size?: number;
}) {
  const { colors, resolved } = useTheme();
  return (
    <LinearGradient
      colors={[...gradients.rainbow]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        padding: 3,
        alignItems: 'center',
        justifyContent: 'center',
        ...(resolved === 'light' ? lightShadowGlow : shadowGlow),
      }}>
      <View
        style={{
          width: size - 6,
          height: size - 6,
          borderRadius: (size - 6) / 2,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {children}
      </View>
    </LinearGradient>
  );
}

export function NeonButton({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  icon,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'gold' | 'ghost' | 'danger';
  /** أيقونة vector قبل العنوان (بدل الإيموجي) */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const off = disabled || loading;
  const [scale] = useState(() => new Animated.Value(1));
  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 4 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 6 }).start();

  const iconColor =
    variant === 'ghost' ? colors.text : variant === 'danger' ? colors.danger : colors.white;
  const label = (
    <View style={styles.btnContent}>
      {icon ? <Ionicons name={icon} size={19} color={iconColor} /> : null}
      <Text
        style={[
          styles.btnText,
          variant === 'ghost' && styles.ghostBtnText,
          variant === 'danger' && { color: colors.danger },
        ]}>
        {title}
      </Text>
    </View>
  );

  const content = loading ? <ActivityIndicator color={colors.white} /> : label;

  if (variant === 'ghost' || variant === 'danger') {
    return (
      <Animated.View style={{ transform: [{ scale }], opacity: off ? 0.5 : 1 }}>
        <Pressable
          onPress={onPress}
          onPressIn={pressIn}
          onPressOut={pressOut}
          disabled={off}
          style={[
            styles.ghostBtn,
            variant === 'danger' && { borderColor: colors.danger },
          ]}>
          {loading ? <ActivityIndicator color={colors.text} /> : label}
        </Pressable>
      </Animated.View>
    );
  }
  return (
    <Animated.View style={{ transform: [{ scale }], opacity: off ? 0.5 : 1 }}>
      <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} disabled={off}>
        <LinearGradient
          colors={variant === 'gold' ? [...gradients.gold] : [...gradients.button]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.btn,
            variant === 'gold'
              ? resolved === 'light'
                ? lightShadowGlowSoft
                : shadowGlowSoft
              : resolved === 'light'
                ? lightShadowGlow
                : shadowGlow,
          ]}>
          <LinearGradient
            colors={[...gradients.glassSheen]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.btnSheen}
            pointerEvents="none"
          />
          {content}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export function NeonInput({
  label,
  error,
  ...props
}: TextInputProps & { label?: string; error?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? { borderColor: colors.danger } : null,
        ]}
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
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.card, style]}>
      <BlurView intensity={resolved === 'light' ? 20 : 32} tint={resolved === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[...gradients.glassSheen]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.cardSheen}
        pointerEvents="none"
      />
      <View style={{ position: 'relative' }}>{children}</View>
    </View>
  );
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.chip, gold && { borderColor: colors.gold }]}>
      <Text style={[styles.chipText, gold && { color: colors.gold }]}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  glowTop: {
    position: 'absolute',
    top: -140,
    start: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.glowTop,
  },
  glowMid: {
    position: 'absolute',
    top: '42%',
    end: -140,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.glowMid,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -160,
    start: -60,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.glowBottom,
  },
  logo: {
    color: colors.text,
    fontWeight: fonts.weights.black,
    letterSpacing: 3,
  },
  logoAccent: {
    color: colors.accent,
    ...textGlow,
  },
  logoLine: {
    marginTop: 6,
    width: 64,
    height: 3,
    borderRadius: 2,
  },
  btn: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  btnText: {
    color: colors.white,
    fontSize: fonts.sizes.md,
    fontWeight: fonts.weights.bold,
  },
  /** صف محتوى الزر: أيقونة + عنوان */
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  ghostBtn: {
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
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
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: fonts.sizes.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    textAlign: 'left',
  },
  inputFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.glassStrong,
    ...shadowGlowSoft,
  },
  errorText: { color: colors.danger, fontSize: fonts.sizes.xs, marginTop: 4 },
  card: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  cardSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
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
    borderColor: colors.glassBorder,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.glass,
  },
  chipText: { color: colors.primaryBright, fontSize: fonts.sizes.xs, fontWeight: fonts.weights.bold },
});
