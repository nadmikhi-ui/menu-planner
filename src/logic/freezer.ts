// Freezer: what is frozen now and prep ideas (SPEC §6).
import { PREP_TYPE_LABELS, type Dish, type FreezerItem, type ISODate, type PrepTask, type PrepType } from '../types';
import { addMonths, monthsBetween } from './dates';
import { sortByName } from './dish';
import { cleanName } from './text';

export interface StockEntry {
  item: FreezerItem;
  /** Whole months since freezing. */
  months: number;
  /** Frozen `maxMonths` or more ago — highlighted to be used first or thrown away. */
  old: boolean;
}

/** True when the item has been in the freezer for `maxMonths` or longer. */
export function isOld(frozenAt: ISODate, today: ISODate, maxMonths: number): boolean {
  return addMonths(frozenAt, maxMonths) <= today;
}

/** «Сейчас в морозилке»: items in stock, oldest first (use them first). */
export function freezerStock(items: FreezerItem[], today: ISODate, maxMonths: number): StockEntry[] {
  return items
    .filter((i) => i.status === 'in_stock')
    .sort((a, b) => a.frozenAt.localeCompare(b.frozenAt) || a.name.localeCompare(b.name, 'ru'))
    .map((item) => ({ item, months: monthsBetween(item.frozenAt, today), old: isOld(item.frozenAt, today, maxMonths) }));
}

/** «меньше месяца», «1 мес.», «1 год 2 мес.» */
export function formatAge(months: number): string {
  if (months < 1) return 'меньше месяца';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearPart = years === 0 ? '' : years === 1 ? '1 год' : years < 5 ? `${years} года` : `${years} лет`;
  return [yearPart, rest ? `${rest} мес.` : ''].filter(Boolean).join(' ');
}

export interface FreezerDraft {
  name: string;
  frozenAt: ISODate;
  quantity: string;
}

export function validateFreezerDraft(draft: FreezerDraft, today: ISODate): string[] {
  const errors: string[] = [];
  if (!cleanName(draft.name)) errors.push('Введите название');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.frozenAt)) errors.push('Укажите дату заморозки');
  else if (draft.frozenAt > today) errors.push('Дата заморозки не может быть в будущем');
  return errors;
}

export const PREP_TYPES = Object.keys(PREP_TYPE_LABELS) as PrepType[];

export interface PrepIdeaGroup {
  type: PrepType;
  dishes: Dish[];
}

/** Active prep ideas grouped by type in the order of `PREP_TYPE_LABELS`; no type → «Другое». */
export function prepIdeas(dishes: Dish[]): PrepIdeaGroup[] {
  const ideas = dishes.filter((d) => d.category === 'prep' && !d.archived);
  return PREP_TYPES.map((type) => ({
    type,
    dishes: sortByName(ideas.filter((d) => (d.prepType ?? 'other') === type)),
  })).filter((g) => g.dishes.length > 0);
}

/** Why a prep idea cannot be added to the week, or null if it can. */
export function prepTaskProblem(tasks: PrepTask[], weekId: number, dish: Dish | undefined): string | null {
  if (!dish || dish.category !== 'prep') return 'Это не заготовка';
  if (tasks.some((t) => t.weekId === weekId && t.dishId === dish.id)) return 'Эта заготовка уже в плане недели';
  return null;
}
