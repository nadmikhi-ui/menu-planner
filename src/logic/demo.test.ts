import { describe, expect, it } from 'vitest';
import { suggestCategory } from './autosort';
import { DEMO_DISHES } from './demo';
import { validateDraft } from './dish';
import { CATEGORIES } from '../types';

describe('demo library', () => {
  it('has 6–8 dishes in each section', () => {
    for (const category of CATEGORIES.filter((c) => c !== 'prep')) {
      const count = DEMO_DISHES.filter((d) => d.category === category).length;
      expect(count, category).toBeGreaterThanOrEqual(6);
      expect(count, category).toBeLessThanOrEqual(8);
    }
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
      if (dish.category === 'main') expect(suggestion?.standalone, dish.name).toBe(dish.standalone);
    }
  });
});
