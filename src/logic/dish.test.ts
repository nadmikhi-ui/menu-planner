import { describe, expect, it } from 'vitest';
import type { Dish } from '../types';
import { draftToDish, emptyDraft, findDuplicate, matchesSearch, sortByName, validateDraft, type DishDraft } from './dish';

const now = new Date('2026-10-27T10:00:00.000Z');

const dish = (overrides: Partial<Dish>): Dish => ({
  id: 1,
  name: 'Плов',
  category: 'main',
  ingredients: ['рис', 'баранина'],
  note: '',
  standalone: true,
  addedAt: '2026-01-01T00:00:00.000Z',
  archived: false,
  ...overrides,
});

describe('validateDraft', () => {
  it('requires a name and a category', () => {
    expect(validateDraft(emptyDraft())).toEqual(['Введите название', 'Выберите раздел']);
    expect(validateDraft({ ...emptyDraft(), name: '  ', category: 'side' })).toEqual(['Введите название']);
    expect(validateDraft({ ...emptyDraft(), name: 'Гречка', category: 'side' })).toEqual([]);
  });
});

describe('draftToDish', () => {
  const draft: DishDraft = {
    name: '  Курица   терияки ',
    category: 'main',
    ingredients: ['Курица', ' соус терияки', 'курица', ''],
    note: '  20 минут в духовке  ',
    protein: 'poultry',
    standalone: false,
    prepType: 'soup',
    prepSource: 'fresh',
  };

  it('cleans text and normalizes ingredients', () => {
    expect(draftToDish(draft, undefined, now)).toEqual({
      name: 'Курица терияки',
      category: 'main',
      ingredients: ['курица', 'соус терияки'],
      note: '20 минут в духовке',
      protein: 'poultry',
      standalone: false,
      addedAt: now.toISOString(),
      archived: false,
    });
  });

  it('drops main-only fields for other categories', () => {
    const result = draftToDish({ ...draft, category: 'side', standalone: true }, undefined, now);
    expect(result.standalone).toBe(false);
    expect(result).not.toHaveProperty('protein');
    expect(result).not.toHaveProperty('prepType');
  });

  it('keeps prep fields only for preps', () => {
    const result = draftToDish({ ...draft, category: 'prep' }, undefined, now);
    expect(result).toMatchObject({ prepType: 'soup', prepSource: 'fresh', standalone: false });
    expect(result).not.toHaveProperty('protein');
  });

  it('keeps id, addedAt and archive flag of an existing dish', () => {
    const existing = dish({ id: 7, archived: true });
    expect(draftToDish(draft, existing, now)).toMatchObject({ id: 7, addedAt: existing.addedAt, archived: true });
  });

  it('throws without a category', () => {
    expect(() => draftToDish({ ...draft, category: null }, undefined, now)).toThrow();
  });
});

describe('findDuplicate', () => {
  const dishes = [dish({ id: 1, name: 'Борщ' }), dish({ id: 2, name: 'Макароны по-флотски' })];

  it('ignores case and punctuation', () => {
    expect(findDuplicate('  борщ ', dishes)?.id).toBe(1);
    expect(findDuplicate('макароны по флотски', dishes)?.id).toBe(2);
    expect(findDuplicate('Щи', dishes)).toBeUndefined();
  });

  it('skips the dish being edited', () => {
    expect(findDuplicate('Борщ', dishes, 1)).toBeUndefined();
  });
});

describe('matchesSearch / sortByName', () => {
  it('finds by name or ingredient', () => {
    const d = dish({ name: 'Плов', ingredients: ['рис', 'чеснок'] });
    expect(matchesSearch(d, 'пло')).toBe(true);
    expect(matchesSearch(d, 'ЧЕС')).toBe(true);
    expect(matchesSearch(d, 'курица')).toBe(false);
    expect(matchesSearch(d, '')).toBe(true);
  });

  it('sorts by Russian alphabet', () => {
    const names = sortByName([dish({ name: 'Щи' }), dish({ name: 'Ёжики' }), dish({ name: 'Борщ' })]).map((d) => d.name);
    expect(names).toEqual(['Борщ', 'Ёжики', 'Щи']);
  });
});
