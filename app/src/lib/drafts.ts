// DARKLINK — مسودات الرسائل (v1.6.0)
// النص اللي بتكتبه في شات وبتطلع من غير ما تبعته بيفضل محفوظ محليًا،
// ولو فتحت الشات تاني بيرجع زي ما هو. الإرسال بيمسح المسودة.
import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (conversationId: string) => `darklink:draft:${conversationId}`;

export async function loadDraft(conversationId: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(key(conversationId))) ?? '';
  } catch {
    return '';
  }
}

export async function saveDraft(conversationId: string, text: string): Promise<void> {
  try {
    if (!text) {
      await AsyncStorage.removeItem(key(conversationId));
    } else {
      await AsyncStorage.setItem(key(conversationId), text);
    }
  } catch {
    // تجاهل — المسودة رفاهية مش أساسية
  }
}

export async function clearDraft(conversationId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key(conversationId));
  } catch {
    // تجاهل
  }
}
