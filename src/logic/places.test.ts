import { describe, expect, it } from 'vitest';
import { DEFAULT_PLACES } from '../db/seed';
import { addPlace, movePlace, removePlace, renamePlace } from './places';

const names = (places: { name: string }[]) => places.map((p) => p.name);

describe('shop places (SPEC §7)', () => {
  it('adds a place before «Другое»', () => {
    expect(names(addPlace(DEFAULT_PLACES, '  Пекарня ', 'p1'))).toEqual(['Рынок', 'Супермаркет', 'Пекарня', 'Другое']);
  });

  it('rejects empty and duplicate names', () => {
    expect(() => addPlace(DEFAULT_PLACES, ' ', 'p1')).toThrow('Введите название места');
    expect(() => addPlace(DEFAULT_PLACES, 'рынок', 'p1')).toThrow('Такое место уже есть');
    expect(() => renamePlace(DEFAULT_PLACES, 'market', 'Супермаркет')).toThrow('Такое место уже есть');
  });

  it('renames a place, allowing a change of case', () => {
    expect(names(renamePlace(DEFAULT_PLACES, 'market', 'РЫНОК'))).toEqual(['РЫНОК', 'Супермаркет', 'Другое']);
  });

  it('removes places except «Другое»', () => {
    expect(names(removePlace(DEFAULT_PLACES, 'market'))).toEqual(['Супермаркет', 'Другое']);
    expect(() => removePlace(DEFAULT_PLACES, 'other')).toThrow('Другое');
  });

  it('reorders places, keeping «Другое» last', () => {
    expect(names(movePlace(DEFAULT_PLACES, 'supermarket', -1))).toEqual(['Супермаркет', 'Рынок', 'Другое']);
    expect(movePlace(DEFAULT_PLACES, 'supermarket', 1)).toBe(DEFAULT_PLACES);
    expect(movePlace(DEFAULT_PLACES, 'market', -1)).toBe(DEFAULT_PLACES);
  });
});
