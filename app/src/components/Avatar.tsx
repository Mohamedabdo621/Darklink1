import React from 'react';
import { Image, Text, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { GradientRing } from './ui';

/** الحرف الأول من الاسم (يدعم العربي والإنجليزي) */
function initialOf(name?: string | null): string {
  const ch = (name ?? '').trim().charAt(0);
  return ch || '؟';
}

/** دائرة زجاجية شفافة بالحرف الأول — بديل الصورة الرمزية الافتراضية */
export function AvatarInitial({ name, size }: { name?: string | null; size: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.glass,
        borderWidth: 1,
        borderColor: colors.glassBorder,
      }}>
      <Text
        style={{
          color: colors.text,
          fontSize: Math.round(size * 0.42),
          fontWeight: '700',
        }}>
        {initialOf(name)}
      </Text>
    </View>
  );
}

/**
 * صورة رمزية موحدة في كل مكان: إطار قوس قزح + خلفية زجاجية شفافة؛
 * ولو مفيش صورة تظهر دائرة الحرف الأول بنفس الإطار.
 * (لا مزيد من الدائرة البنفسجية المصمتة)
 */
export function Avatar({
  uri,
  name,
  size,
}: {
  uri?: string | null;
  name?: string | null;
  size: number;
}) {
  const inner = size - 6;
  return (
    <GradientRing size={size}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: inner, height: inner, borderRadius: inner / 2 }}
        />
      ) : (
        <AvatarInitial name={name} size={inner} />
      )}
    </GradientRing>
  );
}
