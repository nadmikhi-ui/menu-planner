import { describe, expect, it } from 'vitest';
import type { Slot, Week } from '../types';
import { historyContext, historyList, repeatSlots } from './history';
import { makeDish } from './test-fixtures';
import { weekSkeleton } from './week';

const week = (id: number, startDate: string, status: Week['status']): Week => ({
  id,
  startDate,
  status,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const slot = (weekId: number, date: string, dishId: number, skipped = false): Slot => ({
  weekId,
  date,
  meal: 'dinner',
  items: [{ role: 'main', dishId, ...(skipped ? { skipped: { reason: 'ate_out', at: '' } } : {}) }],
});

describe('historyContext', () => {
  const weeks = [
    week(1, '2026-10-19', 'done'),
    week(2, '2026-10-26', 'approved'),
    week(3, '2026-11-02', 'draft'), // current
    week(4, '2026-11-09', 'draft'),
  ];
  const slots = [
    slot(1, '2026-10-20', 10),
    slot(1, '2026-10-21', 11),
    slot(2, '2026-10-27', 11),
    slot(2, '2026-10-28', 12, true),
    slot(4, '2026-11-10', 13),
  ];

  it('takes last week from the latest approved/finished week before the current one', () => {
    const { lastWeek } = historyContext(weeks, slots, weeks[2]!);
    expect([...lastWeek]).toEqual([11]);
  });

  it('does not count skipped dishes as cooked (SPEC §5)', () => {
    const { lastWeek, lastUsed } = historyContext(weeks, slots, weeks[2]!);
    expect(lastWeek.has(12)).toBe(false);
    expect(lastUsed.has(12)).toBe(false);
  });

  it('records the latest date each dish was cooked', () => {
    const { lastUsed } = historyContext(weeks, slots, weeks[2]!);
    expect(lastUsed.get(10)).toBe('2026-10-20');
    expect(lastUsed.get(11)).toBe('2026-10-27');
    expect(lastUsed.has(13)).toBe(false); // future draft
  });

  it('has no last week when the previous cooked week is older than two weeks', () => {
    const { lastWeek, lastUsed } = historyContext([weeks[0]!], slots, { id: 9, startDate: '2026-11-16' });
    expect(lastWeek.size).toBe(0);
    expect(lastUsed.get(10)).toBe('2026-10-20');
  });

  it('ignores draft weeks', () => {
    const { lastWeek } = historyContext([week(2, '2026-10-26', 'draft')], slots, weeks[2]!);
    expect(lastWeek.size).toBe(0);
  });
});

describe('history (SPEC §8)', () => {
  it('lists weeks newest first', () => {
    const weeks = [week(1, '2026-10-19', 'done'), week(2, '2026-11-02', 'draft'), week(3, '2026-10-26', 'approved')];
    expect(historyList(weeks).map((w) => w.id)).toEqual([2, 3, 1]);
  });
});

describe('repeatSlots («Повторить как черновик»)', () => {
  const cutlets = makeDish('main', 'Котлеты');
  const mash = makeDish('side', 'Пюре');
  const old = makeDish('salad', 'Старый салат', { archived: true });
  const soup = makeDish('lunch', 'Щи');
  const dishesById = new Map([cutlets, mash, old, soup].map((d) => [d.id!, d]));

  // Source week starts on Monday 26 Oct: dinner on Monday, soup on Saturday.
  const source: Slot[] = weekSkeleton('2026-10-26').map((s, i) => ({ ...s, id: i + 1, weekId: 1 }));
  const mondayDinner = source.find((s) => s.date === '2026-10-26' && s.meal === 'dinner')!;
  mondayDinner.items = [
    { role: 'main', dishId: cutlets.id!, skipped: { reason: 'ate_out', at: '' }, carryOverId: 3 },
    { role: 'side', dishId: mash.id! },
    { role: 'salad', dishId: old.id! },
  ];
  source.find((s) => s.date === '2026-10-31' && s.meal === 'lunch')!.items = [{ role: 'lunch', dishId: soup.id! }];

  it('copies dishes to the same weekdays, without skip marks and carry-over links', () => {
    const slots = repeatSlots(source, '2026-11-09', dishesById);
    expect(slots).toHaveLength(source.length);
    expect(slots.find((s) => s.date === '2026-11-09' && s.meal === 'dinner')!.items).toEqual([
      { role: 'main', dishId: cutlets.id },
      { role: 'side', dishId: mash.id },
      { role: 'salad', dishId: null },
    ]);
    expect(slots.find((s) => s.date === '2026-11-14' && s.meal === 'lunch')!.items).toEqual([{ role: 'lunch', dishId: soup.id }]);
  });

  it('keeps weekend lunches on the weekend when the week starts on another day', () => {
    const slots = repeatSlots(source, '2026-11-12', dishesById); // Thursday
    expect(slots[0]!.date).toBe('2026-11-12');
    expect(slots.find((s) => s.date === '2026-11-14' && s.meal === 'lunch')!.items).toEqual([{ role: 'lunch', dishId: soup.id }]);
    expect(slots.find((s) => s.date === '2026-11-16' && s.meal === 'dinner')!.items[0]).toEqual({ role: 'main', dishId: cutlets.id });
  });

  it('leaves positions of deleted dishes empty', () => {
    const slots = repeatSlots(source, '2026-11-09', new Map([[soup.id!, soup]]));
    expect(slots.find((s) => s.date === '2026-11-09' && s.meal === 'dinner')!.items.every((i) => i.dishId === null)).toBe(true);
  });
});
