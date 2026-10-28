import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEMO_DISHES } from '../logic/demo';
import { emptyDraft, type DishDraft } from '../logic/dish';
import { seededRng } from '../logic/random';
import { analyzeWeek } from '../logic/repeats';
import { STRICT } from '../logic/test-fixtures';
import { MenuDB } from './db';
import { deleteDemoDishes, loadDemoDishes, saveDish, setDishArchived, suggestForDish } from './dishes';
import { assembleAndSave, createWeek, weekSlots } from './weeks';

let database: MenuDB;
let n = 0;

beforeEach(() => {
  database = new MenuDB(`test-dishes-${n++}`);
});

afterEach(async () => {
  await database.delete();
});

const draft = (overrides: Partial<DishDraft>): DishDraft => ({ ...emptyDraft(), ...overrides });

describe('saveDish', () => {
  it('creates a dish and adds new ingredients to the product dictionary as «Другое»', async () => {
    const id = await saveDish(draft({ name: 'Плов', category: 'main', standalone: true, ingredients: ['Рис', 'баранина', 'соль'] }), undefined, database);

    expect(await database.dishes.get(id)).toMatchObject({ name: 'Плов', ingredients: ['рис', 'баранина', 'соль'] });
    const products = await database.products.where('name').anyOf('рис', 'баранина', 'соль').toArray();
    expect(products).toHaveLength(3);
    expect(products.find((p) => p.name === 'рис')).toMatchObject({ placeId: 'other', isStaple: false });
    // Existing staple is left untouched.
    expect(products.find((p) => p.name === 'соль')?.isStaple).toBe(true);
  });

  it('does not learn anything when the suggestion is accepted', async () => {
    await saveDish(draft({ name: 'Борщ', category: 'lunch' }), undefined, database);
    expect(await database.sortRules.count()).toBe(0);
  });

  it('remembers a correction and uses it next time (SPEC §2)', async () => {
    expect((await suggestForDish('Блины с мясом', [], database))?.category).toBe('breakfast');

    await saveDish(draft({ name: 'Блины с мясом', category: 'main', standalone: true }), undefined, database);

    expect(await database.sortRules.toArray()).toMatchObject([
      { keyword: 'блины с мясом', category: 'main', standalone: true },
    ]);
    expect(await suggestForDish('Блины с мясом', [], database)).toMatchObject({
      category: 'main',
      standalone: true,
      source: 'user',
    });
    // Plain «Блины» still follow the built-in rule.
    expect((await suggestForDish('Блины', [], database))?.category).toBe('breakfast');
  });

  it('remembers a category chosen without a suggestion', async () => {
    expect(await suggestForDish('Шакшука', [], database)).toBeNull();
    await saveDish(draft({ name: 'Шакшука', category: 'breakfast' }), undefined, database);
    expect((await suggestForDish('Шакшука с фетой', [], database))?.category).toBe('breakfast');
  });

  it('replaces an older rule with the same keyword', async () => {
    await saveDish(draft({ name: 'Кесадилья', category: 'snack' }), undefined, database);
    const id = (await database.dishes.toArray())[0]!.id!;
    await saveDish(draft({ name: 'Кесадилья', category: 'main' }), id, database);

    expect(await database.sortRules.toArray()).toMatchObject([{ keyword: 'кесадилья', category: 'main' }]);
    expect(await database.dishes.count()).toBe(1);
  });

  it('updates an existing dish and keeps its added date', async () => {
    const id = await saveDish(draft({ name: 'Гречка', category: 'side' }), undefined, database, new Date('2026-01-01'));
    await saveDish(draft({ name: 'Гречка с луком', category: 'side', note: 'Обжарить лук' }), id, database, new Date('2026-02-01'));

    expect(await database.dishes.get(id)).toMatchObject({
      name: 'Гречка с луком',
      note: 'Обжарить лук',
      addedAt: new Date('2026-01-01').toISOString(),
    });
  });

  it('rejects unknown ids', async () => {
    await expect(saveDish(draft({ name: 'Гречка', category: 'side' }), 999, database)).rejects.toThrow();
  });
});

describe('setDishArchived', () => {
  it('hides and restores a dish without deleting it', async () => {
    const id = await saveDish(draft({ name: 'Гречка', category: 'side' }), undefined, database);
    await setDishArchived(id, true, database);
    expect((await database.dishes.get(id))?.archived).toBe(true);

    // Editing an archived dish keeps it archived.
    await saveDish(draft({ name: 'Гречка', category: 'side', note: 'x' }), id, database);
    expect((await database.dishes.get(id))?.archived).toBe(true);

    await setDishArchived(id, false, database);
    expect((await database.dishes.get(id))?.archived).toBe(false);
  });
});

