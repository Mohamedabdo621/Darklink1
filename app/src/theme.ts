// DARKLINK — نظام التصميم: Deep Black × Neon Purple × Glassmorphism
// (ستايل Muse المرجعي: أسود فضائي عميق، توهج نيون، زجاج، حركات ناعمة)
export const colors = {
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
  success: '#34d399',
  white: '#ffffff',
} as const;

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

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, xl: 30, full: 999 } as const;

export const fonts = {
  sizes: { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 26, hero: 34 },
  weights: { regular: '400', medium: '600', bold: '700', black: '900' },
} as const;

export const shadowGlow = {
  shadowColor: '#a855f7',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.55,
  shadowRadius: 18,
  elevation: 10,
};

export const shadowGlowSoft = {
  shadowColor: '#7c3aed',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 16,
  elevation: 6,
};

export const shadowGlowGold = {
  shadowColor: '#fbbf24',
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.45,
  shadowRadius: 14,
  elevation: 8,
};

// توهج نص نيون (للعناوين واللوجو)
export const textGlow = {
  textShadowColor: 'rgba(232, 121, 249, 0.65)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 14,
};
