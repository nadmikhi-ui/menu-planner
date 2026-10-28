import { describe, expect, it } from 'vitest';
import {
  addSalad,
  applyDish,
  assembleWeek,
  differentProtein,
  fillEmpty,
  pickDish,
  rerollItem,
  setLunchVariant,
  usageCounts,
} from './assemble';
import { historyContext } from './history';
import { seededRng } from './random';
import { analyzeWeek, placesText, warningText } from './repeats';
import { STRICT, context, fullLibrary, makeDish, makeDishes } from './test-fixtures';
import type { Dish, Slot, Week } from '../types';
import type { SlotDraft } from './week';

const START = '2026-11-02'; // Monday; Sat = 07, Sun = 08

const ids = (slots: SlotDraft[]) => slots.flatMap((s) => s.items.map((i) => i.dishId)).filter((id) => id !== null);
const itemsOf = (slots: SlotDraft[], meal: SlotDraft['meal']) =>
  slots.filter((s) => s.meal === meal).flatMap((s) => s.items);

describe('assembleWeek — structure (SPEC §3)', () => {
  const slots = assembleWeek(START, context(fullLibrary()));

  it('gives weekdays breakfast, snack and dinner, weekends breakfast, lunch and dinner', () => {
    const mealsOn = (date: string) => slots.filter((s) => s.date === date).map((s) => s.meal);
    expect(mealsOn('2026-11-02')).toEqual(['breakfast', 'snack', 'dinner']);
    expect(mealsOn('2026-11-06')).toEqual(['breakfast', 'snack', 'dinner']);
    expect(mealsOn('2026-11-07')).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(mealsOn('2026-11-08')).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(slots).toHaveLength(21);
  });

  it('fills dinner with main, side and salad', () => {
    for (const slot of slots.filter((s) => s.meal === 'dinner')) {
      expect(slot.items.map((i) => i.role)).toEqual(['main', 'side', 'salad']);
      expect(slot.items.every((i) => i.dishId !== null)).toBe(true);
    }
  });

  it('prefers a «Обед» dish for weekend lunch', () => {
    expect(itemsOf(slots, 'lunch').map((i) => i.role)).toEqual(['lunch', 'lunch']);
  });

  it('has no repeats and no warnings when the library is big enough', () => {
    const all = ids(slots);
    expect(new Set(all).size).toBe(all.length);
    expect(analyzeWeek(slots, fullLibrary(), new Set(), STRICT)).toMatchObject({ warningCount: 0, emptyCount: 0, shortages: [] });
  });

  it('is random but reproducible with the same seed', () => {
    const lib = fullLibrary();
    const a = assembleWeek(START, context(lib, { rng: seededRng(1) }));
    const b = assembleWeek(START, context(lib, { rng: seededRng(1) }));
    const c = assembleWeek(START, context(lib, { rng: seededRng(2) }));
    expect(ids(a)).toEqual(ids(b));
    expect(ids(a)).not.toEqual(ids(c));
  });
});

describe('assembleWeek — standalone mains and lunches', () => {
  it('skips the side for a standalone main but keeps the salad', () => {
    const lib = [
      ...makeDishes('main', 'Плов', 9, { standalone: true }),
      ...makeDishes('side', 'Гарнир', 9),
      ...makeDishes('salad', 'Салат', 9),
    ];
    const dinners = assembleWeek(START, context(lib)).filter((s) => s.meal === 'dinner');
    for (const d of dinners) expect(d.items.map((i) => i.role)).toEqual(['main', 'salad']);
  });

  it('uses main + side for lunch when there are no «Обед» dishes, without repeating dinners', () => {
    const lib = [...makeDishes('main', 'Основное', 9), ...makeDishes('side', 'Гарнир', 9), ...makeDishes('salad', 'Салат', 7)];
    const slots = assembleWeek(START, context(lib));
    const lunches = itemsOf(slots, 'lunch');
    expect(lunches.map((i) => i.role)).toEqual(['main', 'side', 'main', 'side']);

    const dinnerIds = new Set(itemsOf(slots, 'dinner').map((i) => i.dishId));
    for (const item of lunches) expect(dinnerIds.has(item.dishId)).toBe(false);
  });

  it('falls back to main + side when soups were all cooked last week', () => {
    const soups = makeDishes('lunch', 'Суп', 2);
    const lib = [...fullLibrary().filter((d) => d.category !== 'lunch'), ...soups];
    const slots = assembleWeek(START, context(lib, { lastWeek: new Set(soups.map((s) => s.id!)) }));
    expect(itemsOf(slots, 'lunch').some((i) => i.role === 'lunch')).toBe(false);
  });
});

