import { describe, expect, it } from 'vitest';
import type { FreezerItem } from '../types';
import { freezerStock, formatAge, isOld, prepIdeas, prepTaskProblem, validateFreezerDraft } from './freezer';
import { makeDish } from './test-fixtures';

const item = (name: string, frozenAt: string, extra: Partial<FreezerItem> = {}): FreezerItem => ({
  name,
  frozenAt,
  quantity: '',
  status: 'in_stock',
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

describe('freezer stock (SPEC §6)', () => {
  it('lists items in stock, oldest first, with their age', () => {
    const stock = freezerStock(
      [
        item('Укроп', '2026-09-01'),
        item('Клубника', '2026-04-15'),
        item('Фарш', '2026-10-20', { status: 'finished' }),
        item('Брусника', '2025-08-01'),
      ],
      '2026-10-28',
      6,
    );
    expect(stock.map((s) => [s.item.name, s.months, s.old])).toEqual([
      ['Брусника', 14, true],
      ['Клубника', 6, true],
      ['Укроп', 1, false],
    ]);
  });

  it('highlights items from exactly N months ago, not a day earlier', () => {
    expect(isOld('2026-04-28', '2026-10-28', 6)).toBe(true);
    expect(isOld('2026-04-29', '2026-10-28', 6)).toBe(false);
    expect(isOld('2026-08-31', '2026-10-28', 2)).toBe(false);
    expect(isOld('2026-08-31', '2026-10-31', 2)).toBe(true);
  });

  it('formats the age in Russian', () => {
    expect(formatAge(0)).toBe('меньше месяца');
    expect(formatAge(5)).toBe('5 мес.');
    expect(formatAge(12)).toBe('1 год');
    expect(formatAge(14)).toBe('1 год 2 мес.');
    expect(formatAge(36)).toBe('3 года');
    expect(formatAge(61)).toBe('5 лет 1 мес.');
  });
});

describe('validateFreezerDraft', () => {
  it('needs a name and a date that is not in the future', () => {
    expect(validateFreezerDraft({ name: 'Фарш', frozenAt: '2026-10-28', quantity: '' }, '2026-10-28')).toEqual([]);
    expect(validateFreezerDraft({ name: ' ', frozenAt: '2026-10-29', quantity: '' }, '2026-10-28')).toEqual([
      'Введите название',
      'Дата заморозки не может быть в будущем',
    ]);
    expect(validateFreezerDraft({ name: 'Фарш', frozenAt: '', quantity: '' }, '2026-10-28')).toEqual([
      'Укажите дату заморозки',
    ]);
  });
});

describe('prep ideas', () => {
  const soup = makeDish('prep', 'Зажарка для борща', { prepType: 'soup' });
  const berries = makeDish('prep', 'Смородина', { prepType: 'berries' });
  const cherries = makeDish('prep', 'Вишня', { prepType: 'berries' });
  const noType = makeDish('prep', 'Пельмени');
  const archived = makeDish('prep', 'Старая идея', { archived: true, prepType: 'soup' });
  const notPrep = makeDish('main', 'Котлеты');

  it('groups active ideas by type in the fixed order, no type counts as «Другое»', () => {
    const groups = prepIdeas([soup, berries, cherries, noType, archived, notPrep]);
    expect(groups.map((g) => [g.type, g.dishes.map((d) => d.name)])).toEqual([
      ['berries', ['Вишня', 'Смородина']],
      ['soup', ['Зажарка для борща']],
      ['other', ['Пельмени']],
    ]);
  });

  it('allows each idea once per week and only prep dishes', () => {
    const tasks = [{ weekId: 1, dishId: soup.id!, done: false }];
    expect(prepTaskProblem(tasks, 1, soup)).toBe('Эта заготовка уже в плане недели');
    expect(prepTaskProblem(tasks, 2, soup)).toBeNull();
    expect(prepTaskProblem(tasks, 1, berries)).toBeNull();
    expect(prepTaskProblem(tasks, 1, notPrep)).toBe('Это не заготовка');
    expect(prepTaskProblem(tasks, 1, undefined)).toBe('Это не заготовка');
  });
});
