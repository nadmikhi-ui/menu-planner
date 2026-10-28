import { describe, expect, it } from 'vitest';
import type { CarryOver, Slot, Week } from '../types';
import { assembleWeek, applyDish } from './assemble';
import { carryOversForSkip, placementPatches, queueFor, skipItems, toCarried, unskipItem } from './carryover';
import { analyzeWeek } from './repeats';
import { STRICT, context, fullLibrary, makeDish } from './test-fixtures';

const START = '2026-11-02'; // Monday
const NOW = '2026-11-05T12:00:00.000Z';

const carry = (id: number, dishId: number, extra: Partial<CarryOver> = {}): CarryOver => ({
  id,
  dishId,
  role: 'main',
  fromWeekId: 1,
  fromSlotId: 1,
  skipped: { reason: 'leftovers', at: NOW },
  status: 'pending',
  createdAt: NOW,
  ...extra,
});

describe('assembleWeek with carried-over dishes (SPEC §5)', () => {
  const lib = fullLibrary();
  const first = (category: string) => lib.find((d) => d.category === category)!;

  it('puts carried dishes first, into the earliest suitable positions', () => {
    const main = first('main');
    const breakfast = first('breakfast');
    const soup = first('lunch');
    const slots = assembleWeek(START, context(lib), [
      { carryOverId: 1, dishId: main.id! },
      { carryOverId: 2, dishId: breakfast.id! },
      { carryOverId: 3, dishId: soup.id! },
    ]);
    const monday = slots.filter((s) => s.date === START);
    expect(monday.find((s) => s.meal === 'dinner')!.items[0]).toEqual({ role: 'main', dishId: main.id, carryOverId: 1 });
    expect(monday.find((s) => s.meal === 'breakfast')!.items[0]).toMatchObject({ dishId: breakfast.id, carryOverId: 2 });
    expect(slots.find((s) => s.meal === 'lunch')!.items[0]).toMatchObject({ dishId: soup.id, carryOverId: 3 });

    // The rest is filled automatically without repeating the carried dishes.
    const ids = slots.flatMap((s) => s.items.map((i) => i.dishId));
    expect(ids.every((id) => id !== null)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places two carried mains on consecutive days', () => {
    const [m1, m2] = lib.filter((d) => d.category === 'main');
    const slots = assembleWeek(START, context(lib), [
      { carryOverId: 1, dishId: m1!.id! },
      { carryOverId: 2, dishId: m2!.id! },
    ]);
    const dinners = slots.filter((s) => s.meal === 'dinner');
    expect(dinners[0]!.items[0]!.dishId).toBe(m1!.id);
    expect(dinners[1]!.items[0]!.dishId).toBe(m2!.id);
  });

  it('keeps the dinner without a side for a carried standalone main', () => {
    const plov = makeDish('main', 'Плов', { standalone: true });
    const slots = assembleWeek(START, context([...lib, plov]), [{ carryOverId: 1, dishId: plov.id! }]);
    expect(slots.find((s) => s.meal === 'dinner')!.items.map((i) => i.role)).toEqual(['main', 'salad']);
  });

  it('pairs a carried side with a main that needs one', () => {
    const plovs = Array.from({ length: 20 }, (_, i) => makeDish('main', `Плов ${i}`, { standalone: true }));
    const regular = makeDish('main', 'Котлеты');
    const side = first('side');
    const dishes = [...lib.filter((d) => d.category !== 'main'), ...plovs, regular];
    const slots = assembleWeek(START, context(dishes), [{ carryOverId: 1, dishId: side.id! }]);
    const dinner = slots.find((s) => s.meal === 'dinner')!;
    expect(dinner.items.map((i) => i.dishId)).toContain(side.id);
    expect(dinner.items[0]!.dishId).toBe(regular.id);
  });

  it('does not flag carried dishes as cooked last week', () => {
    const main = first('main');
    const slots = assembleWeek(START, context(lib), [{ carryOverId: 1, dishId: main.id! }]);
    expect(analyzeWeek(slots, lib, new Set(), STRICT).warningCount).toBe(0);
  });

  it('ignores freezer preps and unknown dishes', () => {
    const prep = makeDish('prep', 'Ягоды');
    const slots = assembleWeek(START, context([...lib, prep]), [
      { carryOverId: 1, dishId: prep.id! },
      { carryOverId: 2, dishId: 99999 },
    ]);
    expect(slots.flatMap((s) => s.items).some((i) => i.carryOverId !== undefined)).toBe(false);
  });

  it('applyDish drops the carry-over link when the dish is replaced', () => {
    const main = first('main');
    const slots = assembleWeek(START, context(lib), [{ carryOverId: 1, dishId: main.id! }]);
    const dinner = slots.findIndex((s) => s.meal === 'dinner');
    const other = lib.filter((d) => d.category === 'main')[5]!;
    expect(applyDish(slots, dinner, 0, other.id!, context(lib))[0]).not.toHaveProperty('carryOverId');
    expect(applyDish(slots, dinner, 0, main.id!, context(lib), 1)[0]).toMatchObject({ carryOverId: 1 });
  });
});

describe('queueFor', () => {
  const weeks: Week[] = [
    { id: 1, startDate: '2026-10-26', status: 'approved', createdAt: NOW },
    { id: 2, startDate: '2026-11-02', status: 'draft', createdAt: NOW },
  ];

  it('returns pending carry-overs from earlier weeks, oldest first', () => {
    const queue = queueFor(
      [
        carry(1, 10, { createdAt: '2026-10-29T00:00:00.000Z' }),
        carry(2, 11, { createdAt: '2026-10-27T00:00:00.000Z' }),
        carry(3, 12, { status: 'cancelled' }),
        carry(4, 13, { status: 'placed', placedWeekId: 2 }),
        carry(5, 14, { fromWeekId: 2 }), // skipped in the target week itself
      ],
      weeks,
      weeks[1]!,
    );
    expect(queue.map((c) => c.id)).toEqual([2, 1]);
    expect(toCarried(queue)).toEqual([
      { carryOverId: 2, dishId: 11 },
      { carryOverId: 1, dishId: 10 },
    ]);
  });
});

describe('placementPatches', () => {
  it('marks referenced carry-overs as placed and releases dropped ones', () => {
    const slots = [{ items: [{ role: 'main' as const, dishId: 10, carryOverId: 1 }] }];
    const patches = placementPatches(
      [
        carry(1, 10),
        carry(2, 11, { status: 'placed', placedWeekId: 7 }),
        carry(3, 12, { status: 'placed', placedWeekId: 8 }), // another week: untouched
        carry(4, 13, { status: 'placed', placedWeekId: 7 }),
      ],
      7,
      [...slots, { items: [{ role: 'side', dishId: 13, carryOverId: 4 }] }],
    );
    expect(patches).toEqual([
      { id: 1, status: 'placed', placedWeekId: 7 },
      { id: 2, status: 'pending' },
    ]);
  });
});

describe('skips', () => {
  const slot: Slot = {
    id: 5,
    weekId: 1,
    date: '2026-11-04',
    meal: 'dinner',
    items: [
      { role: 'main', dishId: 10 },
      { role: 'side', dishId: 11 },
      { role: 'salad', dishId: null },
    ],
  };

  it('marks single dishes or the whole meal as skipped', () => {
    const one = skipItems(slot.items, [1], { reason: 'ate_out' }, NOW);
    expect(one.map((i) => !!i.skipped)).toEqual([false, true, false]);

    const all = skipItems(slot.items, [0, 1, 2], { reason: 'other', comment: '  гости  ' }, NOW);
    expect(all[0]!.skipped).toEqual({ reason: 'other', comment: 'гости', at: NOW });
  });

  it('creates carry-overs only for skipped dishes, once', () => {
    const items = skipItems(slot.items, [0, 1, 2], { reason: 'leftovers' }, NOW);
    const skipped = { ...slot, items };
    const created = carryOversForSkip(skipped, [0, 1, 2], [], NOW);
    expect(created.map((c) => [c.dishId, c.role, c.status])).toEqual([
      [10, 'main', 'pending'],
      [11, 'side', 'pending'],
    ]);
    expect(carryOversForSkip(skipped, [0], [carry(1, 10, { fromSlotId: 5 })], NOW)).toEqual([]);
  });

  it('unskips one dish', () => {
    const items = unskipItem(skipItems(slot.items, [0, 1], { reason: 'leftovers' }, NOW), 0);
    expect(items[0]).not.toHaveProperty('skipped');
    expect(items[1]!.skipped).toBeDefined();
  });
});
