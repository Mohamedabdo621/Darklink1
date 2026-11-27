import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { Logo } from '../components/ui';


import { useTheme } from '../contexts/ThemeContext';
const ONBOARDING_KEY = 'darklink.onboardingSeen';

export default function Index() {
  const { colors } = useTheme();
  const { session, loading } = useAuth();
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
  if (session) return <Redirect href="/(tabs)/home" />;
  return <Redirect href="/(auth)/login" />;
}

export { ONBOARDING_KEY };
