import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import AppDialog from '../components/AppDialog';
import { AppLockGate } from '../components/AppLockGate';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { initI18n } from '../i18n';
import { AuthProvider } from '../contexts/AuthContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { setNavReady, setupNotificationHandler } from '../services/push';

function ThemedRoot() {
  const { colors, resolved } = useTheme();
  return (
    <>
      <StatusBar style={resolved === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
          gestureEnabled: true,
        }}
      />
      <AppDialog />
      <AppLockGate />
    </>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initI18n().finally(() => {
      setReady(true);
      // التنقل من الإشعارات مسموح فقط بعد اكتمال التحميل
      setNavReady();
    });
    setupNotificationHandler();
  }, []);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#030014',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <ActivityIndicator color="#a855f7" size="large" />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <AuthProvider>
            <ThemeProvider>
              <ThemedRoot />
            </ThemeProvider>
          </AuthProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
