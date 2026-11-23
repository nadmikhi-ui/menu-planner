// Week structure (SPEC §3): which meals each day has and which dishes each meal is made of.
import type { DishCategory, ISODate, MealType, Slot, SlotItem, SlotRole, Week } from '../types';
import { addDays, isWeekend } from './dates';

/** A slot before it is stored (no id, no week id). */
export type SlotDraft = Omit<Slot, 'id' | 'weekId'>;

export const ROLE_CATEGORY: Record<SlotRole, DishCategory> = {
  main: 'main',
  breakfast: 'breakfast',
  lunch: 'lunch',
};

export const ROLE_LABELS: Record<SlotRole, string> = {
  main: 'Основное',
  breakfast: 'Завтрак',
  lunch: 'Обед',
};

/** Weekdays: breakfast and dinner. Weekend: breakfast, full lunch, dinner. */
export function mealsFor(date: ISODate): MealType[] {
  return isWeekend(date) ? ['breakfast', 'lunch', 'dinner'] : ['breakfast', 'dinner'];
}

const empty = (role: SlotRole): SlotItem => ({ role, dishId: null });

/** Items of an unfilled meal: one dish each. A weekend lunch starts as the «soup» variant. */
export function emptyItems(meal: MealType): SlotItem[] {
  switch (meal) {
    case 'breakfast':
      return [empty('breakfast')];
    case 'lunch':
      return [empty('lunch')];
    case 'dinner':
      return [empty('main')];
  }
}

export function weekDates(start: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekSkeleton(start: ISODate): SlotDraft[] {
  return weekDates(start).flatMap((date) => mealsFor(date).map((meal) => ({ date, meal, items: emptyItems(meal) })));
}

/** Weekend lunch is either a «Обед» dish (soup etc.) or a main dish. */
export type LunchVariant = 'soup' | 'main';

export function lunchVariant(items: SlotItem[]): LunchVariant {
  return items.some((i) => i.role === 'lunch') ? 'soup' : 'main';
}

/**
 * Week shown by default on the «Неделя» tab: the approved week running today,
 * otherwise the earliest draft, otherwise the latest open week.
 */
export function defaultWeek<W extends Pick<Week, 'startDate' | 'status'>>(weeks: W[], today: ISODate): W | undefined {
  const open = weeks.filter((w) => w.status !== 'done').sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    open.find((w) => w.status === 'approved' && w.startDate <= today && today <= addDays(w.startDate, 6)) ??
    open.find((w) => w.status === 'draft') ??
    open[open.length - 1]
  );
}
