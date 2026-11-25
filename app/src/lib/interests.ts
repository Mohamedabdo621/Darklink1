/** وسوم الاهتمامات الثابتة — مفاتيحها تُترجم من i18n (interests.<key>) */
export const INTEREST_KEYS = [
  'gaming',
  'music',
  'sports',
  'tech',
  'art',
  'movies',
  'books',
  'travel',
  'cooking',
  'fitness',
  'fashion',
  'cars',
] as const;

export type InterestKey = (typeof INTEREST_KEYS)[number];
export const MAX_INTERESTS = 5;
