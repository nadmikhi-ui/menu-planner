import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { historyContext } from '../logic/history';
import { seededRng } from '../logic/random';
import type { DishCategory } from '../types';
import { cancelCarryOver, setHaveIngredients, skipDishes, unskipDish } from './carryover';
import { MenuDB } from './db';
import { assembleAndSave, chooseCarryOver, createWeek, deleteDraft, rerollDish, setWeekStatus, weekSlots } from './weeks';

let database: MenuDB;
let n = 0;

beforeEach(async () => {
  database = new MenuDB(`test-carryover-${n++}`);
  const add = (category: DishCategory, count: number) =>
    database.dishes.bulkAdd(
      Array.from({ length: count }, (_, i) => ({
        name: `${category} ${i + 1}`,
        category,
        ingredients: [],
        note: '',
        standalone: false,
        addedAt: '2026-01-01T00:00:00.000Z',
        archived: false,
      })),
    );
  await add('main', 20);
  await add('side', 20);
  await add('salad', 15);
  await add('breakfast', 15);
  await add('snack', 12);
  await add('lunch', 6);
});

afterEach(async () => {
  await database.delete();
});

/** An approved week 2–8 Nov with Wednesday's dinner main and side skipped. */
async function weekWithSkippedDinner() {
  const weekId = await createWeek('2026-11-02', database);
  await assembleAndSave(weekId, seededRng(1), database);
  await setWeekStatus(weekId, 'approved', database);
  const dinner = (await weekSlots(weekId, database)).find((s) => s.date === '2026-11-04' && s.meal === 'dinner')!;
  await skipDishes(weekId, dinner.id!, [0, 1], { reason: 'ate_out', comment: 'у мамы' }, database);
  return { weekId, dinner, main: dinner.items[0]!.dishId!, side: dinner.items[1]!.dishId! };
}

describe('skipping (SPEC §5)', () => {
  it('marks dishes as skipped and queues them for next week', async () => {
    const { dinner, main, side } = await weekWithSkippedDinner();
    const stored = await database.slots.get(dinner.id!);
    expect(stored!.items[0]!.skipped).toMatchObject({ reason: 'ate_out', comment: 'у мамы' });
    expect(stored!.items[2]!.skipped).toBeUndefined();

    const queue = await database.carryOver.toArray();
    expect(queue.map((c) => [c.dishId, c.role, c.status])).toEqual([
      [main, 'main', 'pending'],
      [side, 'side', 'pending'],
    ]);
  });

  it('does not count skipped dishes as cooked', async () => {
    const { main } = await weekWithSkippedDinner();
    const weeks = await database.weeks.toArray();
    const { lastWeek } = historyContext(weeks, await database.slots.toArray(), { startDate: '2026-11-09' });
    expect(lastWeek.has(main)).toBe(false);
  });

  it('is only possible in an approved week', async () => {
    const weekId = await createWeek('2026-11-02', database);
    const slot = (await weekSlots(weekId, database))[0]!;
    await expect(skipDishes(weekId, slot.id!, [0], { reason: 'leftovers' }, database)).rejects.toThrow('утверждённой');
  });

  it('skipping again updates the reason without duplicating the queue', async () => {
    const { weekId, dinner } = await weekWithSkippedDinner();
    await skipDishes(weekId, dinner.id!, [0], { reason: 'leftovers' }, database);
    const queue = await database.carryOver.toArray();
    expect(queue).toHaveLength(2);
    expect(queue[0]!.skipped.reason).toBe('leftovers');
  });

  it('blocks returning the week to draft while it has skips', async () => {
    const { weekId, dinner } = await weekWithSkippedDinner();
    await expect(setWeekStatus(weekId, 'draft', database)).rejects.toThrow('Пропущено');
    await unskipDish(weekId, dinner.id!, 0, database);
    await unskipDish(weekId, dinner.id!, 1, database);
    await setWeekStatus(weekId, 'draft', database);
  });

  it('unskipping removes the dish from the queue', async () => {
    const { weekId, dinner, side } = await weekWithSkippedDinner();
    await unskipDish(weekId, dinner.id!, 0, database);
    expect((await database.slots.get(dinner.id!))!.items[0]!.skipped).toBeUndefined();
    expect((await database.carryOver.toArray()).map((c) => c.dishId)).toEqual([side]);
  });
});

