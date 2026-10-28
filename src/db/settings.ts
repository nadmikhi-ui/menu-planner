import type { DishCategory, RepeatPolicy, Settings, Weekday } from '../types';
import { db, getSettings, type MenuDB } from './db';

async function updateSettings(patch: Partial<Omit<Settings, 'id'>>, database: MenuDB) {
  await database.transaction('rw', database.settings, async () => {
    await database.settings.put({ ...(await getSettings(database)), ...patch });
  });
}

/** Applies to weeks created from now on; existing weeks keep their dates. */
export function setWeekStartDay(day: Weekday, database: MenuDB = db) {
  return updateSettings({ weekStartDay: day }, database);
}

export async function setRepeatPolicy(category: DishCategory, policy: RepeatPolicy, database: MenuDB = db) {
  const { repeatPolicy } = await getSettings(database);
  await updateSettings({ repeatPolicy: { ...repeatPolicy, [category]: policy } }, database);
}

export function setFreezerMaxAge(months: number, database: MenuDB = db) {
  return updateSettings({ freezerMaxAgeMonths: months }, database);
}

/** Remembers that the data was just saved to a file. */
export function markExported(now = new Date(), database: MenuDB = db) {
  return updateSettings({ lastExportAt: now.toISOString() }, database);
}
