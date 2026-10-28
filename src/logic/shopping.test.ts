import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACES } from '../db/seed';
import type { CarryOver, Dish, Product, ShoppingItem, Slot, SlotItem } from '../types';
import { buildShoppingList, groupByPlace, shareText, shoppingWeeks, type ShoppingInput } from './shopping';
import { makeDish } from './test-fixtures';

const borscht = makeDish('lunch', 'Борщ', { ingredients: ['свекла', 'капуста', 'картофель', 'соль'] });
const cutlets = makeDish('main', 'Котлеты', { ingredients: ['фарш', 'лук', 'соль'] });
const mash = makeDish('side', 'Пюре', { ingredients: ['картофель', 'молоко'] });
const salad = makeDish('salad', 'Винегрет', { ingredients: ['Свёкла', 'картофель', 'огурцы соленые'] });
const prep = makeDish('prep', 'Зелень', { ingredients: ['укроп'] });
const dishes = [borscht, cutlets, mash, salad, prep];

let slotId = 1;
const slot = (items: SlotItem[]): Slot => ({ id: slotId++, weekId: 1, date: '2026-11-02', meal: 'dinner', items });
const item = (dish: Dish, extra: Partial<SlotItem> = {}): SlotItem => ({
  role: dish.category === 'prep' ? 'main' : (dish.category as SlotItem['role']),
  dishId: dish.id!,
  ...extra,
});

function input(extra: Partial<ShoppingInput> = {}): ShoppingInput {
  return {
    slots: [slot([item(cutlets), item(mash), item(salad)]), slot([item(borscht)]), slot([item(cutlets), item(mash)])],
    prepTasks: [],
    dishesById: new Map(dishes.map((d) => [d.id!, d])),
    products: [
      { name: 'соль', placeId: 'other', isStaple: true },
      { name: 'фарш', placeId: 'market', isStaple: false },
      { name: 'картофель', placeId: 'market', isStaple: false },
    ],
    items: [],
    carryOvers: [],
    ...extra,
  };
}

const names = (lines: { productName: string }[]) => lines.map((l) => l.productName);

describe('buildShoppingList (SPEC §7)', () => {
  it('lists every ingredient once, with the dishes that need it', () => {
    const { lines } = buildShoppingList(input());
    expect(names(lines)).toEqual(['фарш', 'лук', 'картофель', 'молоко', 'свекла', 'огурцы соленые', 'капуста']);
    const potato = lines.find((l) => l.productName === 'картофель')!;
    expect(potato.sources).toEqual([
      { dishId: mash.id, count: 2 },
      { dishId: salad.id, count: 1 },
      { dishId: borscht.id, count: 1 },
    ]);
    expect(potato.uses).toBe(4);
  });

  it('normalizes product names so «Свёкла» and «свекла» are one product', () => {
    const beet = buildShoppingList(input()).lines.find((l) => l.productName === 'свекла')!;
    expect(beet.sources.map((s) => s.dishId)).toEqual([salad.id, borscht.id]);
  });

  it('takes the place from the product dictionary, «Другое» for unknown products', () => {
    const { lines } = buildShoppingList(input());
    expect(lines.find((l) => l.productName === 'фарш')!.placeId).toBe('market');
    expect(lines.find((l) => l.productName === 'лук')!.placeId).toBe('other');
  });

  it('leaves staples out, listing them separately', () => {
    const list = buildShoppingList(input());
    expect(names(list.lines)).not.toContain('соль');
    expect(list.staples).toMatchObject([{ productName: 'соль', uses: 3 }]);
  });

  it('puts a staple added by hand into the list', () => {
    const items: ShoppingItem[] = [{ weekId: 1, productName: 'соль', bought: false, haveAtHome: false, manual: true }];
    const list = buildShoppingList(input({ items }));
    expect(list.lines.find((l) => l.productName === 'соль')).toMatchObject({ manual: true, uses: 3 });
    expect(list.staples).toEqual([]);
  });

  it('adds hand-added products no dish needs', () => {
    const items: ShoppingItem[] = [{ weekId: 1, productName: 'хлеб', bought: true, haveAtHome: false, manual: true }];
    expect(buildShoppingList(input({ items })).lines.at(-1)).toMatchObject({
      productName: 'хлеб',
      sources: [],
      uses: 0,
      manual: true,
      bought: true,
    });
  });

  it('applies the «куплено» and «уже есть дома» ticks', () => {
    const items: ShoppingItem[] = [{ weekId: 1, productName: 'лук', bought: false, haveAtHome: true, manual: false }];
    expect(buildShoppingList(input({ items })).lines.find((l) => l.productName === 'лук')).toMatchObject({
      haveAtHome: true,
      bought: false,
      manual: false,
    });
  });

  it('includes prep tasks of the week', () => {
    const list = buildShoppingList(input({ prepTasks: [{ weekId: 1, dishId: prep.id!, done: false }] }));
    expect(list.lines.find((l) => l.productName === 'укроп')!.sources).toEqual([{ dishId: prep.id, count: 1, prep: true }]);
  });

  it('keeps skipped dishes: their products are usually bought by then', () => {
    const slots = [slot([item(borscht, { skipped: { reason: 'ate_out', at: '2026-11-03T00:00:00Z' } })])];
    expect(names(buildShoppingList(input({ slots })).lines)).toContain('капуста');
  });

  it('skips non-existent dishes and empty positions', () => {
    const slots = [slot([{ role: 'main', dishId: null }, { role: 'side', dishId: 999 }, item(mash)])];
    expect(names(buildShoppingList(input({ slots })).lines)).toEqual(['картофель', 'молоко']);
  });
});

