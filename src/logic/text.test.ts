import { describe, expect, it } from 'vitest';
import { cleanName, containsKeyword, normalizeText, parseIngredients, splitWords } from './text';

describe('normalizeText', () => {
  it('lower-cases, replaces ё and punctuation', () => {
    expect(normalizeText('  Крем-суп «Тыквенный»!  ')).toBe('крем суп тыквенный');
    expect(normalizeText('Ёжики')).toBe('ежики');
  });
});

describe('containsKeyword', () => {
  const words = splitWords('Курица с рисом и макароны по-флотски');

  it('matches a word prefix', () => {
    expect(containsKeyword(words, 'рис')).toBe(true);
    expect(containsKeyword(words, 'куриц')).toBe(true);
  });

  it('matches multi-word keywords as consecutive words', () => {
    expect(containsKeyword(words, 'макарон по флотск')).toBe(true);
    expect(containsKeyword(words, 'макароны по-флотски')).toBe(true);
    expect(containsKeyword(words, 'курица макароны')).toBe(false);
  });

  it('does not match inside a word', () => {
    expect(containsKeyword(splitWords('Ирис'), 'рис')).toBe(false);
  });

  it('requires a whole word for 1–2 letter keywords', () => {
    expect(containsKeyword(splitWords('Щи из квашеной капусты'), 'щи')).toBe(true);
    expect(containsKeyword(splitWords('Щавель'), 'щи')).toBe(false);
    expect(containsKeyword(splitWords('Щипцы'), 'щи')).toBe(false);
  });

  it('matches across hyphens', () => {
    expect(containsKeyword(splitWords('Крем-суп'), 'суп')).toBe(true);
  });
});

describe('parseIngredients', () => {
  it('splits by commas, semicolons and new lines, normalizes and dedupes', () => {
    expect(parseIngredients('Курица,  рис; Морковь\nрис, , Чёрный перец')).toEqual([
      'курица',
      'рис',
      'морковь',
      'черный перец',
    ]);
  });
});

describe('cleanName', () => {
  it('trims and collapses spaces but keeps case', () => {
    expect(cleanName('  Борщ   Украинский ')).toBe('Борщ Украинский');
  });
});