describe('assembleWeek — repeat rules (SPEC §4)', () => {
  it('never takes last week’s dishes while fresh ones exist', () => {
    const lib = fullLibrary();
    const mains = lib.filter((d) => d.category === 'main');
    const lastWeek = new Set(mains.slice(0, 3).map((d) => d.id!)); // 9 fresh mains for 7 dinners
    const slots = assembleWeek(START, context(lib, { lastWeek }));
    for (const id of ids(slots)) expect(lastWeek.has(id)).toBe(false);
  });

  it('takes the longest-unused dishes when a category runs short, and flags it', () => {
    const sides = makeDishes('side', 'Гарнир', 4);
    const [s1, s2, s3, s4] = sides.map((d) => d.id!);
    const lib = [...fullLibrary().filter((d) => d.category !== 'side'), ...sides];
    const lastWeek = new Set([s1!, s2!]);
    const lastUsed = new Map([
      [s1!, '2026-10-30'],
      [s2!, '2026-10-27'],
    ]);
    const slots = assembleWeek(START, context(lib, { lastWeek, lastUsed }));
    const used = itemsOf(slots, 'dinner')
      .filter((i) => i.role === 'side')
      .map((i) => i.dishId);

    // Fresh s3, s4 first; then last week's s2 (older) before s1; then repeats.
    expect(used.slice(0, 7).sort()).toEqual([s1, s2, s2, s3, s3, s4, s4].sort());
    const analysis = analyzeWeek(slots, lib, lastWeek, STRICT);
    expect(analysis.shortages).toEqual(['side']);
    expect(analysis.warningCount).toBeGreaterThan(0);
  });

  it('shows no warnings for a relaxed category', () => {
    const lib = [...fullLibrary().filter((d) => d.category !== 'side'), ...makeDishes('side', 'Гарнир', 2)];
    const slots = assembleWeek(START, context(lib));
    const analysis = analyzeWeek(slots, lib, new Set(), { ...STRICT, side: 'relaxed' });
    expect(analysis).toMatchObject({ warningCount: 0, shortages: [] });
  });

  it('leaves positions empty when a category has no dishes', () => {
    const lib = fullLibrary().filter((d) => d.category !== 'snack');
    const slots = assembleWeek(START, context(lib));
    expect(itemsOf(slots, 'snack').every((i) => i.dishId === null)).toBe(true);
    expect(analyzeWeek(slots, lib, new Set(), STRICT)).toMatchObject({ emptyCount: 5, shortages: ['snack'] });
  });

  it('ignores archived dishes', () => {
    const archived = makeDish('snack', 'Старый перекус', { archived: true });
    expect(pickDish('snack', context([archived]), new Map())).toBeNull();
  });
});

describe('slot editing', () => {
  const lib = fullLibrary();
  const ctx = context(lib);
  const slots = assembleWeek(START, ctx);
  const dinner = slots.findIndex((s) => s.meal === 'dinner');

  it('rerollItem picks a different dish of the same category', () => {
    const before = slots[dinner]!.items[2]!.dishId; // salad
    const items = rerollItem(slots, dinner, 2, ctx)!;
    expect(items[2]!.dishId).not.toBe(before);
    expect(lib.find((d) => d.id === items[2]!.dishId)?.category).toBe('salad');
  });

  it('rerollItem prefers dishes not yet in the week', () => {
    const items = rerollItem(slots, dinner, 2, ctx)!;
    expect(usageCounts(slots).has(items[2]!.dishId!)).toBe(false);
  });

  it('rerollItem returns null when there is no other dish', () => {
    const solo = makeDish('snack', 'Единственный');
    const one = [{ date: START, meal: 'snack' as const, items: [{ role: 'snack' as const, dishId: solo.id! }] }];
    expect(rerollItem(one, 0, 0, context([solo]))).toBeNull();
  });

  it('applyDish drops the side for a standalone main and restores it for a regular one', () => {
    const plov = makeDish('main', 'Плов', { standalone: true });
    const c = context([...lib, plov]);
    const withPlov = applyDish(slots, dinner, 0, plov.id!, c);
    expect(withPlov.map((i) => i.role)).toEqual(['main', 'salad']);

    const edited = slots.map((s, i) => (i === dinner ? { ...s, items: withPlov } : s));
    const regular = lib.find((d) => d.category === 'main' && !usageCounts(slots).has(d.id!))!;
    const back = applyDish(edited, dinner, 0, regular.id!, c);
    expect(back.map((i) => i.role)).toEqual(['main', 'side', 'salad']);
    expect(back[1]!.dishId).not.toBeNull();
  });

  it('applyDish allows a manual repeat but analyzeWeek flags it', () => {
    const otherDinner = slots.findIndex((s, i) => s.meal === 'dinner' && i !== dinner);
    const repeated = slots[otherDinner]!.items[2]!.dishId!;
    const items = applyDish(slots, dinner, 2, repeated, ctx);
    const edited = slots.map((s, i) => (i === dinner ? { ...s, items } : s));
    const analysis = analyzeWeek(edited, lib, new Set(), STRICT);
    const at = (i: number) => ({ date: slots[i]!.date, meal: 'dinner' });
    expect(analysis.items[dinner]![2]).toEqual([{ kind: 'duplicate', others: [at(otherDinner)] }]);
    expect(analysis.items[otherDinner]![2]).toEqual([{ kind: 'duplicate', others: [at(dinner)] }]);
    expect(analysis.warningCount).toBe(2);
  });

  it('setLunchVariant switches between soup and main + side; addSalad adds the optional salad', () => {
    const lunch = slots.findIndex((s) => s.meal === 'lunch');
    const asMain = setLunchVariant(slots, lunch, 'main', ctx);
    expect(asMain.map((i) => i.role)).toEqual(['main', 'side']);
    expect(asMain.every((i) => i.dishId !== null)).toBe(true);

    const edited = slots.map((s, i) => (i === lunch ? { ...s, items: asMain } : s));
    expect(addSalad(edited, lunch, ctx).map((i) => i.role)).toEqual(['main', 'side', 'salad']);
    expect(setLunchVariant(edited, lunch, 'soup', ctx).map((i) => i.role)).toEqual(['lunch']);
  });
});

