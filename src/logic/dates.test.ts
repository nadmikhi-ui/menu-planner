import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  defaultNewWeekStart,
  formatDate,
  formatDay,
  formatWeekRange,
  isWeekend,
  monthsBetween,
  upcomingWeekStart,
} from './dates';

describe('dates', () => {
  it('adds days across months', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-11-02', -7)).toBe('2026-10-26');
  });

  it('detects weekends', () => {
    expect(isWeekend('2026-11-07')).toBe(true); // Saturday
    expect(isWeekend('2026-11-08')).toBe(true); // Sunday
    expect(isWeekend('2026-11-06')).toBe(false); // Friday
  });

  it('finds the upcoming week start day', () => {
    // 2026-10-27 is a Tuesday.
    expect(upcomingWeekStart('2026-10-27', 1)).toBe('2026-11-02');
    expect(upcomingWeekStart('2026-10-27', 2)).toBe('2026-10-27');
    expect(upcomingWeekStart('2026-10-27', 0)).toBe('2026-11-01');
  });

  it('skips start dates that already have a week', () => {
    expect(defaultNewWeekStart('2026-10-27', 1, ['2026-11-02'])).toBe('2026-11-09');
    expect(defaultNewWeekStart('2026-10-27', 1, ['2026-10-26'])).toBe('2026-11-02');
  });

  it('formats days and ranges in Russian', () => {
    expect(formatDay('2026-11-02')).toBe('Пн, 2 ноября');
    expect(formatWeekRange('2026-11-02')).toBe('2–8 ноября');
    expect(formatWeekRange('2026-10-29')).toBe('29 октября – 4 ноября');
  });

  it('adds months, clamping to the end of the month', () => {
    expect(addMonths('2026-04-15', 6)).toBe('2026-10-15');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('counts whole months between dates', () => {
    expect(monthsBetween('2026-04-28', '2026-10-28')).toBe(6);
    expect(monthsBetween('2026-04-29', '2026-10-28')).toBe(5);
    expect(monthsBetween('2025-12-31', '2026-02-28')).toBe(2);
    expect(monthsBetween('2026-10-28', '2026-10-01')).toBe(0);
  });

  it('formats dates, adding the year only when it differs', () => {
    expect(formatDate('2026-05-12', '2026-10-28')).toBe('12 мая');
    expect(formatDate('2025-05-12', '2026-10-28')).toBe('12 мая 2025 г.');
  });
});
