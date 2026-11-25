import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

// التنقل من الإشعارات لا يعمل قبل اكتمال تحميل التطبيق — نؤجله حتى الجاهزية
let navReady = false;
let pendingNav: { conversation_id?: string | null } | null = null;

export function setNavReady() {
  navReady = true;
  if (pendingNav) {
    const p = pendingNav;
    pendingNav = null;
    goToNotification(p);
  }
}

function goToNotification(data: { conversation_id?: string | null }) {
  try {
    if (data?.conversation_id) {
      router.push({
        pathname: '/chat/[id]',
        params: { id: data.conversation_id },
      });
    } else {
      router.push('/notifications');
    }
  } catch {
    // التنقل فشل (التطبيق لم يجهز بعد) — نتجاهل بهدوء
  }
}

/** إعداد سلوك الإشعارات أثناء فتح التطبيق + التنقل عند الضغط عليها */
export function setupNotificationHandler() {
  try {
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
      if (navReady) goToNotification(data);
      else pendingNav = data;
    });
  } catch {
    // الإشعارات اختيارية — لا نعطّل التطبيق لو فشلت
  }
}

async function currentToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    // لا نطلب الإذن تلقائيًا أبدًا — فقط نتحقق من الحالة الحالية.
    // طلب الإذن يتم من شاشة الإشعارات فقط عند ضغط المستخدم.
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as
      | string
      | undefined;
    if (!projectId) return null;
    const res = await Notifications.getExpoPushTokenAsync({ projectId });
    return res.data;
  } catch {
    return null;
  }
}

/** طلب إذن الإشعارات صراحةً من المستخدم (من شاشة الإشعارات فقط) */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const res = await Notifications.requestPermissionsAsync();
    return res.status === 'granted';
  } catch {
    return false;
  }
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
