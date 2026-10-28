import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildShoppingList } from '../logic/shopping';
import { seededRng } from '../logic/random';
import { setHaveIngredients, skipDishes } from './carryover';
import { MenuDB, getSettings } from './db';
import { saveDish } from './dishes';
import {
  addManualItem,
  createPlace,
  deletePlace,
  removeManualItem,
  setItemFlags,
  setProductPlace,
  setStaple,
  shoppingInput,
} from './shopping';
import { assembleAndSave, createWeek, setWeekStatus, weekSlots } from './weeks';

let database: MenuDB;
let n = 0;

beforeEach(async () => {
  database = new MenuDB(`test-shopping-${n++}`);
});

afterEach(async () => {
  await database.delete();
});

const list = async (weekId: number) => buildShoppingList(await shoppingInput(weekId, database));
const names = (lines: { productName: string }[]) => lines.map((l) => l.productName).sort();

describe('shopping list in the database (SPEC §7)', () => {
  it('ticks are stored per week and product', async () => {
    await setItemFlags(1, 'лук', { bought: true }, database);
    await setItemFlags(1, 'лук', { haveAtHome: true }, database);
    await setItemFlags(2, 'лук', { bought: true }, database);
    const rows = await database.shoppingItems.where('weekId').equals(1).toArray();
    expect(rows).toMatchObject([{ productName: 'лук', bought: true, haveAtHome: true, manual: false }]);
  });

  it('adds products by hand, registering them in the dictionary', async () => {
    expect(await addManualItem(1, '  Хлеб  Бородинский ', database)).toBe('хлеб бородинский');
    expect(await database.products.where('name').equals('хлеб бородинский').first()).toMatchObject({ placeId: 'other' });
    expect((await list(1)).lines).toMatchObject([{ productName: 'хлеб бородинский', manual: true }]);
    await expect(addManualItem(1, '  ', database)).rejects.toThrow('Введите продукт');
  });

  it('removing a hand-added staple returns it to «Постоянные запасы»', async () => {
    await saveDish({ ...draft('Омлет', 'breakfast'), ingredients: ['яйца', 'соль'] }, undefined, database);
    const weekId = await approvedWeekWith(['Омлет']);
    expect(names((await list(weekId)).staples)).toEqual(['соль']);

    await addManualItem(weekId, 'соль', database);
    expect(names((await list(weekId)).lines)).toEqual(['соль', 'яйца']);

    await removeManualItem(weekId, 'соль', database);
    expect(names((await list(weekId)).staples)).toEqual(['соль']);
  });

  it('remembers the place and staple flag of a product for every week', async () => {
    await setProductPlace('Творог', 'market', database);
    await setStaple('творог', true, database);
    expect(await database.products.where('name').equals('творог').first()).toMatchObject({ placeId: 'market', isStaple: true });
    await setStaple('соль', false, database);
    expect((await database.products.where('name').equals('соль').first())!.isStaple).toBe(false);
  });

  it('deleting a place moves its products to «Другое»', async () => {
    await createPlace('Пекарня', database, 'bakery');
    await setProductPlace('хлеб', 'bakery', database);
    expect((await getSettings(database)).places.map((p) => p.id)).toEqual(['market', 'supermarket', 'bakery', 'other']);

    await deletePlace('bakery', database);
    expect((await getSettings(database)).places.map((p) => p.id)).toEqual(['market', 'supermarket', 'other']);
    expect((await database.products.where('name').equals('хлеб').first())!.placeId).toBe('other');
  });

  it('leaves out the products of carried dishes that are still at home', async () => {
    await fillLibrary();
    const first = await createWeek('2026-11-02', database);
    await assembleAndSave(first, seededRng(1), database);
    await setWeekStatus(first, 'approved', database);
    const dinner = (await weekSlots(first, database)).find((s) => s.date === '2026-11-04' && s.meal === 'dinner')!;
    await skipDishes(first, dinner.id!, [0], { reason: 'ate_out' }, database);
    const carry = (await database.carryOver.toArray())[0]!;
    const carriedProduct = `продукт ${carry.dishId}`;

    const next = await createWeek('2026-11-09', database);
    await assembleAndSave(next, seededRng(2), database);
    await setWeekStatus(next, 'approved', database);
    expect(names((await list(next)).lines)).toContain(carriedProduct);

    await setHaveIngredients(carry.id!, true, database);
    const after = await list(next);
    expect(names(after.lines)).not.toContain(carriedProduct);
    expect(after.coveredDishIds).toEqual([carry.dishId]);
  });
});

function draft(name: string, category: 'breakfast' | 'main' | 'side' | 'salad' | 'snack' | 'lunch') {
  return { name, category, ingredients: [], note: '', standalone: false, protein: undefined, prepType: undefined, prepSource: undefined };
}

/** An approved week whose breakfasts are the given dishes (the rest stays empty). */
async function approvedWeekWith(dishNames: string[]) {
  const weekId = await createWeek('2026-11-02', database);
  const dishes = await database.dishes.toArray();
  const ids = dishNames.map((name) => dishes.find((d) => d.name === name)!.id!);
  const slots = (await weekSlots(weekId, database)).filter((s) => s.meal === 'breakfast');
  for (const [i, dishId] of ids.entries()) {
    await database.slots.update(slots[i]!.id!, { items: [{ role: 'breakfast', dishId }] });
  }
  await setWeekStatus(weekId, 'approved', database);
  return weekId;
}

/** Enough dishes to assemble whole weeks; every dish has its own product «продукт <id>». */
async function fillLibrary() {
  const counts = { main: 20, side: 20, salad: 15, breakfast: 15, snack: 12, lunch: 6 } as const;
  for (const [category, count] of Object.entries(counts) as [keyof typeof counts, number][]) {
    const ids = await database.dishes.bulkAdd(
      Array.from({ length: count }, (_, i) => ({
        name: `${category} ${i + 1}`,
        category,
        ingredients: [],
        note: '',
        standalone: false,
        addedAt: '2026-01-01T00:00:00.000Z',
        archived: false,
      })),
      { allKeys: true },
    );
    for (const id of ids) await database.dishes.update(id, { ingredients: [`продукт ${id}`] });
  }
}
