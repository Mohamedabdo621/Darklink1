import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import AppDialog from '../components/AppDialog';
import { initI18n } from '../i18n';
import { AuthProvider } from '../contexts/AuthContext';
import { setupNotificationHandler } from '../services/push';
import { colors } from '../theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initI18n().finally(() => setReady(true));
    setupNotificationHandler();
  }, []);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'slide_from_right',
              gestureEnabled: true,
            }}
          />
          <AppDialog />
        </AuthProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
