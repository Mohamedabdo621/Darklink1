// خريطة أنيميشن الهدايا (Lottie) — كل هدية ليها أنيميشن حقيقي بفريمات
// والمستوى بيحدد حجم الأنيميشن ومدة ظهوره على الشاشة
import type { AnimationObject } from 'lottie-react-native';

export type GiftTier = 1 | 2 | 3 | 4;

export interface GiftAnimationSpec {
  /** ملف الـ JSON (require ثابت — Metro بيحوّله لأوبجكت) */
  source: AnimationObject;
  tier: GiftTier;
  /** مدة ظهور الأوفيرلاي قبل ما يقفل لوحده (مللي ثانية) */
  durationMs: number;
  /** حجم مربع الأنيميشن بالبكسل */
  size: number;
}

const SOURCES: Record<string, AnimationObject> = {
  rose: require('../../assets/animations/rose.json'),
  heart: require('../../assets/animations/heart.json'),
  teddy_bear: require('../../assets/animations/teddy_bear.json'),
  star: require('../../assets/animations/star.json'),
  magic_gem: require('../../assets/animations/magic_gem.json'),
  crystal_cluster: require('../../assets/animations/crystal_cluster.json'),
  lantern: require('../../assets/animations/lantern.json'),
  fireworks: require('../../assets/animations/fireworks.json'),
  diamond: require('../../assets/animations/diamond.json'),
  crown: require('../../assets/animations/crown.json'),
  treasure_chest: require('../../assets/animations/treasure_chest.json'),
};

const TIERS: Record<string, GiftTier> = {
  rose: 1,
  heart: 1,
  teddy_bear: 2,
  star: 2,
  magic_gem: 2,
  crystal_cluster: 3,
  lantern: 3,
  fireworks: 3,
  diamond: 3,
  crown: 4,
  treasure_chest: 4,
};

const TIER_STYLE: Record<GiftTier, { durationMs: number; size: number }> = {
  1: { durationMs: 2600, size: 240 },
  2: { durationMs: 3800, size: 300 },
  3: { durationMs: 5000, size: 340 },
  4: { durationMs: 6000, size: 380 },
};

/** بيرجع مواصفات الأنيميشن لهدية حسب name_key — أو null لو ملهاش أنيميشن */
export function giftAnimationFor(nameKey: string): GiftAnimationSpec | null {
  const source = SOURCES[nameKey];
  if (!source) return null;
  const tier = TIERS[nameKey] ?? 1;
  return { source, tier, ...TIER_STYLE[tier] };
}
