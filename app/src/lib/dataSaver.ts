// DARKLINK — وضع توفير البيانات (v1.6.0)
// لما يكون شغال، الصور والفيديو في الشات والتايملاين متنزلش تلقائيًا —
// بتظهر كبلاطة "دوس للتحميل" لحد ما المستخدم يدوس عليها.
// الإعداد لكل جهاز (AsyncStorage) مش للحساب.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'darklink:data-saver';

let cached: boolean | null = null;

export async function loadDataSaver(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    cached = (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    cached = false;
  }
  return cached;
}

/** القيمة المتخزنة محليًا (من غير انتظار) — للاستخدام داخل المكوّنات */
export function getDataSaverCached(): boolean {
  return cached === true;
}

export async function setDataSaver(v: boolean): Promise<void> {
  cached = v;
  try {
    await AsyncStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    // تجاهل
  }
}
