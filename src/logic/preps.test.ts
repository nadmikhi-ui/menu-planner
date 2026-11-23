import { describe, expect, it } from 'vitest';
import type { FreezerItem, PrepTask, Week } from '../types';
import { PLANNED_PREP_DAYS, availableSupplies, prepLinks, prepSuggestions, prepsForDish } from './preps';
import { makeDish } from './test-fixtures';

const kotlety = makeDish('main', 'Котлеты из индейки', { ingredients: ['фарш индейки', 'лук'] });
const tefteli = makeDish('main', 'Тефтели в томате', { ingredients: ['фарш индейки', 'томатный соус'] });
const syrniki = makeDish('breakfast', 'Сырники', { ingredients: ['творог', 'яйца'] });
const borsch = makeDish('lunch', 'Борщ', { ingredients: ['свекла', 'капуста'] });
const oldDish = makeDish('main', 'Котлеты старые', { archived: true });

const farsh = makeDish('prep', 'Фрикадельки из фарша', {
  forDishes: ['котлеты из индейки', 'Тефтели в томате', 'Котлеты старые', 'Нет такого блюда'],
  prepType: 'main',
});
const syrPrep = makeDish('prep', 'Сырники впрок', { ingredients: ['творог'], prepType: 'other' });
const greens = makeDish('prep', 'Зелень', { ingredients: ['укроп'], prepType: 'greens' });
const dishes = [kotlety, tefteli, syrniki, borsch, oldDish, farsh, syrPrep, greens];

const week = (id: number, startDate: string): Week => ({ id, startDate, status: 'approved', createdAt: '' });
const freezerItem = (extra: Partial<FreezerItem>): FreezerItem => ({
  name: 'x',
  frozenAt: '2026-11-01',
  quantity: '',
  status: 'in_stock',
  updatedAt: '',
  ...extra,
});

describe('prepLinks', () => {
  it('links by dish names (case-insensitive), only active dishes', () => {
    expect([...prepLinks(dishes).get(farsh.id!)!]).toEqual([kotlety.id, tefteli.id]);
  });

  it('falls back to shared products when a prep has no links; preps with no dish are left out', () => {
    const links = prepLinks(dishes);
    expect([...links.get(syrPrep.id!)!]).toEqual([syrniki.id]);
    expect(links.has(greens.id!)).toBe(false);
  });
});

describe('availableSupplies', () => {
  const next = week(2, '2026-11-09');
  const weeks = [week(1, '2026-11-02'), next];

  it('takes preps in stock (by link or by name), oldest first', () => {
    const supplies = availableSupplies(
      next,
      dishes,
      [
        freezerItem({ dishId: farsh.id!, frozenAt: '2026-11-05' }),
        freezerItem({ name: 'сырники впрок', frozenAt: '2026-10-20' }),
        freezerItem({ dishId: farsh.id!, status: 'finished', frozenAt: '2026-09-01' }),
      ],
      [],
      weeks,
    );
    expect(supplies.map((s) => s.name)).toEqual(['Сырники впрок', 'Фрикадельки из фарша']);
    expect(prepsForDish(supplies, tefteli.id!)).toEqual(['Фрикадельки из фарша']);
  });

  it('counts prep tasks planned in a recent earlier week even if not ticked', () => {
    const tasks: PrepTask[] = [
      { id: 1, weekId: 1, dishId: farsh.id!, done: false },
      { id: 2, weekId: 2, dishId: syrPrep.id!, done: false }, // this week: for the next ones
    ];
    expect(availableSupplies(next, dishes, [], tasks, weeks).map((s) => s.prepId)).toEqual([farsh.id]);
  });

  it(`forgets planned tasks after ${PLANNED_PREP_DAYS} days`, () => {
    const old = week(1, '2026-10-05');
    const tasks: PrepTask[] = [{ id: 1, weekId: 1, dishId: farsh.id!, done: false }];
    expect(availableSupplies(next, dishes, [], tasks, [old, next])).toEqual([]);
  });
});

describe('prepSuggestions', () => {
  it('suggests preps not yet available or planned, mains before others', () => {
    const suggestions = prepSuggestions(dishes, [], [], new Set());
    expect(suggestions.map((s) => s.prep.name)).toEqual(['Фрикадельки из фарша', 'Сырники впрок']);
    expect(suggestions[0]!.dishes.map((d) => d.name)).toEqual(['Котлеты из индейки', 'Тефтели в томате']);
  });

  it('leaves out preps planned this week or already in the freezer', () => {
    const supplies = availableSupplies(week(2, '2026-11-09'), dishes, [freezerItem({ dishId: farsh.id! })], [], []);
    const tasks: PrepTask[] = [{ id: 1, weekId: 2, dishId: syrPrep.id!, done: false }];
    expect(prepSuggestions(dishes, supplies, tasks, new Set())).toEqual([]);
  });
});
