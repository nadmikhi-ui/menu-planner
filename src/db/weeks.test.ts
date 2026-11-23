import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { historyContext } from '../logic/history';
import { seededRng } from '../logic/random';
import { analyzeWeek } from '../logic/repeats';
import { STRICT } from '../logic/test-fixtures';
import type { Dish, DishCategory } from '../types';
import { MenuDB } from './db';
import {
  assembleAndSave,
  changeLunchVariant,
  chooseDish,
  createWeek,
  deleteDraft,
  deleteWeek,
  repeatAsDraft,
  rerollDish,
  setWeekStatus,
  weekSlots,
} from './weeks';

let database: MenuDB;
let n = 0;

beforeEach(() => {
  database = new MenuDB(`test-weeks-${n++}`);
});

afterEach(async () => {
  await database.delete();
});

async function addDishes(category: DishCategory, count: number, extra: Partial<Dish> = {}): Promise<number[]> {
  const ids = await database.dishes.bulkAdd(
    Array.from({ length: count }, (_, i) => ({
      name: `${category} ${i + 1}`,
      category,
      ingredients: [],
      note: '',
      addedAt: '2026-01-01T00:00:00.000Z',
      archived: false,
      ...extra,
    })),
    { allKeys: true },
  );
  return ids as number[];
}

async function addLibrary() {
  await addDishes('main', 12);
  await addDishes('breakfast', 10);
  await addDishes('lunch', 4);
}

const dishIds = (slots: { items: { dishId: number | null }[] }[]) =>
  slots.flatMap((s) => s.items.map((i) => i.dishId)).filter((id): id is number => id !== null);

describe('week lifecycle', () => {
  it('creates an empty draft with 16 slots', async () => {
    const id = await createWeek('2026-11-02', database);
    expect(await database.weeks.get(id)).toMatchObject({ status: 'draft', startDate: '2026-11-02' });
    const slots = await weekSlots(id, database);
    expect(slots).toHaveLength(16);
    expect(dishIds(slots)).toEqual([]);
    expect(slots[0]).toMatchObject({ date: '2026-11-02', meal: 'breakfast' });
  });

  it('refuses a second week with the same start date', async () => {
    await createWeek('2026-11-02', database);
    await expect(createWeek('2026-11-02', database)).rejects.toThrow('уже есть');
  });

  it('goes draft → approved → done, and approved can return to draft', async () => {
    const id = await createWeek('2026-11-02', database);
    await setWeekStatus(id, 'approved', database);
    expect((await database.weeks.get(id))?.approvedAt).toBeDefined();
    await setWeekStatus(id, 'draft', database);
    await setWeekStatus(id, 'approved', database);
    await setWeekStatus(id, 'done', database);
    expect(await database.weeks.get(id)).toMatchObject({ status: 'done' });
    await expect(setWeekStatus(id, 'draft', database)).rejects.toThrow();
  });

  it('deletes only drafts', async () => {
    const id = await createWeek('2026-11-02', database);
    await setWeekStatus(id, 'approved', database);
    await expect(deleteDraft(id, database)).rejects.toThrow();

    const draft = await createWeek('2026-11-09', database);
    await deleteDraft(draft, database);
    expect(await database.weeks.get(draft)).toBeUndefined();
    expect(await database.slots.where('weekId').equals(draft).count()).toBe(0);
  });
});

