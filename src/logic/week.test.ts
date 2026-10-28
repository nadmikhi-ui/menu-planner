import { describe, expect, it } from 'vitest';
import type { Week } from '../types';
import { defaultWeek, lunchVariant, weekSkeleton } from './week';

const w = (startDate: string, status: Week['status']) => ({ startDate, status });

describe('defaultWeek', () => {
  it('prefers the approved week running today', () => {
    const weeks = [w('2026-11-02', 'draft'), w('2026-10-26', 'approved')];
    expect(defaultWeek(weeks, '2026-10-28')).toBe(weeks[1]);
  });

  it('otherwise shows the earliest draft', () => {
    const weeks = [w('2026-11-09', 'draft'), w('2026-11-02', 'draft'), w('2026-10-19', 'approved')];
    expect(defaultWeek(weeks, '2026-10-28')).toBe(weeks[1]);
  });

  it('ignores finished weeks', () => {
    expect(defaultWeek([w('2026-10-26', 'done')], '2026-10-28')).toBeUndefined();
  });
});

describe('weekSkeleton', () => {
  it('starts weekend lunches as the soup variant', () => {
    const lunch = weekSkeleton('2026-11-02').find((s) => s.meal === 'lunch')!;
    expect(lunchVariant(lunch.items)).toBe('soup');
  });
});
