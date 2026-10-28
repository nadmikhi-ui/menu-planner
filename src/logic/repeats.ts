// Repeat-rule warnings for a week (SPEC §4). Computed, never stored,
// so they update as soon as the week or the dish library changes.
import { CATEGORIES, type Dish, type DishCategory, type RepeatPolicy } from '../types';
import { ROLE_CATEGORY, type SlotDraft } from './week';

export type ItemWarning = 'duplicate' | 'lastWeek';

export const ITEM_WARNING_LABELS: Record<ItemWarning, string> = {
  duplicate: 'Повтор в этой неделе',
  lastWeek: 'Было на прошлой неделе',
};

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
  const counts = new Map<number, number>();
  const positions = new Map<DishCategory, number>();
  for (const slot of slots) {
    for (const item of slot.items) {
      const category = ROLE_CATEGORY[item.role];
      positions.set(category, (positions.get(category) ?? 0) + 1);
      if (item.dishId !== null) counts.set(item.dishId, (counts.get(item.dishId) ?? 0) + 1);
    }
  }

  let warningCount = 0;
  let emptyCount = 0;
  const items = slots.map((slot) =>
    slot.items.map((item) => {
      if (item.dishId === null) {
        emptyCount++;
        return [];
      }
      if (policy[ROLE_CATEGORY[item.role]] === 'relaxed') return [];
      const warnings: ItemWarning[] = [];
      if ((counts.get(item.dishId) ?? 0) > 1) warnings.push('duplicate');
      if (lastWeek.has(item.dishId)) warnings.push('lastWeek');
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