describe('assembleAndSave', () => {
  it('fills the draft without repeats', async () => {
    await addLibrary();
    const id = await createWeek('2026-11-02', database);
    await assembleAndSave(id, seededRng(7), database);
    const ids = dishIds(await weekSlots(id, database));
    expect(ids.length).toBe(7 + 2 + 7); // dinners + 2 weekend lunches + breakfasts
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('avoids dishes cooked in the previous approved week (2-week window)', async () => {
    await addLibrary();
    const prev = await createWeek('2026-10-26', database);
    await assembleAndSave(prev, seededRng(1), database);
    await setWeekStatus(prev, 'approved', database);
    const cooked = new Set(dishIds(await weekSlots(prev, database)));

    const next = await createWeek('2026-11-02', database);
    await assembleAndSave(next, seededRng(2), database);
    const mains = (await database.dishes.where('category').equals('main').toArray()).map((d) => d.id!);
    const nextMains = dishIds(await weekSlots(next, database)).filter((id) => mains.includes(id));
    // 12 mains, 7 cooked last week → only 5 fresh for 7 dinners: fresh ones must all be used first.
    const freshMains = mains.filter((id) => !cooked.has(id));
    for (const id of freshMains) expect(nextMains).toContain(id);
  });

  it('refuses to change an approved week', async () => {
    await addLibrary();
    const id = await createWeek('2026-11-02', database);
    await setWeekStatus(id, 'approved', database);
    await expect(assembleAndSave(id, seededRng(1), database)).rejects.toThrow('черновик');
  });
});

describe('slot edits', () => {
  it('chooses, rerolls and switches the lunch variant', async () => {
    await addLibrary();
    const [plov] = await addDishes('main', 1, { name: 'Плов' });
    const id = await createWeek('2026-11-02', database);
    await assembleAndSave(id, seededRng(3), database);
    let slots = await weekSlots(id, database);
    const dinner = slots.find((s) => s.meal === 'dinner')!;

    await chooseDish(id, dinner.id!, 0, plov!, seededRng(1), database);
    expect((await database.slots.get(dinner.id!))?.items).toEqual([{ role: 'main', dishId: plov }]);

    expect(await rerollDish(id, dinner.id!, 0, seededRng(1), database)).toBe(true);
    expect((await database.slots.get(dinner.id!))!.items[0]!.dishId).not.toBe(plov);

    slots = await weekSlots(id, database);
    const lunch = slots.find((s) => s.meal === 'lunch')!;
    await changeLunchVariant(id, lunch.id!, 'main', seededRng(1), database);
    expect((await database.slots.get(lunch.id!))?.items.map((i) => i.role)).toEqual(['main']);
  });

  it('reports when there is no other dish to reroll to', async () => {
    const [only] = await addDishes('breakfast', 1);
    const id = await createWeek('2026-11-02', database);
    const breakfast = (await weekSlots(id, database)).find((s) => s.meal === 'breakfast')!;
    await chooseDish(id, breakfast.id!, 0, only!, seededRng(1), database);
    expect(await rerollDish(id, breakfast.id!, 0, seededRng(1), database)).toBe(false);
  });
});

describe('«Повторить как черновик» (SPEC §8)', () => {
  it('creates a draft with the same dishes and prep tasks, not done', async () => {
    await addLibrary();
    const source = await createWeek('2026-10-26', database);
    await assembleAndSave(source, seededRng(1), database);
    await setWeekStatus(source, 'approved', database);
    const prep = (await database.dishes.add({
      name: 'Укроп',
      category: 'prep',
      ingredients: [],
      note: '',
      addedAt: '2026-01-01T00:00:00.000Z',
      archived: false,
    }))!;
    await database.prepTasks.add({ weekId: source, dishId: prep, done: true, freezerItemId: 1 });
    await setWeekStatus(source, 'done', database);

    const copy = await repeatAsDraft(source, '2026-11-09', database);
    expect(await database.weeks.get(copy)).toMatchObject({ startDate: '2026-11-09', status: 'draft' });
    const dishesOf = async (weekId: number) => (await weekSlots(weekId, database)).map((s) => s.items.map((i) => i.dishId));
    expect(await dishesOf(copy)).toEqual(await dishesOf(source));
    expect(await database.prepTasks.where('weekId').equals(copy).toArray()).toMatchObject([{ dishId: prep, done: false }]);
  });

  it('allows only one draft at a time', async () => {
    const source = await createWeek('2026-10-26', database);
    await expect(repeatAsDraft(source, '2026-11-09', database)).rejects.toThrow('Черновик уже есть');
    await setWeekStatus(source, 'approved', database);
    await expect(repeatAsDraft(source, '2026-10-26', database)).rejects.toThrow('уже есть');
  });
});

describe('assembleAndSave «Заполнить только пустые»', () => {
  it('keeps chosen dishes and slot ids, fills the rest', async () => {
    await addLibrary();
    const weekId = await createWeek('2026-11-02', database);
    const before = await weekSlots(weekId, database);
    const monday = before.find((s) => s.meal === 'dinner')!;
    const chosen = (await database.dishes.where('category').equals('main').first())!;
    await chooseDish(weekId, monday.id!, 0, chosen.id!, seededRng(1), database);

    await assembleAndSave(weekId, seededRng(2), database, 'empty');
    const after = await weekSlots(weekId, database);
    expect(after.map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect(after.find((s) => s.id === monday.id)!.items[0]!.dishId).toBe(chosen.id);
    expect(after.flatMap((s) => s.items).every((i) => i.dishId !== null)).toBe(true);
  });
});

describe('«Повторить как черновик» and the repeat rules', () => {
  it('flags every dish of the repeated week as «было на прошлой неделе»', async () => {
    await addLibrary();
    const source = await createWeek('2026-11-02', database);
    await assembleAndSave(source, seededRng(1), database);
    await setWeekStatus(source, 'approved', database);
    await setWeekStatus(source, 'done', database);

    const copy = await repeatAsDraft(source, '2026-11-09', database);
    const week = (await database.weeks.get(copy))!;
    const { lastWeek } = historyContext(await database.weeks.toArray(), await database.slots.toArray(), week);
    const analysis = analyzeWeek(await weekSlots(copy, database), await database.dishes.toArray(), lastWeek, STRICT);
    expect(analysis.warningCount).toBeGreaterThan(0);
    expect(analysis.items.flat(2).every((w) => w.kind === 'lastWeek' || w.kind === 'duplicate')).toBe(true);
    expect(analysis.items.flat().filter((w) => w.length).length).toBe(analysis.warningCount);
  });
});

describe('deleting weeks (SPEC §8)', () => {
  it('deletes an approved or finished week with its days, prep tasks and shopping list', async () => {
    await addLibrary();
    const id = await createWeek('2026-11-02', database);
    await assembleAndSave(id, seededRng(1), database);
    await setWeekStatus(id, 'approved', database);
    const [prep] = await addDishes('prep', 1);
    await database.prepTasks.add({ weekId: id, dishId: prep!, done: false });
    await database.shoppingItems.add({ weekId: id, productName: 'лук', bought: true, haveAtHome: false, manual: true });
    await setWeekStatus(id, 'done', database);

    await deleteWeek(id, database);
    expect(await database.weeks.count()).toBe(0);
    expect(await database.slots.count()).toBe(0);
    expect(await database.prepTasks.count()).toBe(0);
    expect(await database.shoppingItems.count()).toBe(0);
  });

  it('drops dishes skipped in the deleted week from the queue, keeps ones already placed', async () => {
    await addLibrary();
    const id = await createWeek('2026-11-02', database);
    await assembleAndSave(id, seededRng(1), database);
    await setWeekStatus(id, 'approved', database);
    const [main] = await database.dishes.where('category').equals('main').primaryKeys();
    await database.carryOver.bulkAdd([
      { dishId: main!, role: 'main', fromWeekId: id, fromSlotId: 1, skipped: { reason: 'leftovers', at: '' }, status: 'pending', createdAt: '' },
      { dishId: main!, role: 'main', fromWeekId: id, fromSlotId: 1, skipped: { reason: 'leftovers', at: '' }, status: 'placed', placedWeekId: 99, createdAt: '' },
    ]);
    await deleteWeek(id, database);
    expect((await database.carryOver.toArray()).map((c) => c.status)).toEqual(['placed']);
  });

  it('returns carried dishes held by the deleted week to the queue', async () => {
    await addLibrary();
    const [main] = await database.dishes.where('category').equals('main').primaryKeys();
    const carry = (await database.carryOver.add({
      dishId: main!,
      role: 'main',
      fromWeekId: 77,
      fromSlotId: 1,
      skipped: { reason: 'leftovers', at: '' },
      status: 'pending',
      createdAt: '',
    }))!;
    const id = await createWeek('2026-11-09', database);
    await assembleAndSave(id, seededRng(1), database);
    await setWeekStatus(id, 'approved', database);
    expect((await database.carryOver.get(carry))!.status).toBe('placed');
    await deleteWeek(id, database);
    expect(await database.carryOver.get(carry)).toMatchObject({ status: 'pending' });
  });
});

describe('preps in the freezer (SPEC §6.1)', () => {
  it('assembly puts in dishes for a prep that is in the freezer', async () => {
    await addLibrary();
    const mains = await database.dishes.where('category').equals('main').toArray();
    const forPrep = mains.slice(0, 4);
    const prep = (await database.dishes.add({
      name: 'Фрикадельки',
      category: 'prep',
      ingredients: [],
      note: '',
      forDishes: forPrep.map((d) => d.name),
      addedAt: '',
      archived: false,
    }))!;
    await database.freezer.add({ name: 'Фрикадельки', dishId: prep, frozenAt: '2026-10-30', quantity: '', status: 'in_stock', updatedAt: '' });

    for (let seed = 1; seed <= 5; seed++) {
      const id = await createWeek(`2026-11-0${seed + 1}`, database);
      await assembleAndSave(id, seededRng(seed), database);
      const used = dishIds(await weekSlots(id, database));
      expect(used.filter((d) => forPrep.some((m) => m.id === d)).length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      await deleteWeek(id, database);
    }
  });
});
