import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MenuDB, getSettings } from './db';
import { setFreezerMaxAge, setRepeatPolicy, setWeekStartDay } from './settings';

let database: MenuDB;
let n = 0;

beforeEach(() => {
  database = new MenuDB(`test-settings-${n++}`);
});

afterEach(async () => {
  await database.delete();
});

describe('settings (SPEC §8)', () => {
  it('saves each setting without touching the others', async () => {
    await setWeekStartDay(6, database);
    await setRepeatPolicy('breakfast', 'relaxed', database);
    await setFreezerMaxAge(9, database);
    const settings = await getSettings(database);
    expect(settings).toMatchObject({ weekStartDay: 6, freezerMaxAgeMonths: 9 });
    expect(settings.repeatPolicy.breakfast).toBe('relaxed');
    expect(settings.repeatPolicy.main).toBe('strict');
    expect(settings.places).toHaveLength(3);
  });
});
