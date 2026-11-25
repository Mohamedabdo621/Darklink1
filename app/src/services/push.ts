import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

/** إعداد سلوك الإشعارات أثناء فتح التطبيق + التنقل عند الضغط عليها */
export function setupNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as {
      conversation_id?: string | null;
    };
    if (data?.conversation_id) {
      router.push({
        pathname: '/chat/[id]',
        params: { id: data.conversation_id },
      });
    } else {
      router.push('/notifications');
    }
  });
}

async function currentToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const perm = await Notifications.getPermissionsAsync();
  let status = perm.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as
    | string
    | undefined;
  if (!projectId) return null;
  const res = await Notifications.getExpoPushTokenAsync({ projectId });
  return res.data;
}

/** تسجيل توكن الجهاز الحالي لحساب المستخدم (بعد تسجيل الدخول) */
export async function registerPushToken(userId: string): Promise<void> {
  try {
    const token = await currentToken();
    if (!token) return;
    await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    );
  } catch {
    // الإشعارات اختيارية — لا نعطّل التطبيق لو فشلت
  }
}

/** حذف توكن هذا الجهاز عند تسجيل الخروج */
export async function unregisterPushToken(userId: string): Promise<void> {
  try {
    const token = await currentToken();
    if (!token) return;
    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('token', token);
  } catch {
    // تجاهل
  }
}
