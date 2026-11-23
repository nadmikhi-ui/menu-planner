import { describe, expect, it } from 'vitest';
import type { SortRule } from '../types';
import { learnedRule, suggestCategory, suggestProtein, type CategorySuggestion } from './autosort';

const category = (name: string, ingredients: string[] = [], rules: SortRule[] = []) =>
  suggestCategory(name, ingredients, rules)?.category ?? null;

describe('suggestCategory — built-in dictionary (SPEC §2)', () => {
  it.each([
    ['Борщ', 'lunch'],
    ['Щи из свежей капусты', 'lunch'],
    ['Солянка сборная', 'lunch'],
    ['Уха', 'lunch'],
    ['Куриный бульон', 'lunch'],
    ['Крем-суп из тыквы', 'lunch'],
    ['Салат с курицей', 'main'],
    ['Овсяная каша', 'breakfast'],
    ['Омлет с ветчиной', 'breakfast'],
    ['Сырники', 'breakfast'],
    ['Яичница', 'breakfast'],
    ['Блины', 'breakfast'],
    ['Оладьи из кабачков', 'breakfast'],
    ['Гранола с йогуртом', 'breakfast'],
    ['Тост с авокадо', 'breakfast'],
    ['Творожная запеканка', 'breakfast'],
    ['Гречка', 'main'],
    ['Рис отварной', 'main'],
    ['Картофельное пюре', 'main'],
    ['Булгур', 'main'],
    ['Киноа', 'main'],
    ['Картофель по-деревенски', 'main'],
    ['Овощи на гриле', 'main'],
    ['Макароны', 'main'],
    ['Плов', 'main'],
    ['Лазанья', 'main'],
    ['Макароны по-флотски', 'main'],
    ['Свинина в духовке', 'main'],
    ['Говядина тушёная', 'main'],
    ['Курица терияки', 'main'],
    ['Индейка с овощами', 'main'],
    ['Запечённая рыба', 'main'],
    ['Лосось на пару', 'main'],
    ['Салат с тунцом', 'main'],
    ['Лосось на гриле', 'main'],
    ['Котлеты из фарша', 'main'],
    ['Курица с гречкой', 'main'],
    ['Заготовка для борща', 'prep'],
    ['Замороженные ягоды', 'prep'],
    ['Бутерброд с сыром', 'breakfast'],
    ['Йогурт с фруктами', 'breakfast'],
    ['Тёплый салат с курицей', 'main'],
    ['Гречка с грибами', 'main'],
    ['Зажарка для борща', 'prep'],
    ['Смородина для компота', 'prep'],
    ['Рубленая зелень', 'prep'],
  ])('%s → %s', (name, expected) => {
    expect(category(name)).toBe(expected);
  });

  it('puts плов/лазанья/макароны по-флотски/рагу/запеканка into mains', () => {
    for (const name of ['Плов', 'Лазанья', 'Макароны по-флотски', 'Овощное рагу', 'Картофельная запеканка']) {
      expect(suggestCategory(name, []), name).toMatchObject({ category: 'main' });
    }
    expect(suggestCategory('Курица терияки', [])).toMatchObject({ category: 'main' });
  });

  it('reports the matched keyword', () => {
    expect(suggestCategory('Крем-суп', [])).toMatchObject({ source: 'builtin', via: 'name', keyword: 'суп' });
  });

  it('falls back to ingredients when the name says nothing', () => {
    expect(suggestCategory('Бефстроганов по-домашнему', [])?.category).toBe('main');
    expect(suggestCategory('Фирменное блюдо', ['говядина', 'лук'])).toMatchObject({
      category: 'main',
      via: 'ingredients',
      keyword: 'говядин',
    });
    expect(category('Драники', ['картофель', 'яйцо'])).toBe('main');
  });

  it('prefers the name over ingredients', () => {
    expect(category('Овсянка «Цезарь»', ['курица'])).toBe('breakfast');
  });

  it('returns null when no rule matches', () => {
    expect(suggestCategory('Шакшука', [])).toBeNull();
    expect(suggestCategory('', [])).toBeNull();
    expect(suggestCategory('Нечто', ['яйцо', 'помидоры'])).toBeNull();
  });
});

describe('suggestCategory — user rules', () => {
  const rule = (keyword: string, cat: SortRule['category'], extra: Partial<SortRule> = {}): SortRule => ({
    keyword,
    category: cat,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...extra,
  });

  it('beat built-in rules', () => {
    const rules = [rule('блины с мясом', 'main')];
    expect(suggestCategory('Блины с мясом', [], rules)).toMatchObject({ category: 'main', source: 'user' });
    expect(category('Блины', [], rules)).toBe('breakfast');
  });

  it('apply to longer names containing the keyword', () => {
    const rules = [rule('шакшука', 'breakfast')];
    expect(category('Шакшука с фетой', [], rules)).toBe('breakfast');
  });

  it('prefer the most specific rule', () => {
    const rules = [rule('паста', 'lunch'), rule('паста с курицей', 'main', {})];
    expect(suggestCategory('Паста с курицей и брокколи', [], rules)).toMatchObject({
      category: 'main',
      keyword: 'паста с курицей',
    });
  });

  it('prefer the newest rule among equally specific ones', () => {
    const rules = [
      rule('кесадилья', 'breakfast', { createdAt: '2026-01-01T00:00:00.000Z' }),
      rule('кесадилья', 'main', { createdAt: '2026-05-01T00:00:00.000Z' }),
    ];
    expect(category('Кесадилья', [], rules)).toBe('main');
  });
});

describe('suggestProtein', () => {
  it.each([
    ['Курица терияки', [], 'poultry'],
    ['Котлеты', ['куриный фарш'], 'poultry'],
    ['Котлеты', ['фарш говяжий'], 'meat'],
    ['Лосось на пару', [], 'fish'],
    ['Свинина в духовке', [], 'meat'],
    ['Овощное рагу', ['кабачок'], null],
  ] as const)('%s %j → %s', (name, ingredients, expected) => {
    expect(suggestProtein(name, [...ingredients])).toBe(expected);
  });
});

describe('learnedRule', () => {
  const suggestion = (overrides: Partial<CategorySuggestion>): CategorySuggestion => ({
    category: 'breakfast',
    source: 'builtin',
    via: 'name',
    keyword: 'блин',
    ...overrides,
  });

  it('returns null when the suggestion was accepted', () => {
    expect(learnedRule('Блины', suggestion({}), { category: 'breakfast' })).toBeNull();
  });

  it('remembers a corrected category by the normalized name', () => {
    expect(learnedRule('Блины с мясом!', suggestion({}), { category: 'main' })).toEqual({
      keyword: 'блины с мясом',
      category: 'main',
    });
  });

  it('remembers a choice made without a suggestion', () => {
    expect(learnedRule('Шакшука', null, { category: 'breakfast' })).toEqual({
      keyword: 'шакшука',
      category: 'breakfast',
    });
  });

  it('ignores empty names', () => {
    expect(learnedRule('  !! ', null, { category: 'main' })).toBeNull();
  });
});
