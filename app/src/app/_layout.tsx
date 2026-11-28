import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ErrorUtils, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import AppDialog from '../components/AppDialog';
import { AppLockGate } from '../components/AppLockGate';
import { ErrorBoundary } from '../components/ErrorBoundary';
import UpdateScreen from '../components/UpdateScreen';
import { initI18n } from '../i18n';
import { AuthProvider } from '../contexts/AuthContext';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { setNavReady, setupNotificationHandler } from '../services/push';
import { checkForUpdate, type UpdateInfo } from '../services/updateCheck';
import { logError } from '../services/errorLog';

function ThemedRoot() {
  const { colors, resolved } = useTheme();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  // فحص التحديث مرة واحدة بعد التحميل — ساكت تمامًا لو مفيش نت أو
  // المفاتيح مش موجودة؛ على الويب بيرجع 'none' على طول.
  useEffect(() => {
    let live = true;
    checkForUpdate().then((info) => {
      if (live && info.status !== 'none') setUpdate(info);
    });
    return () => {
      live = false;
    };
  }, []);

  // تحديث إجباري = شاشة مانعة قبل أي بوابة (auth / complete-profile)
  if (update?.status === 'forced') {
    return (
      <>
        <StatusBar style={resolved === 'light' ? 'dark' : 'light'} />
        <UpdateScreen info={update} onDismiss={() => {}} />
        <AppDialog />
      </>
    );
  }

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
      {update?.status === 'optional' && !updateDismissed ? (
        <UpdateScreen info={update} onDismiss={() => setUpdateDismissed(true)} />
      ) : null}
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

  // معالج الأخطاء العام: بيحافظ على المعالج الافتراضي وبيسجّل الخطأ
  // في error_logs قبل ما يعدّيه (الـ ErrorBoundary بيغطي أخطاء العرض،
  // وده بيغطي اللي برّه شجرة ريأكت).
  useEffect(() => {
    let prev: ((error: Error, isFatal?: boolean) => void) | undefined;
    try {
      prev = ErrorUtils.getGlobalHandler();
      ErrorUtils.setGlobalHandler((error, isFatal) => {
        void logError(error, 'global');
        try {
          prev?.(error, isFatal);
        } catch {
          // تجاهل — المعالج الافتراضي نفسه ضرب
        }
      });
    } catch {
      // ErrorUtils مش متاح — التجاهل آمن
    }
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
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <AuthProvider>
              <ThemeProvider>
                <ThemedRoot />
              </ThemeProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
