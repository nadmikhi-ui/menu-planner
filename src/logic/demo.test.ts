import { describe, expect, it } from 'vitest';
import { suggestCategory } from './autosort';
import { DEMO_DISHES } from './demo';
import { validateDraft } from './dish';
import { CATEGORIES } from '../types';

describe('demo library', () => {
  it('has enough dishes for a week in each section: 7 dinners, 7 breakfasts, 2 lunches', () => {
    const count = (category: string) => DEMO_DISHES.filter((d) => d.category === category).length;
    expect(count('main')).toBeGreaterThanOrEqual(7);
    expect(count('breakfast')).toBeGreaterThanOrEqual(7);
    expect(count('lunch')).toBeGreaterThanOrEqual(2);
    expect(CATEGORIES.every((c) => count(c) > 0)).toBe(true);
  });

  it('has valid dishes with unique names', () => {
    expect(DEMO_DISHES.flatMap(validateDraft)).toEqual([]);
    const names = DEMO_DISHES.map((d) => d.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('is sorted into the right section by the auto-sorter, so loading learns no rules', () => {
    for (const dish of DEMO_DISHES) {
      const suggestion = suggestCategory(dish.name, dish.ingredients, []);
      expect(suggestion?.category, dish.name).toBe(dish.category);
    }
  });
});
