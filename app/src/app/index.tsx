import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { Logo, NeonButton } from '../components/ui';


import { useTheme } from '../contexts/ThemeContext';
const ONBOARDING_KEY = 'darklink.onboardingSeen';

export default function Index() {
  const { colors } = useTheme();
  const { session, profile, loading, profileError, refreshProfile, signOut } =
    useAuth();
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => setSeen(v === '1'));
  }, []);

  if (loading || seen === null) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
        }}>
        <Logo size={38} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!seen) return <Redirect href="/onboarding" />;
  // الجلب فشل (شبكة/قاعدة) — شاشة إعادة محاولة، مش تحويل لصفحة إكمال
  // البيانات (التحويل ده كان بيعمل لوب لما الجلب يفشل).
  if (session && profileError) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          paddingHorizontal: 24,
        }}>
        <Logo size={38} />
        <Text
          style={{ color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
          تعذّر تحميل ملفك
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
          اتأكد من النت وحاول تاني
        </Text>
        <NeonButton title="حاول تاني" onPress={() => void refreshProfile()} />
        <TouchableOpacity
          onPress={() => void signOut()}
          style={{ paddingVertical: 12 }}>
          <Text style={{ color: colors.faint, fontSize: 14 }}>تسجيل خروج</Text>
        </TouchableOpacity>
      </View>
    );
  }
  // ملفه ناقص تاريخ الميلاد → صفحة إكمال البيانات قبل الدخول
  // (بس لما الجلب يكون نجح — profile موجود من غير birthdate، أو مفيش
  // صف أصلًا من غير خطأ جلب)
  if (session && !profile?.birthdate)
    return <Redirect href="/complete-profile" />;
  if (session) return <Redirect href="/(tabs)/home" />;
  return <Redirect href="/(auth)/login" />;
}

export { ONBOARDING_KEY };
