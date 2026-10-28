import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seededRng } from '../logic/random';
import type { Dish, DishCategory } from '../types';
import { MenuDB } from './db';
import {
  assembleAndSave,
  changeLunchVariant,
  chooseDish,
  createWeek,
  deleteDraft,
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
      standalone: false,
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
  await addDishes('side', 12);
  await addDishes('salad', 10);
  await addDishes('breakfast', 10);
  await addDishes('snack', 8);
  await addDishes('lunch', 4);
}

const dishIds = (slots: { items: { dishId: number | null }[] }[]) =>
  slots.flatMap((s) => s.items.map((i) => i.dishId)).filter((id): id is number => id !== null);

describe('week lifecycle', () => {
  it('creates an empty draft with 21 slots', async () => {
    const id = await createWeek('2026-11-02', database);
    expect(await database.weeks.get(id)).toMatchObject({ status: 'draft', startDate: '2026-11-02' });
    const slots = await weekSlots(id, database);
    expect(slots).toHaveLength(21);
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
    expect(ids.length).toBe(7 * 3 + 2 + 7 + 5); // dinners + 2 soups + breakfasts + snacks
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
    const [plov] = await addDishes('main', 1, { name: 'Плов', standalone: true });
    const id = await createWeek('2026-11-02', database);
    await assembleAndSave(id, seededRng(3), database);
    let slots = await weekSlots(id, database);
    const dinner = slots.find((s) => s.meal === 'dinner')!;

    await chooseDish(id, dinner.id!, 0, plov!, seededRng(1), database);
    expect((await database.slots.get(dinner.id!))?.items.map((i) => i.role)).toEqual(['main', 'salad']);

    const saladBefore = (await database.slots.get(dinner.id!))!.items[1]!.dishId;
    expect(await rerollDish(id, dinner.id!, 1, seededRng(1), database)).toBe(true);
    expect((await database.slots.get(dinner.id!))!.items[1]!.dishId).not.toBe(saladBefore);

    slots = await weekSlots(id, database);
    const lunch = slots.find((s) => s.meal === 'lunch')!;
    await changeLunchVariant(id, lunch.id!, 'main', seededRng(1), database);
    expect((await database.slots.get(lunch.id!))?.items.map((i) => i.role)).toEqual(['main', 'side']);
  });

  it('reports when there is no other dish to reroll to', async () => {
    const [only] = await addDishes('snack', 1);
    const id = await createWeek('2026-11-02', database);
    const snack = (await weekSlots(id, database)).find((s) => s.meal === 'snack')!;
    await chooseDish(id, snack.id!, 0, only!, seededRng(1), database);
    expect(await rerollDish(id, snack.id!, 0, seededRng(1), database)).toBe(false);
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
      standalone: false,
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
