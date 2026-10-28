// Repeat-rule warnings for a week (SPEC §4). Computed, never stored,
// so they update as soon as the week or the dish library changes.
import { CATEGORIES, type Dish, type DishCategory, type ISODate, type MealType, type RepeatPolicy } from '../types';
import { weekdayOn } from './dates';
import { ROLE_CATEGORY, type SlotDraft } from './week';

/** Where a dish occurs in the week. */
export interface Place {
  date: ISODate;
  meal: MealType;
}

export type ItemWarning =
  /** The dish is also planned at `others`. */
  | { kind: 'duplicate'; others: Place[] }
  /** Cooked last week — the 2-week window. */
  | { kind: 'lastWeek' };

const MEAL_FOR: Record<MealType, string> = {
  breakfast: 'на завтрак',
  snack: 'на перекус',
  lunch: 'на обед',
  dinner: 'на ужин',
};

/** «во вторник на ужин и в субботу на обед» */
export function placesText(places: Place[]): string {
  const parts = places.map((p) => `${weekdayOn(p.date)} ${MEAL_FOR[p.meal]}`);
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} и ${parts.at(-1)}`;
}

/** «Уже есть во вторник на ужин», «Было на прошлой неделе» */
export function warningText(warning: ItemWarning): string {
  return warning.kind === 'lastWeek' ? 'Было на прошлой неделе' : `Уже есть ${placesText(warning.others)}`;
}

/**
 * Where `dishId` occurs in the week, in calendar order, leaving out one position
 * (the one being checked or edited).
 */
export function dishPlaces(
  slots: SlotDraft[],
  dishId: number,
  skip?: { slotIndex: number; itemIndex: number },
): Place[] {
  const places: Place[] = [];
  slots.forEach((slot, si) =>
    slot.items.forEach((item, ii) => {
      if (item.dishId !== dishId || (skip && skip.slotIndex === si && skip.itemIndex === ii)) return;
      if (!places.some((p) => p.date === slot.date && p.meal === slot.meal)) places.push({ date: slot.date, meal: slot.meal });
    }),
  );
  return places.sort((a, b) => a.date.localeCompare(b.date));
}

/** Warnings a dish would get at a position: used by the slot rows and the dish picker. */
export function warningsFor(
  slots: SlotDraft[],
  dishId: number,
  lastWeek: ReadonlySet<number>,
  skip?: { slotIndex: number; itemIndex: number },
): ItemWarning[] {
  const warnings: ItemWarning[] = [];
  const others = dishPlaces(slots, dishId, skip);
  if (others.length) warnings.push({ kind: 'duplicate', others });
  if (lastWeek.has(dishId)) warnings.push({ kind: 'lastWeek' });
  return warnings;
}

export interface WeekAnalysis {
  /** `items[slotIndex][itemIndex]` → warnings for that position. */
  items: ItemWarning[][][];
  /** Positions with at least one warning (the yellow counter). */
  warningCount: number;
  /** Positions without a dish. */
  emptyCount: number;
  /** Strict categories with fewer suitable dishes than positions: «мало блюд, добавьте ещё». */
  shortages: DishCategory[];
}

export function analyzeWeek(
  slots: SlotDraft[],
  dishes: Dish[],
  lastWeek: ReadonlySet<number>,
  policy: Record<DishCategory, RepeatPolicy>,
): WeekAnalysis {
  const positions = new Map<DishCategory, number>();
  for (const slot of slots) {
    for (const item of slot.items) {
      const category = ROLE_CATEGORY[item.role];
      positions.set(category, (positions.get(category) ?? 0) + 1);
    }
  }

  let warningCount = 0;
  let emptyCount = 0;
  const items = slots.map((slot, slotIndex) =>
    slot.items.map((item, itemIndex) => {
      if (item.dishId === null) {
        emptyCount++;
        return [];
      }
      if (policy[ROLE_CATEGORY[item.role]] === 'relaxed') return [];
      const warnings = warningsFor(slots, item.dishId, lastWeek, { slotIndex, itemIndex });
      if (warnings.length) warningCount++;
      return warnings;
    }),
  );

  const shortages = CATEGORIES.filter((category) => {
    const needed = positions.get(category) ?? 0;
    if (needed === 0 || policy[category] === 'relaxed') return false;
    const available = dishes.filter((d) => !d.archived && d.category === category && !lastWeek.has(d.id!)).length;
    return available < needed;
  });

  return { items, warningCount, emptyCount, shortages };
}
