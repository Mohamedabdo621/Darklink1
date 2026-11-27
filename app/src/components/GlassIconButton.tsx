import React from 'react';
import { StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { radius } from '../theme';

export type GlassIconName = React.ComponentProps<typeof Ionicons>['name'];

type CommonProps = {
  name: GlassIconName;
  /** حجم الأيقونة (px) — حجم الزر بيتحسب منه */
  size?: number;
  color?: string;
  danger?: boolean;
  /** على خلفية سوداء/صورة (عارض الستوري والوسائط): زجاج أبيض وأيقونة بيضاء */
  inverse?: boolean;
  style?: ViewStyle;
};

/** زر أيقونة زجاجي موحّد — نفس لغة أيقونات اختصارات الرئيسية:
 *  أيقونة outline بنفسجي/وردي جوه خلفية زجاجية شفافة بحدود ناعمة وزوايا مدوّرة */
export function GlassIconButton({
  name,
  size = 20,
  color,
  danger,
  inverse,
  onPress,
  circular,
  style,
  hitSlop,
}: CommonProps & {
  onPress: () => void;
  circular?: boolean;
  hitSlop?: number;
}) {
  const { colors } = useTheme();
  const iconColor =
    color ?? (danger ? colors.danger : inverse ? colors.white : colors.primaryBright);
  const box = Math.max(30, size + 14);
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={hitSlop ?? 6}
      style={[
        styles.box,
        {
          width: box,
          height: box,
          borderRadius: circular ? box / 2 : radius.md,
          backgroundColor: inverse ? 'rgba(255,255,255,0.15)' : colors.glass,
          borderColor: inverse ? 'rgba(255,255,255,0.25)' : colors.glassBorder,
        },
        style,
      ]}>
      <Ionicons name={name} size={size} color={iconColor} />
    </TouchableOpacity>
  );
}

/** شريحة أيقونة زجاجية صغيرة (مش للضغط) — جنب عناوين الأقسام وصفوف القوائم */
export function GlassIconChip({ name, size = 15, color, danger, inverse, style }: CommonProps) {
  const { colors } = useTheme();
  const iconColor =
    color ?? (danger ? colors.danger : inverse ? colors.white : colors.primaryBright);
  const box = size + 12;
  return (
    <View
      style={[
        styles.box,
        {
          width: box,
          height: box,
          borderRadius: radius.sm,
          backgroundColor: inverse ? 'rgba(255,255,255,0.15)' : colors.glass,
          borderColor: inverse ? 'rgba(255,255,255,0.25)' : colors.glassBorder,
        },
        style,
      ]}>
      <Ionicons name={name} size={size} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
