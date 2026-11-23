// Recipe-book library (SPEC §1.1): dishes with full recipes from the dietitian's books
// and freezer-prep ideas found in them. Added once automatically; can be re-added in settings.
import type { Dish, DishCategory, PrepSource, PrepType, ProteinType, Recipe } from '../types';
import { normalizeText, uniqueProducts } from '../logic/text';
import { db, getSettings, type MenuDB } from './db';
import { OTHER_PLACE_ID } from './seed';

/** Bump when the bundled library changes, so new dishes are added on the next start. */
export const BOOK_LIBRARY_VERSION = 2;

export interface BookDish {
  name: string;
  category: DishCategory;
  ingredients: string[];
  recipe?: Recipe;
  source: string;
  note?: string;
  protein?: ProteinType;
  prepType?: PrepType;
  prepSource?: PrepSource;
  /** Preps: names of the book dishes they are for (SPEC §6.1). */
  forDishes?: string[];
}

export interface BookLibrary {
  version: number;
  dishes: BookDish[];
  /** Spices and basics: added to the dictionary as «постоянные запасы» if they are new. */
  staples: string[];
}

export async function loadBundledLibrary(): Promise<BookLibrary> {
  return (await import('../data/books.json')).default as BookLibrary;
}

export interface BookImportResult {
  added: number;
  /** Existing dishes with the same name that got the book recipe. */
  enriched: number;
}

/**
 * Adds book dishes that are not in the library yet (matched by name, archive included).
 * An existing dish without a recipe gets the book recipe; anything else of the user's stays as is.
 * Auto-sort rules are not touched: these are not the user's corrections.
 */
export async function importBookLibrary(
  library: BookLibrary,
  database: MenuDB = db,
  now: Date = new Date(),
): Promise<BookImportResult> {
  return database.transaction('rw', [database.dishes, database.products, database.settings], async () => {
    const byName = new Map((await database.dishes.toArray()).map((d) => [normalizeText(d.name), d]));
    let added = 0;
    let enriched = 0;

    for (const b of library.dishes) {
      const existing = byName.get(normalizeText(b.name));
      if (existing) {
        // v2: preps learn which dishes they are for; the user's own links are kept.
        if (existing.category === 'prep' && b.forDishes?.length && !existing.forDishes?.length) {
          await database.dishes.update(existing.id!, { forDishes: b.forDishes });
        }
        if (!existing.recipe && b.recipe) {
          await database.dishes.update(existing.id!, {
            recipe: b.recipe,
            source: existing.source ?? b.source,
            ingredients: existing.ingredients.length ? existing.ingredients : uniqueProducts(b.ingredients),
          });
          enriched++;
        }
        continue;
      }
      const dish: Dish = {
        name: b.name,
        category: b.category,
        ingredients: uniqueProducts(b.ingredients),
        note: b.note ?? '',
        addedAt: now.toISOString(),
        archived: false,
        source: b.source,
      };
      if (b.recipe) dish.recipe = b.recipe;
      if (b.category === 'main' && b.protein) dish.protein = b.protein;
      if (b.category === 'prep') {
        if (b.prepType) dish.prepType = b.prepType;
        if (b.prepSource) dish.prepSource = b.prepSource;
        if (b.forDishes?.length) dish.forDishes = b.forDishes;
      }
      dish.id = await database.dishes.add(dish);
      byName.set(normalizeText(dish.name), dish);
      added++;
    }

    // New products: staples (spices, oil…) go straight to «постоянные запасы».
    const staples = new Set(uniqueProducts(library.staples));
    const all = uniqueProducts(library.dishes.flatMap((d) => d.ingredients));
    const known = new Set((await database.products.where('name').anyOf(all).toArray()).map((p) => p.name));
    await database.products.bulkAdd(
      all.filter((n) => !known.has(n)).map((name) => ({ name, placeId: OTHER_PLACE_ID, isStaple: staples.has(name) })),
    );

    const settings = await getSettings(database);
    await database.settings.put({ ...settings, bookLibraryVersion: Math.max(settings.bookLibraryVersion ?? 0, library.version) });
    return { added, enriched };
  });
}

/** On app start: adds the bundled library once per `BOOK_LIBRARY_VERSION`. */
export async function ensureBookLibrary(database: MenuDB = db): Promise<BookImportResult | null> {
  const settings = await getSettings(database);
  if ((settings.bookLibraryVersion ?? 0) >= BOOK_LIBRARY_VERSION) return null;
  return importBookLibrary(await loadBundledLibrary(), database);
}
