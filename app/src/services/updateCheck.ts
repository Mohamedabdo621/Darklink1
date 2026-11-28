// DARKLINK — فحص التحديثات (v1.0.0)
// بيقرأ مفاتيح app_config الأربعة (apk_latest_version / apk_min_version /
// apk_download_url / apk_changelog) وبيقارنها بالنسخة المثبتة.
// مسار القراءة: (1) قراءة مباشرة من جدول app_config إن كانت سياسة
// RLS تسمح، (2) بديل: RPC عام public_app_info إن وُجد (نفس نمط
// public_cash_info اللي بيستخدمه الدفع اليدوي). أي فشل في الجلب أو
// انقطاع النت = مفيش تحديث (ساكت)، مش خطأ يوقف التطبيق.
// على الويب مفيش فحص أصلًا — التحديث للـ APK / Play بس.
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.alex.darklink';

export type DistributionChannel = 'play' | 'apk';

export type UpdateStatus = 'none' | 'optional' | 'forced';

export interface UpdateInfo {
  status: UpdateStatus;
  installed: string;
  latest: string;
  min: string;
  downloadUrl: string;
  changelog: string;
  channel: DistributionChannel;
}

/** القناة من eas.json (EXPO_PUBLIC_DISTRIBUTION_CHANNEL) — الافتراضي apk */
export function getDistributionChannel(): DistributionChannel {
  const v = (process.env.EXPO_PUBLIC_DISTRIBUTION_CHANNEL ?? '').trim().toLowerCase();
  return v === 'play' ? 'play' : 'apk';
}

/** النسخة المثبتة: على النيتف من expo-application، وعلى الويب null */
export function getInstalledVersion(): string | null {
  if (Platform.OS === 'web') return null;
  return (
    Application.nativeApplicationVersion ??
    (Constants.expoConfig?.version as string | undefined) ??
    null
  );
}

/** مقارنة نسخ (1.0.0): سالب لو a < b، صفر لو متساوية، موجب لو a > b.
 *  بيتحمّل بادئة v وأجزاء ناقصة وقيم فاضية (الفاضي = 0.0.0). */
export function compareVersions(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .trim()
      .replace(/^[vV]/, '')
      .split('.')
      .map((p) => {
        const n = parseInt(p.replace(/[^0-9]/g, ''), 10);
        return Number.isNaN(n) ? 0 : n;
      });
  const pa = norm(a || '0');
  const pb = norm(b || '0');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const APK_KEYS = [
  'apk_latest_version',
  'apk_min_version',
  'apk_download_url',
  'apk_changelog',
] as const;

type RawConfig = Partial<Record<string, string>>;

/** يقرأ المفاتيح الأربعة من app_config — بيرجع null لو مفيش أي مفتاح
 *  أو لو القراءة فشلت (مفيش صلاحية / مفيش نت / المفاتيح لسه متعملتش). */
export async function fetchUpdateConfig(): Promise<RawConfig | null> {
  // 1) قراءة مباشرة من الجدول (تشتغل لو سياسة RLS بتسمح بالقراءة العامة)
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', [...APK_KEYS]);
    if (!error && data && data.length > 0) {
      const out: RawConfig = {};
      for (const row of data as { key: string; value: string }[]) {
        out[row.key] = row.value;
      }
      return out;
    }
  } catch {
    // كمّل للبديل
  }
  // 2) RPC عام (نفس نمط public_cash_info) — بيرجع المفاتيح كـ JSON
  try {
    const { data, error } = await supabase.rpc('public_app_info');
    if (!error && data && typeof data === 'object') {
      const d = data as RawConfig;
      if (d.apk_latest_version || d.apk_min_version) return d;
    }
  } catch {
    // تجاهل — مفيش تحديث
  }
  return null;
}

/** الفحص الكامل: بيرجع 'none' في كل حالات عدم التوفّر (أوفلاين، فشل
 *  الجلب، مفاتيح ناقصة، ويب) — التطبيق يكمل عادي من غير ما يعطّل المستخدم. */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const channel = getDistributionChannel();
  const installed = getInstalledVersion();
  const none: UpdateInfo = {
    status: 'none',
    installed: installed ?? '',
    latest: '',
    min: '',
    downloadUrl: '',
    changelog: '',
    channel,
  };
  if (!installed) return none;
  try {
    const net = await NetInfo.fetch();
    if (net.isConnected === false) return none;
  } catch {
    // NetInfo مش متاح — كمّل وحاول الجلب (هيفشل بصمت لو مفيش نت)
  }
  const cfg = await fetchUpdateConfig();
  if (!cfg) return none;
  const latest = (cfg.apk_latest_version ?? '').trim();
  const min = (cfg.apk_min_version ?? '').trim();
  const downloadUrl = (cfg.apk_download_url ?? '').trim();
  const changelog = (cfg.apk_changelog ?? '').trim();
  // مفاتيح ناقصة/فاضية = مفيش تحديث (مش نفرض تحديث من غير بيانات)
  if (!latest || !min) return none;
  if (compareVersions(installed, min) < 0) {
    return { ...none, status: 'forced', latest, min, downloadUrl, changelog };
  }
  if (compareVersions(installed, latest) < 0) {
    return { ...none, status: 'optional', latest, min, downloadUrl, changelog };
  }
  return none;
}
