// DARKLINK — نظام التصميم: Deep Black × Neon Purple × Glassmorphism
// (ستايل Muse المرجعي: أسود فضائي عميق، توهج نيون، زجاج، حركات ناعمة)
// v1.6.0: نظام ثيمات فاتح/داكن — نفس الهوية (تدرج السلسلة البنفسجي)
// في الوضعين، والفاتح يستخدم بطاقات بيضاء بظل بنفسجي خفيف بدل التوهج.
import type { TextStyle, ViewStyle } from 'react-native';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedMode = 'light' | 'dark';

export interface ThemePalette {
  bg: string;
  bgDeep: string;
  surface: string;
  surfaceLight: string;
  glass: string;
  glassStrong: string;
  glassBorder: string;
  glassBorderStrong: string;
  card: string;
  stroke: string;
  primary: string;
  primaryBright: string;
  /** بنفسجي هادئ مطفي مصمت — خلفية فقاعاتي المرسلة (مريح للعين، مش باهت ومش ناري) */
  primaryCalm: string;
  accent: string;
  magenta: string;
  pink: string;
  violet: string;
  cyan: string;
  gold: string;
  text: string;
  muted: string;
  faint: string;
  danger: string;
  /** نسخة شفافة من الأحمر — زر الحذف في سحب المحادثات (الشفافية على الزر مش على الصف) */
  dangerSoft: string;
  success: string;
  white: string;
  /** خلفية شريط التبويبات السفلي (شبه شفافة) */
  tabBar: string;
  /** توهجات خلفية الشاشة (الفقاعات الزخرفية) — بنفسجي/وردي بهوية التطبيق */
  glowTop: string;
  glowMid: string;
  glowBottom: string;
}

export const darkColors: ThemePalette = {
  bg: '#030014',
  bgDeep: '#02000a',
  surface: '#0d0221',
  surfaceLight: '#170736',
  // زجاج: خلفية شفافة + حد فاتح — فوق أي خلفية متوهجة
  glass: 'rgba(255, 255, 255, 0.06)',
  glassStrong: 'rgba(255, 255, 255, 0.09)',
  glassBorder: 'rgba(255, 255, 255, 0.12)',
  glassBorderStrong: 'rgba(232, 121, 249, 0.35)',
  card: 'rgba(168, 85, 247, 0.08)',
  stroke: 'rgba(168, 85, 247, 0.30)',
  primary: '#a855f7',
  primaryBright: '#c084fc',
  primaryCalm: '#7e6ba8',
  accent: '#e879f9',
  magenta: '#d946ef',
  pink: '#f472b6',
  violet: '#7c3aed',
  cyan: '#22d3ee',
  gold: '#fbbf24',
  text: '#f5efff',
  muted: '#b3a1d1',
  faint: '#7a6a96',
  danger: '#fb4d6d',
  dangerSoft: 'rgba(251, 77, 109, 0.80)',
  success: '#34d399',
  white: '#ffffff',
  tabBar: 'rgba(13, 2, 24, 0.88)',
  glowTop: 'rgba(124,58,237,0.28)',
  glowMid: 'rgba(34,211,238,0.10)',
  glowBottom: 'rgba(217,70,239,0.18)',
};

/** الوضع الفاتح: أبيض-لافندر، نص بنفسجي غامق، نفس التدرج البنفسجي للأزرار.
 * التوهجات هنا أعمق وأكثر تشبعًا (بنفسجي/وردي فقط، بلا سماوي باهت) عشان
 * الخلفية تقرأ DARKLINK مش صفحة بيضاء عامة. */
