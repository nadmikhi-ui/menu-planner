import { afterEach, describe, expect, it } from 'vitest';
import { MenuDB, getSettings } from './db';
import { DEFAULT_STAPLES } from './seed';

let database: MenuDB;

afterEach(async () => {
  await database.delete();
});

describe('MenuDB', () => {
  it('creates default settings on first open', async () => {
    database = new MenuDB('test-settings');
    const settings = await getSettings(database);
    expect(settings.weekStartDay).toBe(1);
    expect(settings.freezerMaxAgeMonths).toBe(6);
    expect(settings.places.map((p) => p.name)).toEqual(['Рынок', 'Супермаркет', 'Другое']);
    expect(Object.values(settings.repeatPolicy).every((p) => p === 'strict')).toBe(true);
  });

  it('seeds staple products', async () => {
    database = new MenuDB('test-staples');
    const staples = await database.products.toArray();
    expect(staples.map((p) => p.name).sort()).toEqual([...DEFAULT_STAPLES].sort());
    expect(staples.every((p) => p.isStaple && p.placeId === 'other')).toBe(true);
  });

  it('stores a week with slots and finds them by week', async () => {
    database = new MenuDB('test-week');
    const weekId = (await database.weeks.add({
      startDate: '2026-11-02',
      status: 'draft',
      createdAt: new Date().toISOString(),
    }))!;
    const dishId = (await database.dishes.add({
      name: 'Плов',
      category: 'main',
      ingredients: ['рис', 'баранина', 'морковь'],
      note: '',
      protein: 'meat',
      standalone: true,
      addedAt: new Date().toISOString(),
      archived: false,
    }))!;
    await database.slots.add({
      weekId,
      date: '2026-11-02',
      meal: 'dinner',
      items: [
        { role: 'main', dishId },
        { role: 'salad', dishId: null },
      ],
    });

    const slots = await database.slots.where({ weekId, date: '2026-11-02' }).toArray();
    expect(slots).toHaveLength(1);
    expect(slots[0]?.items[0]?.dishId).toBe(dishId);
  });

  it('rejects duplicate product names', async () => {
    database = new MenuDB('test-unique');
    await expect(
      database.products.add({ name: 'соль', placeId: 'other', isStaple: false }),
    ).rejects.toThrow();
  });
});
