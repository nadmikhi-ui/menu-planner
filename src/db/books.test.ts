import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import booksData from '../data/books.json';
import { emptyDraft } from '../logic/dish';
import { normalizeText } from '../logic/text';
import { CATEGORIES } from '../types';
import { BOOK_LIBRARY_VERSION, ensureBookLibrary, importBookLibrary, type BookLibrary } from './books';
import { MenuDB } from './db';
import { saveDish } from './dishes';

let database: MenuDB;
let n = 0;

beforeEach(() => {
  database = new MenuDB(`test-books-${n++}`);
});

afterEach(async () => {
  await database.delete();
});

const recipe = { ingredients: ['Гречка — 60 г', 'Курица — 150 г'], steps: ['Отварить гречку.', 'Запечь курицу.'], kcal: 450 };

const library: BookLibrary = {
  version: 1,
  staples: ['кумин'],
  dishes: [
    { name: 'Курица с гречкой', category: 'main', protein: 'poultry', ingredients: ['куриное филе', 'гречка', 'кумин'], recipe, source: 'Книга ужинов' },
    { name: 'Омлет с овощами', category: 'breakfast', ingredients: ['яйца', 'помидоры'], recipe, source: 'Книга завтраков' },
    { name: 'Заморозка: запечённая курица порциями', category: 'prep', prepType: 'main', prepSource: 'fresh', ingredients: ['куриное филе'], source: 'Книга ужинов' },
  ],
};

describe('importBookLibrary', () => {
  it('adds dishes with recipes next to the user’s own dishes', async () => {
    await saveDish({ ...emptyDraft(), name: 'Борщ', category: 'lunch' }, undefined, database);
    const result = await importBookLibrary(library, database);

    expect(result).toEqual({ added: 3, enriched: 0 });
    expect(await database.dishes.count()).toBe(4);
    const chicken = await database.dishes.where('name').equals('Курица с гречкой').first();
    expect(chicken).toMatchObject({ category: 'main', protein: 'poultry', source: 'Книга ужинов', recipe });
    expect(await database.sortRules.count()).toBe(0);
  });

  it('does not duplicate dishes and gives the book recipe to a same-named dish without one', async () => {
    await saveDish({ ...emptyDraft(), name: 'омлет с овощами', category: 'breakfast', ingredients: ['яйца'] }, undefined, database);
    expect(await importBookLibrary(library, database)).toEqual({ added: 2, enriched: 1 });
    expect(await importBookLibrary(library, database)).toEqual({ added: 0, enriched: 0 });

    const omelets = (await database.dishes.toArray()).filter((d) => normalizeText(d.name) === 'омлет с овощами');
    expect(omelets).toHaveLength(1);
    // The user's own ingredient list is kept.
    expect(omelets[0]).toMatchObject({ ingredients: ['яйца'], recipe, source: 'Книга завтраков' });
  });

  it('adds new products, spices as staples, and records the library version', async () => {
    await importBookLibrary(library, database);
    expect(await database.products.where('name').equals('кумин').first()).toMatchObject({ isStaple: true });
    expect(await database.products.where('name').equals('гречка').first()).toMatchObject({ isStaple: false, placeId: 'other' });
    expect((await database.settings.get('main'))?.bookLibraryVersion).toBe(1);
  });
});

describe('ensureBookLibrary', () => {
  it('imports the bundled library once', async () => {
    const first = await ensureBookLibrary(database);
    expect(first?.added).toBe(booksData.dishes.length);
    expect(await ensureBookLibrary(database)).toBeNull();
    expect((await database.settings.get('main'))?.bookLibraryVersion).toBe(BOOK_LIBRARY_VERSION);
  });
});

describe('bundled library data', () => {
  const data = booksData as BookLibrary;

  it('has unique names, known categories, products and a recipe for every book dish', () => {
    const names = new Set<string>();
    for (const d of data.dishes) {
      expect(CATEGORIES).toContain(d.category);
      expect(names.has(normalizeText(d.name)), d.name).toBe(false);
      names.add(normalizeText(d.name));
      expect(d.ingredients.length, d.name).toBeGreaterThan(0);
      if (d.category !== 'prep') {
        expect(d.recipe?.ingredients.length, d.name).toBeGreaterThan(0);
        expect(d.recipe?.steps.length, d.name).toBeGreaterThan(0);
      }
    }
  });
});

describe('saving a book dish', () => {
  it('does not learn an auto-sort rule when the section is left as is', async () => {
    await importBookLibrary(library, database);
    const prep = (await database.dishes.where('name').startsWith('Заморозка').first())!;
    await saveDish({ ...emptyDraft(), name: prep.name, category: 'prep', note: 'проверено' }, prep.id, database);
    expect(await database.sortRules.count()).toBe(0);
  });
});
