// DARKLINK — الإيموجي السريع (v1.6.0)
// ضغطة واحدة على زرار الإيموجي بتبعت الإيموجي ده فورًا،
// والضغطة المطوّلة بتفتح الاختيار — والاختيار بيتحفظ محليًا.
import AsyncStorage from '@react-native-async-storage/async-storage';

/** إيموجي سريع فوق لوحة الكتابة */
export const EMOJI_QUICK = ['😂', '❤️', '👍', '🔥', '😮', '🙏', '😢', '🎉'];

export const QUICK_EMOJI_DEFAULT = '❤️';

const KEY = 'darklink:quickEmoji';

export async function loadQuickEmoji(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    return saved && EMOJI_QUICK.includes(saved) ? saved : QUICK_EMOJI_DEFAULT;
  } catch {
    return QUICK_EMOJI_DEFAULT;
  }
}

export async function saveQuickEmoji(emoji: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, emoji);
  } catch {
    // تجاهل — الإيموجي السريع رفاهية مش أساسية
  }
}
