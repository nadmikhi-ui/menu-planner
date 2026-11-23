// Schema v2 (SPEC §1): sections «Гарнир», «Салат», «Перекус» are gone. Used by the Dexie upgrade
// and by the import of older backups, on plain rows.
import { REMOVED_CATEGORIES } from '../types';

type Row = Record<string, unknown>;

export interface V2Tables {
  dishes: Row[];
  slots: Row[];
  carryOver: Row[];
  sortRules: Row[];
  settings: Row[];
  weeks: Row[];
}

const REMOVED_ROLES = new Set(['side', 'salad', 'snack']);

interface ItemRow extends Row {
  role: string;
  dishId: number | null;
}

/**
 * Deletes dishes of the removed sections and everything pointing at them; a weekday snack
 * disappears from the week, a dinner keeps only its main, a weekend lunch «main + side» keeps the main.
 * Also drops the `standalone` flag («без гарнира» means nothing without sides). Returns new rows.
 */
export function dropRemovedSections<T extends V2Tables>(tables: T): T {
  const removedIds = new Set(
    tables.dishes.filter((d) => REMOVED_CATEGORIES.includes(d.category as string)).map((d) => d.id as number),
  );
  const dishes = tables.dishes
    .filter((d) => !removedIds.has(d.id as number))
    .map(({ standalone: _standalone, ...d }) => d);

  const slots = tables.slots
    .filter((s) => s.meal !== 'snack')
    .map((s) => {
      const items = (s.items as ItemRow[]).filter((i) => !REMOVED_ROLES.has(i.role));
      const main = items.find((i) => i.role === 'main');
      const kept = main ? [main] : items.slice(0, 1);
      if (kept.length === 0) kept.push({ role: s.meal === 'breakfast' ? 'breakfast' : s.meal === 'lunch' ? 'lunch' : 'main', dishId: null });
      return { ...s, items: kept.map((i) => (i.dishId !== null && removedIds.has(i.dishId) ? { role: i.role, dishId: null } : i)) };
    });

  const carryOver = tables.carryOver.filter(
    (c) => !REMOVED_ROLES.has(c.role as string) && !removedIds.has(c.dishId as number),
  );
  const sortRules = tables.sortRules
    .filter((r) => !REMOVED_CATEGORIES.includes(r.category as string))
    .map(({ standalone: _standalone, ...r }) => r);
  const settings = tables.settings.map((s) => {
    const policy = { ...(s.repeatPolicy as Record<string, unknown> | undefined) };
    for (const c of REMOVED_CATEGORIES) delete policy[c];
    return { ...s, repeatPolicy: policy };
  });
  const weeks = tables.weeks.map((w) => {
    const snapshot = w.shoppingSnapshot as { productName: string; sources: { dishId: number }[] }[] | undefined;
    if (!snapshot) return w;
    return {
      ...w,
      shoppingSnapshot: snapshot
        .map((p) => ({ ...p, sources: p.sources.filter((src) => !removedIds.has(src.dishId)) }))
        .filter((p) => p.sources.length > 0),
    };
  });
  return { ...tables, dishes, slots, carryOver, sortRules, settings, weeks };
}
