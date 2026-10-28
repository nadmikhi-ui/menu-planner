import { describe, expect, it } from 'vitest';
import { REPEAT_CATEGORIES, parseFreezerMonths } from './settings';

describe('settings (SPEC §8)', () => {
  it('offers repeat rules for every category used in a week', () => {
    expect(REPEAT_CATEGORIES).toEqual(['main', 'side', 'salad', 'breakfast', 'snack', 'lunch']);
  });

  it('accepts a freezer storage period of 1–24 whole months', () => {
    expect(parseFreezerMonths(' 6 ')).toBe(6);
    expect(parseFreezerMonths('24')).toBe(24);
    for (const bad of ['0', '25', '2.5', '', 'шесть']) expect(() => parseFreezerMonths(bad)).toThrow('от 1 до 24');
  });
});