describe('carry-over into the next week', () => {
  it('places carried dishes first and marks them placed', async () => {
    const { main, side } = await weekWithSkippedDinner();
    const next = await createWeek('2026-11-09', database);
    await assembleAndSave(next, seededRng(2), database);

    const monday = (await weekSlots(next, database)).find((s) => s.date === '2026-11-09' && s.meal === 'dinner')!;
    expect(monday.items[0]).toMatchObject({ dishId: main });
    expect(monday.items[1]).toMatchObject({ dishId: side });
    expect((await database.carryOver.toArray()).every((c) => c.status === 'placed' && c.placedWeekId === next)).toBe(true);
  });

  it('keeps them through reassembly and releases them when replaced', async () => {
    const { main } = await weekWithSkippedDinner();
    const next = await createWeek('2026-11-09', database);
    await assembleAndSave(next, seededRng(2), database);
    await assembleAndSave(next, seededRng(3), database);
    let slots = await weekSlots(next, database);
    const monday = slots.find((s) => s.date === '2026-11-09' && s.meal === 'dinner')!;
    expect(monday.items[0]!.dishId).toBe(main);

    await rerollDish(next, monday.id!, 0, seededRng(4), database);
    const carry = (await database.carryOver.where('dishId').equals(main).first())!;
    expect(carry.status).toBe('pending');
    expect(carry.placedWeekId).toBeUndefined();

    // …and can be put back by hand.
    await chooseCarryOver(next, monday.id!, 0, carry.id!, seededRng(5), database);
    slots = await weekSlots(next, database);
    expect(slots.find((s) => s.id === monday.id)!.items[0]).toMatchObject({ dishId: main, carryOverId: carry.id });
    expect((await database.carryOver.get(carry.id!))!.status).toBe('placed');
  });

  it('returns carried dishes to the queue when the draft is deleted', async () => {
    await weekWithSkippedDinner();
    const next = await createWeek('2026-11-09', database);
    await assembleAndSave(next, seededRng(2), database);
    await deleteDraft(next, database);
    expect((await database.carryOver.toArray()).every((c) => c.status === 'pending' && !c.placedWeekId)).toBe(true);
  });

  it('does not place cancelled carry-overs', async () => {
    const { main } = await weekWithSkippedDinner();
    const carry = (await database.carryOver.where('dishId').equals(main).first())!;
    await cancelCarryOver(carry.id!, database);

    const next = await createWeek('2026-11-09', database);
    await assembleAndSave(next, seededRng(2), database);
    expect((await database.carryOver.get(carry.id!))!.status).toBe('cancelled');
    const placed = (await weekSlots(next, database)).flatMap((s) => s.items).filter((i) => i.carryOverId);
    expect(placed).toHaveLength(1);
  });

  it('cancelling a placed carry-over keeps the dish in the draft as a regular choice', async () => {
    const { main } = await weekWithSkippedDinner();
    const next = await createWeek('2026-11-09', database);
    await assembleAndSave(next, seededRng(2), database);
    const carry = (await database.carryOver.where('dishId').equals(main).first())!;
    await cancelCarryOver(carry.id!, database);

    const item = (await weekSlots(next, database)).flatMap((s) => s.items).find((i) => i.dishId === main)!;
    expect(item).not.toHaveProperty('carryOverId');
  });

  it('remembers the answer to «Продукты ещё есть?»', async () => {
    const { main } = await weekWithSkippedDinner();
    const carry = (await database.carryOver.where('dishId').equals(main).first())!;
    await setHaveIngredients(carry.id!, true, database);
    expect((await database.carryOver.get(carry.id!))!.haveIngredients).toBe(true);
  });
});