describe('analyzeWeek', () => {
  it('flags dishes cooked last week', () => {
    const soup = makeDish('lunch', 'Борщ');
    const slots: SlotDraft[] = [{ date: '2026-11-07', meal: 'lunch', items: [{ role: 'lunch', dishId: soup.id! }] }];
    const analysis = analyzeWeek(slots, [soup], new Set([soup.id!]), STRICT);
    expect(analysis.items[0]![0]).toEqual([{ kind: 'lastWeek' }]);
    expect(analysis.warningCount).toBe(1);
  });
});

describe('warning texts (SPEC §4)', () => {
  it('says where the repeat is', () => {
    expect(placesText([{ date: '2026-11-03', meal: 'dinner' }])).toBe('во вторник на ужин');
    expect(
      placesText([
        { date: '2026-11-02', meal: 'breakfast' },
        { date: '2026-11-04', meal: 'snack' },
        { date: '2026-11-07', meal: 'lunch' },
      ]),
    ).toBe('в понедельник на завтрак, в среду на перекус и в субботу на обед');
    expect(warningText({ kind: 'duplicate', others: [{ date: '2026-11-08', meal: 'dinner' }] })).toBe(
      'Уже есть в воскресенье на ужин',
    );
    expect(warningText({ kind: 'lastWeek' })).toBe('Было на прошлой неделе');
  });

  it('flags a weekend lunch that repeats a dinner, naming the dinner', () => {
    const lib = fullLibrary();
    const slots = assembleWeek(START, context(lib));
    const tuesdayDinner = slots.find((s) => s.date === '2026-11-03' && s.meal === 'dinner')!;
    const saturday = slots.findIndex((s) => s.date === '2026-11-07' && s.meal === 'lunch');
    const edited = slots.map((s, i) => (i === saturday ? { ...s, items: [{ ...tuesdayDinner.items[0]! }] } : s));
    const warning = analyzeWeek(edited, lib, new Set(), STRICT).items[saturday]![0]![0]!;
    expect(warningText(warning)).toBe('Уже есть во вторник на ужин');
  });
});

