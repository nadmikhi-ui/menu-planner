// Preps ↔ dishes of future weeks (SPEC §6.1): which dishes a prep is for, which preps a week
// can use (frozen or planned earlier), and which preps to suggest making ahead.
import type { Dish, FreezerItem, ISODate, PrepTask, PrepType, Week } from '../types';
import type { PrepSupply } from './assemble';
import { addDays } from './dates';
import { normalizeText } from './text';

/** Planned-but-not-ticked prep tasks count as available for this many days after their week started. */
export const PLANNED_PREP_DAYS = 21;

const active = (d: Dish) => !d.archived && d.category !== 'prep';

/**
 * Dishes each prep is for: the names in `forDishes`; a prep without links falls back to
 * dishes that share a product with it. Only active dishes; preps without any dish are left out.
 */
export function prepLinks(dishes: Dish[]): Map<number, Set<number>> {
  const byName = new Map<string, number>();
  for (const d of dishes) if (active(d)) byName.set(normalizeText(d.name), d.id!);
  const links = new Map<number, Set<number>>();
  for (const prep of dishes) {
    if (prep.category !== 'prep' || prep.archived) continue;
    let ids: number[];
    if (prep.forDishes?.length) {
      ids = prep.forDishes.map((n) => byName.get(normalizeText(n))).filter((id): id is number => id !== undefined);
    } else {
      const products = new Set(prep.ingredients);
      ids = products.size
        ? dishes.filter((d) => active(d) && d.ingredients.some((p) => products.has(p))).map((d) => d.id!)
        : [];
    }
    if (ids.length) links.set(prep.id!, new Set(ids));
  }
  return links;
}

/**
 * Preps a week can build on, oldest first: in stock in the freezer (linked to the idea, or with
 * the idea's name), and prep tasks of earlier weeks that were planned within `PLANNED_PREP_DAYS`
 * and not ticked yet (the prep may be made but not marked).
 */
export function availableSupplies(
  week: Pick<Week, 'id' | 'startDate'>,
  dishes: Dish[],
  freezer: FreezerItem[],
  tasks: PrepTask[],
  weeks: Pick<Week, 'id' | 'startDate'>[],
): PrepSupply[] {
  const links = prepLinks(dishes);
  const prepByName = new Map(
    dishes.filter((d) => d.category === 'prep' && !d.archived).map((d) => [normalizeText(d.name), d.id!]),
  );
  const since = new Map<number, ISODate>();
  const note = (prepId: number | undefined, date: ISODate) => {
    if (prepId === undefined || !links.has(prepId)) return;
    if (!since.has(prepId) || date < since.get(prepId)!) since.set(prepId, date);
  };

  for (const item of freezer) {
    if (item.status !== 'in_stock') continue;
    note(item.dishId ?? prepByName.get(normalizeText(item.name)), item.frozenAt);
  }
  const startOf = new Map(weeks.map((w) => [w.id!, w.startDate]));
  for (const task of tasks) {
    const start = startOf.get(task.weekId);
    if (task.done || task.weekId === week.id || !start) continue;
    if (start < week.startDate && addDays(start, PLANNED_PREP_DAYS) >= week.startDate) note(task.dishId, start);
  }

  const names = new Map(dishes.map((d) => [d.id!, d.name]));
  return [...since.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0] - b[0])
    .map(([prepId]) => ({ prepId, name: names.get(prepId) ?? '', dishIds: links.get(prepId)! }));
}

/** Names of the available preps a dish uses: the «❄ из морозилки» mark. */
export function prepsForDish(supplies: PrepSupply[], dishId: number): string[] {
  return supplies.filter((s) => s.dishIds.has(dishId)).map((s) => s.name);
}

const USEFUL_ENOUGH = 12;
const TYPE_ORDER: PrepType[] = ['main', 'soup', 'other', 'berries', 'greens'];

export interface PrepSuggestion {
  prep: Dish;
  /** Active dishes this prep is for, not cooked last week first. */
  dishes: Dish[];
}

/**
 * «Заготовить впрок»: preps to make this week so that the next weeks can build on them.
 * Leaves out preps already planned this week or already available; the ones useful for
 * the most dishes come first.
 */
export function prepSuggestions(
  dishes: Dish[],
  supplies: PrepSupply[],
  weekTasks: PrepTask[],
  lastWeek: ReadonlySet<number>,
  limit = 5,
): PrepSuggestion[] {
  const links = prepLinks(dishes);
  const skip = new Set([...supplies.map((s) => s.prepId), ...weekTasks.map((t) => t.dishId)]);
  const byId = new Map(dishes.map((d) => [d.id!, d]));
  return [...links.entries()]
    .filter(([prepId]) => !skip.has(prepId))
    .map(([prepId, ids]) => ({
      prep: byId.get(prepId)!,
      dishes: [...ids]
        .map((id) => byId.get(id)!)
        .sort((a, b) => Number(lastWeek.has(a.id!)) - Number(lastWeek.has(b.id!)) || a.name.localeCompare(b.name, 'ru')),
    }))
    // Useful for many dishes first (capped, so «зелень для всего» doesn't win just by numbers),
    // then the preps that save the most work: mains and soups before berries and greens.
    .sort(
      (a, b) =>
        Math.min(b.dishes.length, USEFUL_ENOUGH) - Math.min(a.dishes.length, USEFUL_ENOUGH) ||
        TYPE_ORDER.indexOf(a.prep.prepType ?? 'other') - TYPE_ORDER.indexOf(b.prep.prepType ?? 'other') ||
        a.prep.name.localeCompare(b.prep.name, 'ru'),
    )
    .slice(0, limit);
}
