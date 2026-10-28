import type { DishCategory, Product, RepeatPolicy, Settings, ShopPlace } from '../types';

export const OTHER_PLACE_ID = 'other';

export const DEFAULT_PLACES: ShopPlace[] = [
  { id: 'market', name: 'Рынок' },
  { id: 'supermarket', name: 'Супермаркет' },
  { id: OTHER_PLACE_ID, name: 'Другое' },
];

const STRICT_EVERYWHERE: Record<DishCategory, RepeatPolicy> = {
  main: 'strict',
  side: 'strict',
  salad: 'strict',
  breakfast: 'strict',
  snack: 'strict',
  lunch: 'strict',
  prep: 'strict',
};

export function defaultSettings(): Settings {
  return {
    id: 'main',
    weekStartDay: 1,
    places: DEFAULT_PLACES.map((p) => ({ ...p })),
    repeatPolicy: { ...STRICT_EVERYWHERE },
    freezerMaxAgeMonths: 6,
  };
}

/** Already normalized (see `normalizeProductName`): lower-case, `е` instead of `ё`. */
export const DEFAULT_STAPLES = [
  'соль',
  'сахар',
  'перец черный молотый',
  'масло подсолнечное',
  'масло оливковое',
  'уксус',
  'лавровый лист',
  'специи',
];

export function defaultStapleProducts(): Product[] {
  return DEFAULT_STAPLES.map((name) => ({ name, placeId: OTHER_PLACE_ID, isStaple: true }));
}
