// DARKLINK — هياكل تحميل (Skeleton) مشتركة
// بتستخدم بدل أي بيانات وهمية أثناء التحميل: لا "0 جواهر" ولا "مفيش
// محادثات" قبل ما الجلب يرجع فعلًا. وميض خفيف (opacity) مش شريط متحرك.
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

export function Skeleton({
  width,
  height,
  borderRadius = 12,
  style,
}: {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}) {
  const { colors, resolved } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 750, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        {
          width: width ?? '100%',
          height: height ?? 16,
          borderRadius,
          backgroundColor:
            resolved === 'light' ? 'rgba(124,58,237,0.14)' : 'rgba(168,85,247,0.18)',
          borderWidth: 1,
          borderColor: colors.stroke,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** سطر نص هيكلي */
export function SkeletonLine({ width = '80%' }: { width?: number | string }) {
  return <Skeleton width={width} height={14} borderRadius={7} />;
}

/** صف محادثة هيكلي (أفاتار + سطرين) */
export function SkeletonChatRow() {
  return (
    <View style={styles.chatRow}>
      <Skeleton width={56} height={56} borderRadius={28} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="55%" height={14} borderRadius={7} />
        <Skeleton width="85%" height={12} borderRadius={6} />
      </View>
    </View>
  );
}

/** بطاقة بوست هيكلية */
export function SkeletonPost() {
  return (
    <View style={styles.post}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <Skeleton width="40%" height={14} borderRadius={7} />
      </View>
      <Skeleton width="100%" height={14} borderRadius={7} />
      <Skeleton width="70%" height={14} borderRadius={7} />
      <Skeleton width="100%" height={150} borderRadius={12} />
    </View>
  );
}

/** قائمة هيكلية عامة (n صفوف محادثة) */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <View style={{ gap: 4 }}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonChatRow key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  post: {
    gap: 10,
    padding: 12,
    marginBottom: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.25)',
  },
});
