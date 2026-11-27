import React from 'react';
import { Image, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '../theme';

/** الحرف الأول من الاسم (يدعم العربي والإنجليزي) */
function initialOf(name?: string | null): string {
  const ch = (name ?? '').trim().charAt(0);
  return ch || '؟';
}

/** دائرة تدرج بنفسجي بالحرف الأول — بديل الصورة الرمزية الافتراضية */
export function AvatarInitial({ name, size }: { name?: string | null; size: number }) {
  return (
    <LinearGradient
      colors={[...gradients.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text
        style={{
          color: '#ffffff',
          fontSize: Math.round(size * 0.42),
          fontWeight: '700',
        }}>
        {initialOf(name)}
      </Text>
    </LinearGradient>
  );
}

/**
 * صورة رمزية بحلقة تدرج بنفسجية؛ ولو مفيش صورة تظهر دائرة الحرف الأول.
 * (لا مزيد من الصورة الرمزية الزرقاء المسطحة 👤)
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
  if (!uri) return <AvatarInitial name={name} size={size} />;
  const inner = size - 5;
  return (
    <LinearGradient
      colors={[...gradients.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        padding: 2.5,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: '#8b5cf6',
          overflow: 'hidden',
        }}>
        <Image
          source={{ uri }}
          style={{ width: inner, height: inner, borderRadius: inner / 2 }}
        />
      </View>
    </LinearGradient>
  );
}
