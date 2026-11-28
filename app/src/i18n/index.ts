import { I18nManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ar, en } from './locales';
import type { Language } from '../lib/types';

export const LANG_KEY = 'darklink.language';

export function deviceDefaultLanguage(): Language {
  const code = Localization.getLocales()[0]?.languageCode;
  return code === 'ar' ? 'ar' : 'en';
}

export async function storedLanguage(): Promise<Language | null> {
  const v = await AsyncStorage.getItem(LANG_KEY);
  return v === 'ar' || v === 'en' ? v : null;
}

/** يضبط اتجاه الواجهة (RTL للعربية) — الروت لايأوت بيسمع languageChanged
 *  وبيعاد بناء الـ Stack فورًا، فمبقاش محتاج إعادة تشغيل */
export function applyDirection(lang: Language) {
  const rtl = lang === 'ar';
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
}

export async function initI18n(): Promise<Language> {
  const lang = (await storedLanguage()) ?? deviceDefaultLanguage();
  applyDirection(lang);
  await i18n.use(initReactI18next).init({
    resources: { ar: { translation: ar }, en: { translation: en } },
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  return lang;
}

export async function setLanguage(lang: Language) {
  await AsyncStorage.setItem(LANG_KEY, lang);
  applyDirection(lang);
  await i18n.changeLanguage(lang);
}

export default i18n;
