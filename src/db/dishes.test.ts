import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyDraft, type DishDraft } from '../logic/dish';
import { MenuDB } from './db';
import { saveDish, setDishArchived, suggestForDish } from './dishes';

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
