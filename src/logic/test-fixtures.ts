// Shared builders for logic tests.
import type { Dish, DishCategory, RepeatPolicy } from '../types';
import type { PickContext } from './assemble';
import { seededRng } from './random';

let nextId = 1;

export function makeDish(category: DishCategory, name: string, extra: Partial<Dish> = {}): Dish {
  return {
    id: nextId++,
    name,
    category,
    ingredients: [],
    note: '',
    standalone: false,
    addedAt: '2026-01-01T00:00:00.000Z',
    archived: false,
    ...extra,
  };
}

/** `count` dishes named «<prefix> 1…count». */
export function makeDishes(category: DishCategory, prefix: string, count: number, extra: Partial<Dish> = {}): Dish[] {
  return Array.from({ length: count }, (_, i) => makeDish(category, `${prefix} ${i + 1}`, extra));
}

/** Enough dishes to fill a week without any repeats. */
export function fullLibrary(): Dish[] {
  return [
    ...makeDishes('main', 'Основное', 12),
    ...makeDishes('side', 'Гарнир', 12),
    ...makeDishes('salad', 'Салат', 10),
    ...makeDishes('breakfast', 'Завтрак', 10),
    ...makeDishes('snack', 'Перекус', 8),
    ...makeDishes('lunch', 'Суп', 4),
  ];
}

export function context(dishes: Dish[], extra: Partial<PickContext> = {}): PickContext {
  return { dishes, lastWeek: new Set(), lastUsed: new Map(), rng: seededRng(42), ...extra };
}

export const STRICT: Record<DishCategory, RepeatPolicy> = {
  main: 'strict',
  side: 'strict',
  salad: 'strict',
  breakfast: 'strict',
  snack: 'strict',
  lunch: 'strict',
  prep: 'strict',
};
