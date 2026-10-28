// What was actually cooked before a given week (SPEC §4–5).
import type { Dish, ISODate, Slot, Week } from '../types';
import { addDays, weekdayOf } from './dates';
import { weekSkeleton, type SlotDraft } from './week';

export interface HistoryContext {
  /** Dishes cooked in the previous week — the 2-week window. */
  lastWeek: Set<number>;
  /** Latest date each dish was cooked, for «давно не использовавшиеся». */
  lastUsed: Map<number, ISODate>;
}

/**
 * Only approved or finished weeks before `current` count, and skipped dishes
 * are not cooked (SPEC §5). The previous week is the latest such week that
 * started less than two weeks before `current`.
 */
export function historyContext(weeks: Week[], slots: Slot[], current: Pick<Week, 'id' | 'startDate'>): HistoryContext {
  const past = weeks.filter((w) => w.status !== 'draft' && w.id !== current.id && w.startDate < current.startDate);
  const windowStart = addDays(current.startDate, -13);
  const previous = past
    .filter((w) => w.startDate >= windowStart)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];

  const pastIds = new Set(past.map((w) => w.id));
  const lastWeek = new Set<number>();
  const lastUsed = new Map<number, ISODate>();
  for (const slot of slots) {
    if (!pastIds.has(slot.weekId)) continue;
    for (const item of slot.items) {
      if (item.dishId === null || item.skipped) continue;
      if (slot.weekId === previous?.id) lastWeek.add(item.dishId);
      const prev = lastUsed.get(item.dishId);
      if (!prev || slot.date > prev) lastUsed.set(item.dishId, slot.date);
    }
  }
  return { lastWeek, lastUsed };
}

/** Past weeks first by newest start date — the «История недель» list. */
export function historyList(weeks: Week[]): Week[] {
  return [...weeks].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/**
 * «Повторить как черновик»: the source week's dishes on the same weekdays of a new week.
 * Skip marks and carry-over links are dropped; archived or deleted dishes leave the position empty.
 */
export function repeatSlots(source: Slot[], newStart: ISODate, dishesById: Map<number, Dish>): SlotDraft[] {
  return weekSkeleton(newStart).map((slot) => {
    const from = source.find((s) => s.meal === slot.meal && weekdayOf(s.date) === weekdayOf(slot.date));
    if (!from) return slot;
    const items = from.items.map(({ role, dishId }) => {
      const dish = dishId === null ? undefined : dishesById.get(dishId);
      return { role, dishId: dish && !dish.archived ? dish.id! : null };
    });
    return { ...slot, items };
  });
}
