// Dish form ↔ stored dish (SPEC §1).
import type { Dish, DishCategory, PrepSource, PrepType, ProteinType, Recipe } from '../types';
import { cleanName, normalizeText, uniqueProducts } from './text';

/** What the dish form edits. `category` is null until chosen or suggested. */
export interface DishDraft {
  name: string;
  category: DishCategory | null;
  ingredients: string[];
  note: string;
  protein?: ProteinType;
  standalone: boolean;
  prepType?: PrepType;
  prepSource?: PrepSource;
  recipe?: Recipe;
  source?: string;
}

export function emptyDraft(): DishDraft {
  return { name: '', category: null, ingredients: [], note: '', standalone: false };
}

export function dishToDraft(dish: Dish): DishDraft {
  return {
    name: dish.name,
    category: dish.category,
    ingredients: [...dish.ingredients],
    note: dish.note,
    protein: dish.protein,
    standalone: dish.standalone,
    prepType: dish.prepType,
    prepSource: dish.prepSource,
    recipe: dish.recipe ? cloneRecipe(dish.recipe) : undefined,
    source: dish.source,
  };
}

function cloneRecipe(r: Recipe): Recipe {
  return { ...r, ingredients: [...r.ingredients], steps: [...r.steps] };
}

/** Trims lines and drops empty ones; returns undefined if nothing is left to show. */
export function cleanRecipe(recipe: Recipe | undefined): Recipe | undefined {
  if (!recipe) return undefined;
  const lines = (xs: string[]) => xs.map(cleanName).filter(Boolean);
  const r: Recipe = { ...recipe, ingredients: lines(recipe.ingredients), steps: lines(recipe.steps) };
  const tips = recipe.tips?.trim();
  if (tips) r.tips = tips;
  else delete r.tips;
  if (!r.ingredients.length && !r.steps.length && !r.tips) return undefined;
  return r;
}

/** Text of a textarea → recipe lines: one per line, leading «1.», «•», «-» removed. */
export function linesFromText(text: string): string[] {
  return text
    .split('\n')
    .map((l) => cleanName(l.replace(/^\s*(?:\d+[.)]|[•·\-–—✓])\s*/, '')))
    .filter(Boolean);
}

/** Russian error messages; empty if the draft can be saved. */
export function validateDraft(draft: DishDraft): string[] {
  const errors: string[] = [];
  if (!cleanName(draft.name)) errors.push('Введите название');
  if (!draft.category) errors.push('Выберите раздел');
  return errors;
}

/**
 * Builds the stored dish: trims text, normalizes ingredients and drops fields
 * that don't apply to the category (protein/standalone only for mains, prep fields only for preps).
 */
export function draftToDish(draft: DishDraft, existing: Dish | undefined, now: Date): Dish {
  const category = draft.category;
  if (!category) throw new Error('Category is required');
  const isMain = category === 'main';
  const isPrep = category === 'prep';

  const dish: Dish = {
    name: cleanName(draft.name),
    category,
    ingredients: uniqueProducts(draft.ingredients),
    note: draft.note.trim(),
    standalone: isMain && draft.standalone,
    addedAt: existing?.addedAt ?? now.toISOString(),
    archived: existing?.archived ?? false,
  };
  if (existing?.id !== undefined) dish.id = existing.id;
  if (isMain && draft.protein) dish.protein = draft.protein;
  if (isPrep && draft.prepType) dish.prepType = draft.prepType;
  if (isPrep && draft.prepSource) dish.prepSource = draft.prepSource;
  const recipe = cleanRecipe(draft.recipe);
  if (recipe) dish.recipe = recipe;
  const source = draft.source ?? existing?.source;
  if (source) dish.source = source;
  return dish;
}

/** Another (non-archived or archived) dish with the same name, ignoring case and punctuation. */
export function findDuplicate(name: string, dishes: Dish[], excludeId?: number): Dish | undefined {
  const key = normalizeText(name);
  if (!key) return undefined;
  return dishes.find((d) => d.id !== excludeId && normalizeText(d.name) === key);
}

/** Search by name or ingredient, ignoring case and `ё`. */
export function matchesSearch(dish: Dish, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  return normalizeText(dish.name).includes(q) || dish.ingredients.some((i) => normalizeText(i).includes(q));
}

const collator = new Intl.Collator('ru');

export function sortByName(dishes: Dish[]): Dish[] {
  return [...dishes].sort((a, b) => collator.compare(a.name, b.name));
}
