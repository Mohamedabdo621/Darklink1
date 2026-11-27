// DARKLINK — تنزيل وسائط إلى معرض الهاتف (أو تحميلها على الويب)
// الصور متخزنة مرة واحدة في Supabase — التنزيل بينسخها بس، من غير نسخ جديدة

import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

export type DownloadResult = 'ok' | 'permission' | 'failed';

/**
 * ينزّل ملفًا من رابط موقّع إلى المعرض (أو تحميل مباشر على الويب).
 * `filename` هو اسم الملف اللي هيتحفظ بيه، زي darklink-123456.jpg
 */
export async function downloadMedia(
  url: string,
  filename: string,
): Promise<DownloadResult> {
  try {
    if (Platform.OS === 'web') {
      // الويب: تنزيل مباشر عن طريق anchor — من غير أي مكتبة
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
      return 'ok';
    }
    const perm = await requestPermissionsAsync();
    if (!perm.granted) return 'permission';
    const dest = new File(Paths.cache, filename);
    const task = File.createDownloadTask(url, dest);
    const file = await task.downloadAsync();
    if (!file) return 'failed';
    await Asset.create(file.uri);
    return 'ok';
  } catch {
    return 'failed';
  }
}

/** اسم ملف من مسار التخزين، زي conv/sender/123.jpg → darklink-123.jpg */
export function fileNameFromPath(mediaPath: string): string {
  const base = mediaPath.split('/').pop() ?? 'darklink-media';
  return base.startsWith('darklink-') ? base : `darklink-${base}`;
}