export const lightColors: ThemePalette = {
  bg: '#faf7ff',
  bgDeep: '#f3eefe',
  surface: '#ffffff',
  surfaceLight: '#ece2fb',
  glass: 'rgba(124, 58, 237, 0.08)',
  glassStrong: 'rgba(124, 58, 237, 0.12)',
  glassBorder: 'rgba(124, 58, 237, 0.20)',
  glassBorderStrong: 'rgba(168, 85, 247, 0.45)',
  card: 'rgba(124, 58, 237, 0.09)',
  stroke: 'rgba(124, 58, 237, 0.28)',
  primary: '#a855f7',
  primaryBright: '#9333ea',
  primaryCalm: '#7e6ba8',
  accent: '#c026d3',
  magenta: '#d946ef',
  pink: '#db2777',
  violet: '#7c3aed',
  cyan: '#0891b2',
  gold: '#d97706',
  text: '#2a0a4a',
  muted: '#6b5a8a',
  faint: '#9a8ab5',
  danger: '#e11d48',
  dangerSoft: 'rgba(225, 29, 72, 0.80)',
  success: '#059669',
  white: '#ffffff',
  tabBar: 'rgba(255, 255, 255, 0.92)',
  glowTop: 'rgba(124,58,237,0.36)',
  glowMid: 'rgba(217,70,239,0.15)',
  glowBottom: 'rgba(192,38,211,0.28)',
};

/** اللوحة الافتراضية (الداكنة) — للتوافق مع أي كود لم يُهاجَر بعد */
export const colors: ThemePalette = darkColors;

export type ThemeColors = ThemePalette;

export const gradients = {
  primary: ['#7c3aed', '#a855f7', '#e879f9'] as const,
  button: ['#8b5cf6', '#d946ef'] as const,
  neon: ['#7c3aed', '#c026d3', '#ec4899'] as const,
  // حلقة قوس قزح النيون (حول الصورة الرمزية — مثل المرجع)
  rainbow: ['#22d3ee', '#34d399', '#facc15', '#f472b6', '#a855f7', '#7c3aed'] as const,
  gold: ['#f59e0b', '#fbbf24', '#fde68a'] as const,
  bgGlow: ['rgba(124,58,237,0.40)', 'rgba(3,0,20,0)'] as const,
  bgGlowPink: ['rgba(217,70,239,0.28)', 'rgba(3,0,20,0)'] as const,
  glassSheen: ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.02)'] as const,
};

/** فقاعة المرسلة المجسّمة (زي الصورة المرجعية): لافندر فاتح ثابت في الوضعين —
 *  نص غامق عليها، مش أبيض */
export const sentBubble = {
  gradient: ['#ede9fe', '#c4b5fd', '#a78bfa'],
  text: '#1e1b4b',
  time: 'rgba(30,27,75,0.65)',
  name: '#6d28d9',
  play: '#7c3aed',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, xl: 30, full: 999 } as const;

export const fonts = {
  sizes: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26, hero: 34 },
  weights: { regular: '400', medium: '600', bold: '700', black: '900' },
} as const;

export const shadowGlow: ViewStyle = {
  shadowColor: '#a855f7',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.55,
  shadowRadius: 18,
  elevation: 10,
};

export const shadowGlowSoft: ViewStyle = {
  shadowColor: '#7c3aed',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 16,
  elevation: 6,
};

export const shadowGlowGold: ViewStyle = {
  shadowColor: '#fbbf24',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.45,
  shadowRadius: 14,
  elevation: 8,
};

/** نسخ أخف من الظلال للوضع الفاتح (ظل بنفسجي خفيف بدل التوهج) */
export const lightShadowGlow: ViewStyle = {
  shadowColor: '#7c3aed',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.18,
  shadowRadius: 12,
  elevation: 4,
};

export const lightShadowGlowSoft: ViewStyle = {
  shadowColor: '#7c3aed',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.12,
  shadowRadius: 10,
  elevation: 3,
};

export const lightShadowGlowGold: ViewStyle = {
  shadowColor: '#d97706',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
  shadowRadius: 10,
  elevation: 4,
};

// توهج نص نيون (للعناوين واللوجو)
export const textGlow: TextStyle = {
  textShadowColor: 'rgba(232, 121, 249, 0.65)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 14,
};

export const lightTextGlow: TextStyle = {
  textShadowColor: 'rgba(168, 85, 247, 0.30)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 8,
};
