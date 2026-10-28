// Calendar-day helpers. Dates are local `YYYY-MM-DD` strings, never UTC timestamps.
import type { ISODate, Weekday } from '../types';

export function parseISODate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y!, m! - 1, day!);
}

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today(): ISODate {
  return toISODate(new Date());
}

export function addDays(d: ISODate, n: number): ISODate {
  const date = parseISODate(d);
  date.setDate(date.getDate() + n);
  return toISODate(date);
}

export function weekdayOf(d: ISODate): Weekday {
  return parseISODate(d).getDay() as Weekday;
}

/** Saturday and Sunday, regardless of which day the menu week starts on. */
export function isWeekend(d: ISODate): boolean {
  const w = weekdayOf(d);
  return w === 0 || w === 6;
}

/** The nearest `weekStartDay` on or after `from`. */
export function upcomingWeekStart(from: ISODate, weekStartDay: Weekday): ISODate {
  return addDays(from, (weekStartDay - weekdayOf(from) + 7) % 7);
}

/** Default start for a new week: the upcoming start day, skipping dates that already have a week. */
export function defaultNewWeekStart(from: ISODate, weekStartDay: Weekday, existingStarts: ISODate[]): ISODate {
  let start = upcomingWeekStart(from, weekStartDay);
  while (existingStarts.includes(start)) start = addDays(start, 7);
  return start;
}

const dayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
const dayMonthFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Пн, 2 ноября» */
export function formatDay(d: ISODate): string {
  return capitalize(dayFormat.format(parseISODate(d)));
}

/** «2–8 ноября» or «28 октября – 3 ноября» for the 7 days starting at `start`. */
export function formatWeekRange(start: ISODate): string {
  const from = parseISODate(start);
  const to = parseISODate(addDays(start, 6));
  if (from.getMonth() === to.getMonth()) {
    return `${from.getDate()}–${dayMonthFormat.format(to)}`;
  }
  return `${dayMonthFormat.format(from)} – ${dayMonthFormat.format(to)}`;
}

/** Same day `n` months later; clamps to the month's last day (31 Mar − 1 month → 28/29 Feb). */
export function addMonths(d: ISODate, n: number): ISODate {
  const date = parseISODate(d);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + n);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toISODate(date);
}

/** Whole months from `from` to `to` (0 if `to` is earlier). */
export function monthsBetween(from: ISODate, to: ISODate): number {
  const a = parseISODate(from);
  const b = parseISODate(to);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (addMonths(from, months) > to) months--;
  return Math.max(0, months);
}

const fullDateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

/** «12 мая», or «12 мая 2025 г.» when the year differs from `reference`'s. */
export function formatDate(d: ISODate, reference: ISODate = today()): string {
  const date = parseISODate(d);
  return d.slice(0, 4) === reference.slice(0, 4) ? dayMonthFormat.format(date) : fullDateFormat.format(date);
}
