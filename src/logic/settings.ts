// Settings screen rules (SPEC §8).
import { CATEGORIES, type DishCategory } from '../types';

/** Categories that appear in a week; prep ideas are planned separately, so repeats do not apply. */
export const REPEAT_CATEGORIES: DishCategory[] = CATEGORIES.filter((c) => c !== 'prep');

export const FREEZER_MONTHS_MIN = 1;
export const FREEZER_MONTHS_MAX = 24;

/** «Срок хранения заморозки» in whole months, or an error. */
export function parseFreezerMonths(input: string): number {
  const n = Number(input.trim());
  if (!Number.isInteger(n) || n < FREEZER_MONTHS_MIN || n > FREEZER_MONTHS_MAX) {
    throw new Error(`Срок — целое число месяцев от ${FREEZER_MONTHS_MIN} до ${FREEZER_MONTHS_MAX}`);
  }
  return n;
}