describe('protein alternation in dinners', () => {
  const sides = makeDishes('side', 'Гарнир', 8);
  const proteins = ['fish', 'meat', 'poultry'] as const;
  const mains = proteins.flatMap((protein) => makeDishes('main', protein, 4, { protein }));
  const dinnerProteins = (slots: SlotDraft[], lib: Dish[]) =>
    slots
      .filter((s) => s.meal === 'dinner')
      .map((s) => lib.find((d) => d.id === s.items[0]!.dishId)?.protein);

  it('never puts the same protein in two dinners in a row when there is a choice', () => {
    const lib = [...mains, ...sides, ...makeDishes('salad', 'Салат', 8)];
    for (let seed = 1; seed <= 30; seed++) {
      const p = dinnerProteins(assembleWeek(START, context(lib, { rng: seededRng(seed) })), lib);
      for (let i = 1; i < p.length; i++) expect(p[i], `seed ${seed}, dinner ${i}`).not.toBe(p[i - 1]);
    }
  });

  it('prefers freshness over alternation: with only fish left, fish follows fish', () => {
    const fish = makeDishes('main', 'Рыба', 7, { protein: 'fish' });
    const lib = [...fish, ...sides];
    const slots = assembleWeek(START, context(lib));
    expect(new Set(itemsOf(slots, 'dinner').filter((i) => i.role === 'main').map((i) => i.dishId)).size).toBe(7);
  });

  it('treats «Другое» and an unset protein as compatible with anything', () => {
    const fish = makeDish('main', 'Рыба', { protein: 'fish' });
    const other = makeDish('main', 'Фалафель', { protein: 'other' });
    const plain = makeDish('main', 'Без белка');
    const lib = [fish, other, plain];
    const slots: SlotDraft[] = [
      { date: '2026-11-02', meal: 'dinner', items: [{ role: 'main', dishId: fish.id! }] },
      { date: '2026-11-03', meal: 'dinner', items: [{ role: 'main', dishId: null }] },
    ];
    const prefer = differentProtein(slots, 1, context(lib));
    expect([fish, other, plain].map(prefer)).toEqual([false, true, true]);
  });

  it('rerolling a dinner main also avoids the neighbours’ protein', () => {
    const lib = [...mains, ...sides];
    const slots: SlotDraft[] = [
      { date: '2026-11-02', meal: 'dinner', items: [{ role: 'main', dishId: mains[0]!.id! }] }, // fish
      { date: '2026-11-03', meal: 'dinner', items: [{ role: 'main', dishId: mains[4]!.id! }] }, // meat
      { date: '2026-11-04', meal: 'dinner', items: [{ role: 'main', dishId: mains[8]!.id! }] }, // poultry
    ];
    for (let seed = 1; seed <= 20; seed++) {
      const items = rerollItem(slots, 1, 0, context(lib, { rng: seededRng(seed) }))!;
      expect(lib.find((d) => d.id === items[0]!.dishId)!.protein).toBe('meat');
    }
  });
});

describe('fillEmpty («Заполнить только пустые»)', () => {
  const lib = fullLibrary();

  it('keeps every chosen dish and fills only the empty positions', () => {
    const full = assembleWeek(START, context(lib));
    const partial: Slot[] = full.map((s, i) => ({
      ...s,
      id: i + 1,
      weekId: 1,
      items: s.items.map((item, j) => ((i + j) % 3 === 0 ? { ...item, dishId: null } : item)),
    }));
    const filled = fillEmpty(partial, context(lib, { rng: seededRng(9) }));

    expect(filled.map((s) => s.id)).toEqual(partial.map((s) => s.id));
    filled.forEach((slot, i) =>
      slot.items.forEach((item, j) => {
        const before = partial[i]!.items[j]!;
        if (before.dishId !== null) expect(item).toEqual(before);
        else expect(item.dishId).not.toBeNull();
      }),
    );
    expect(analyzeWeek(filled, lib, new Set(), STRICT).warningCount).toBe(0);
    expect(partial[0]!.items[0]!.dishId).toBeNull(); // the input is not changed
  });

  it('puts carried-over dishes into empty positions only', () => {
    const full = assembleWeek(START, context(lib));
    const mondayDinner = full.findIndex((s) => s.meal === 'dinner');
    full[mondayDinner]!.items[0]!.dishId = null;
    const carriedMain = lib.find((d) => d.category === 'main' && !d.standalone && !usageCounts(full).has(d.id!))!;
    const filled = fillEmpty(full, context(lib), [{ carryOverId: 5, dishId: carriedMain.id! }]);
    expect(filled[mondayDinner]!.items[0]).toEqual({ role: 'main', dishId: carriedMain.id, carryOverId: 5 });
  });
});

describe('2-week rule and skipped dishes (SPEC §4–5)', () => {
  it('may pick last week’s skipped dish but not the cooked ones', () => {
    const soups = makeDishes('lunch', 'Суп', 2);
    const week = (id: number, startDate: string): Week => ({ id, startDate, status: 'done', createdAt: '' });
    const lastSlots: Slot[] = [
      { id: 1, weekId: 1, date: '2026-10-31', meal: 'lunch', items: [{ role: 'lunch', dishId: soups[0]!.id! }] },
      {
        id: 2,
        weekId: 1,
        date: '2026-11-01',
        meal: 'lunch',
        items: [{ role: 'lunch', dishId: soups[1]!.id!, skipped: { reason: 'ate_out', at: '' } }],
      },
    ];
    const history = historyContext([week(1, '2026-10-26')], lastSlots, { startDate: START });
    const slots = assembleWeek(START, context(soups, history));
    const saturday = slots.find((s) => s.date === '2026-11-07' && s.meal === 'lunch')!;
    expect(saturday.items[0]!.dishId).toBe(soups[1]!.id);
    expect(analyzeWeek(slots, soups, history.lastWeek, STRICT).items[slots.indexOf(saturday)]![0]).toEqual([]);
  });
});