describe('loadDemoDishes', () => {
  it('adds the demo library without learning rules, then adds nothing the second time', async () => {
    const database = new MenuDB(`test-demo-${Math.random()}`);
    try {
      expect(await loadDemoDishes(database)).toBe(DEMO_DISHES.length);
      expect(await database.dishes.count()).toBe(DEMO_DISHES.length);
      expect(await database.sortRules.count()).toBe(0);
      expect(await database.products.where('name').equals('лосось').count()).toBe(1);
      expect(await loadDemoDishes(database)).toBe(0);
    } finally {
      await database.delete();
    }
  });

  it('skips dishes that already exist, even archived ones', async () => {
    const database = new MenuDB(`test-demo-${Math.random()}`);
    try {
      const id = await saveDish({ name: 'борщ', category: 'lunch', ingredients: [], note: '', standalone: false }, undefined, database);
      await setDishArchived(id, true, database);
      expect(await loadDemoDishes(database)).toBe(DEMO_DISHES.length - 1);
    } finally {
      await database.delete();
    }
  });

  it('gives enough dishes to assemble a week without shortages', async () => {
    const database = new MenuDB(`test-demo-${Math.random()}`);
    try {
      await loadDemoDishes(database);
      const weekId = await createWeek('2026-11-02', database);
      await assembleAndSave(weekId, seededRng(1), database);
      const slots = await weekSlots(weekId, database);
      expect(slots.flatMap((s) => s.items).every((i) => i.dishId !== null)).toBe(true);
      const analysis = analyzeWeek(slots, await database.dishes.toArray(), new Set(), STRICT);
      expect(analysis.shortages).toEqual([]);
      expect(analysis.warningCount).toBe(0);
    } finally {
      await database.delete();
    }
  });
});

describe('deleteDemoDishes', () => {
  async function withDemo() {
    const database = new MenuDB(`test-demo-del-${Math.random()}`);
    await loadDemoDishes(database);
    return database;
  }

  it('removes the demo dishes and leaves the user’s own', async () => {
    const database = await withDemo();
    try {
      await saveDish({ name: 'Мой борщ', category: 'lunch', ingredients: [], note: '', standalone: false }, undefined, database);
      expect(await database.dishes.filter((d) => !!d.demo).count()).toBe(DEMO_DISHES.length);

      expect(await deleteDemoDishes(database)).toEqual({ deleted: DEMO_DISHES.length, archived: 0 });
      expect((await database.dishes.toArray()).map((d) => d.name)).toEqual(['Мой борщ']);
    } finally {
      await database.delete();
    }
  });

  it('keeps a demo dish you edited', async () => {
    const database = await withDemo();
    try {
      const dish = (await database.dishes.where('name').equals('Плов').first())!;
      await saveDish({ name: 'Плов', category: 'main', ingredients: ['рис', 'баранина'], note: 'мой рецепт', standalone: true }, dish.id, database);
      expect((await database.dishes.get(dish.id!))!.demo).toBeUndefined();

      await deleteDemoDishes(database);
      expect((await database.dishes.toArray()).map((d) => d.name)).toEqual(['Плов']);
    } finally {
      await database.delete();
    }
  });

  it('archives dishes that are already in a week instead of deleting them', async () => {
    const database = await withDemo();
    try {
      const weekId = await createWeek('2026-11-02', database);
      await assembleAndSave(weekId, seededRng(1), database);
      const inWeek = new Set((await weekSlots(weekId, database)).flatMap((s) => s.items.map((i) => i.dishId)));

      const { deleted, archived } = await deleteDemoDishes(database);
      expect(archived).toBe(inWeek.size);
      expect(deleted).toBe(DEMO_DISHES.length - inWeek.size);
      const left = await database.dishes.toArray();
      expect(left.every((d) => d.archived && inWeek.has(d.id!))).toBe(true);
      // The week still shows its dishes.
      expect((await weekSlots(weekId, database)).flatMap((s) => s.items).every((i) => i.dishId !== null)).toBe(true);
      expect(await deleteDemoDishes(database)).toEqual({ deleted: 0, archived: 0 });
    } finally {
      await database.delete();
    }
  });
});
