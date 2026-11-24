// DARKLINK — نظام التصميم: Dark Premium × Neon Purple
export const colors = {
  bg: '#07010d',
  bgDeep: '#040108',
  surface: '#12041f',
  surfaceLight: '#1c0733',
  card: 'rgba(168, 85, 247, 0.07)',
  stroke: 'rgba(168, 85, 247, 0.28)',
  primary: '#a855f7',
  primaryBright: '#c084fc',
  accent: '#e879f9',
  magenta: '#d946ef',
  pink: '#f472b6',
  gold: '#fbbf24',
  text: '#f5efff',
  muted: '#a78fc7',
  faint: '#6d5a8a',
  danger: '#fb4d6d',
  success: '#34d399',
  white: '#ffffff',
} as const;

export const gradients = {
  primary: ['#7c3aed', '#a855f7', '#e879f9'] as const,
  button: ['#8b5cf6', '#d946ef'] as const,
  gold: ['#f59e0b', '#fbbf24', '#fde68a'] as const,
  bgGlow: ['rgba(124,58,237,0.35)', 'rgba(7,1,13,0)'] as const,
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
  shadowOpacity: 0.45,
  shadowRadius: 14,
  elevation: 8,
};
