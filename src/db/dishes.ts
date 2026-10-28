import { learnedRule, suggestCategory, type CategorySuggestion } from '../logic/autosort';
import { draftToDish, type DishDraft } from '../logic/dish';
import { uniqueProducts } from '../logic/text';
import { db, type MenuDB } from './db';
import { OTHER_PLACE_ID } from './seed';

export async function suggestForDish(
  name: string,
  ingredients: string[],
  database: MenuDB = db,
): Promise<CategorySuggestion | null> {
  return suggestCategory(name, ingredients, await database.sortRules.toArray());
}

/** Adds unknown products to the dictionary with the default place «Другое» (SPEC §7). */
export async function ensureProducts(names: string[], database: MenuDB = db): Promise<void> {
  const unique = uniqueProducts(names);
  if (unique.length === 0) return;
  const existing = new Set((await database.products.where('name').anyOf(unique).toArray()).map((p) => p.name));
  const missing = unique.filter((n) => !existing.has(n));
  await database.products.bulkAdd(missing.map((name) => ({ name, placeId: OTHER_PLACE_ID, isStaple: false })));
}

/**
 * Creates or updates a dish, registers its ingredients in the product dictionary
 * and, if the chosen category differs from the suggestion, remembers the correction (SPEC §2).
 */
export async function saveDish(
  draft: DishDraft,
  id?: number,
  database: MenuDB = db,
  now: Date = new Date(),
): Promise<number> {
  return database.transaction('rw', [database.dishes, database.products, database.sortRules], async () => {
    const existing = id === undefined ? undefined : await database.dishes.get(id);
    if (id !== undefined && !existing) throw new Error(`Dish ${id} not found`);

    // Suggestion is computed from the same rules the form used, before this save changes them.
    const suggestion = await suggestForDish(draft.name, draft.ingredients, database);
    const dish = draftToDish(draft, existing, now);
    const savedId = (await database.dishes.put(dish))!;

    await ensureProducts(dish.ingredients, database);

    const rule = learnedRule(dish.name, suggestion, { category: dish.category, standalone: dish.standalone });
    if (rule) {
      const old = await database.sortRules.where('keyword').equals(rule.keyword).first();
      const row = { ...rule, createdAt: now.toISOString() };
      await (old ? database.sortRules.put({ ...row, id: old.id }) : database.sortRules.add(row));
    }
    return savedId;
  });
}

export async function setDishArchived(id: number, archived: boolean, database: MenuDB = db): Promise<void> {
  await database.dishes.update(id, { archived });
}
