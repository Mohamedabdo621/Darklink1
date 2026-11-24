// خريطة صور الهدايا المحلية (تطابق عمود asset في جدول gifts)
const MAP: Record<string, number> = {
  'rose.jpg': require('../../assets/gifts/rose.jpg'),
  'heart.jpg': require('../../assets/gifts/heart.jpg'),
  'teddy-bear.jpg': require('../../assets/gifts/teddy-bear.jpg'),
  'star.jpg': require('../../assets/gifts/star.jpg'),
  'magic-gem.jpg': require('../../assets/gifts/magic-gem.jpg'),
  'crystal-cluster.jpg': require('../../assets/gifts/crystal-cluster.jpg'),
  'diamond.jpg': require('../../assets/gifts/diamond.jpg'),
  'crown.jpg': require('../../assets/gifts/crown.jpg'),
  'treasure-chest.jpg': require('../../assets/gifts/treasure-chest.jpg'),
};

export function giftImage(asset: string): number | undefined {
  return MAP[asset];
}