describe('carried-over dishes and «Продукты ещё есть?»', () => {
  const carry = (id: number, dishId: number, haveIngredients?: boolean): CarryOver => ({
    id,
    dishId,
    role: 'main',
    fromWeekId: 0,
    fromSlotId: 0,
    skipped: { reason: 'leftovers', at: '2026-11-01T00:00:00Z' },
    status: 'placed',
    placedWeekId: 1,
    createdAt: '2026-11-01T00:00:00Z',
    ...(haveIngredients === undefined ? {} : { haveIngredients }),
  });
  const slots = [slot([item(cutlets, { carryOverId: 7 }), item(mash, { carryOverId: 8 })]), slot([item(salad)])];

  it('leaves out the ingredients of carried dishes whose products are still at home', () => {
    const list = buildShoppingList(input({ slots, carryOvers: [carry(7, cutlets.id!, true), carry(8, mash.id!, false)] }));
    expect(names(list.lines)).toEqual(['картофель', 'молоко', 'свекла', 'огурцы соленые']);
    expect(list.coveredDishIds).toEqual([cutlets.id]);
  });

  it('still lists a product another dish of the week needs', () => {
    const list = buildShoppingList(input({ slots, carryOvers: [carry(8, mash.id!, true)] }));
    const potato = list.lines.find((l) => l.productName === 'картофель')!;
    expect(potato.sources).toEqual([{ dishId: salad.id, count: 1 }]);
    expect(names(list.lines)).not.toContain('молоко');
  });

  it('buys for carried dishes when the question is not answered or answered «Нет»', () => {
    const list = buildShoppingList(input({ slots, carryOvers: [carry(7, cutlets.id!), carry(8, mash.id!, false)] }));
    expect(names(list.lines)).toContain('фарш');
    expect(names(list.lines)).toContain('молоко');
    expect(list.coveredDishIds).toEqual([]);
  });
});

describe('groupByPlace', () => {
  const products: Product[] = [
    { name: 'соль', placeId: 'other', isStaple: true },
    { name: 'фарш', placeId: 'market', isStaple: false },
    { name: 'молоко', placeId: 'supermarket', isStaple: false },
    { name: 'лук', placeId: 'gone', isStaple: false },
    { name: 'картофель', placeId: 'market', isStaple: false },
  ];

  it('follows the order of places, sending deleted places to «Другое»', () => {
    const { lines } = buildShoppingList(input({ products }));
    const groups = groupByPlace(lines, DEFAULT_PLACES);
    expect(groups.map((g) => [g.place.name, names(g.lines)])).toEqual([
      ['Рынок', ['картофель', 'фарш']],
      ['Супермаркет', ['молоко']],
      ['Другое', ['капуста', 'лук', 'огурцы соленые', 'свекла']],
    ]);
  });

  it('moves bought and at-home products to the end of their group', () => {
    const items: ShoppingItem[] = [{ weekId: 1, productName: 'картофель', bought: true, haveAtHome: false, manual: false }];
    const groups = groupByPlace(buildShoppingList(input({ products, items })).lines, DEFAULT_PLACES);
    expect(names(groups[0]!.lines)).toEqual(['фарш', 'картофель']);
  });

  it('still shows «Другое» if it is missing from the places list', () => {
    const groups = groupByPlace(buildShoppingList(input({ products })).lines, [{ id: 'market', name: 'Рынок' }]);
    expect(groups.map((g) => g.place.name)).toEqual(['Рынок', 'Другое']);
  });
});

describe('shareText', () => {
  it('lists what is left to buy, grouped by place', () => {
    const items: ShoppingItem[] = [
      { weekId: 1, productName: 'фарш', bought: true, haveAtHome: false, manual: false },
      { weekId: 1, productName: 'лук', bought: false, haveAtHome: true, manual: false },
    ];
    const groups = groupByPlace(buildShoppingList(input({ items })).lines, DEFAULT_PLACES);
    expect(shareText('2026-11-02', groups)).toBe(
      [
        'Покупки на 2–8 ноября',
        'Рынок:\n— картофель',
        'Другое:\n— капуста\n— молоко\n— огурцы соленые\n— свекла',
      ].join('\n\n'),
    );
  });

  it('says so when everything is bought', () => {
    expect(shareText('2026-11-02', [])).toBe('Покупки на 2–8 ноября\n\nВсё куплено.');
  });
});

describe('shoppingWeeks', () => {
  it('keeps approved weeks only, earliest first', () => {
    const week = (id: number, startDate: string, status: 'draft' | 'approved' | 'done') => ({
      id,
      startDate,
      status,
      createdAt: '2026-10-01T00:00:00Z',
    });
    const weeks = [week(1, '2026-11-09', 'approved'), week(2, '2026-11-16', 'draft'), week(3, '2026-11-02', 'approved'), week(4, '2026-10-26', 'done')];
    expect(shoppingWeeks(weeks).map((w) => w.id)).toEqual([3, 1]);
  });
});
