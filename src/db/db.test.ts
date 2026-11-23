import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
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
      addedAt: new Date().toISOString(),
      archived: false,
    }))!;
    await database.slots.add({
      weekId,
      date: '2026-11-02',
      meal: 'dinner',
      items: [{ role: 'main', dishId }],
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

describe('upgrade to v2: no sides, salads and snacks (SPEC §1)', () => {
  it('deletes those dishes and positions and keeps everything else', async () => {
    const name = 'test-upgrade-v2';
    const old = new Dexie(name);
    old.version(1).stores({
      dishes: '++id, name, category, addedAt',
      products: '++id, &name, placeId',
      sortRules: '++id, &keyword, category',
      weeks: '++id, startDate, status',
      slots: '++id, weekId, [weekId+date], date',
      prepTasks: '++id, weekId, dishId',
      carryOver: '++id, status, dishId, fromWeekId',
      freezer: '++id, status, frozenAt',
      shoppingItems: '++id, weekId, [weekId+productName]',
      settings: 'id',
    });
    await old.table('dishes').bulkAdd([
      { id: 1, name: 'Котлеты', category: 'main', ingredients: [], standalone: false, archived: false },
      { id: 2, name: 'Пюре', category: 'side', ingredients: [], standalone: false, archived: false },
      { id: 3, name: 'Винегрет', category: 'salad', ingredients: [], standalone: false, archived: false },
      { id: 4, name: 'Бутерброд', category: 'snack', ingredients: [], standalone: false, archived: false },
      { id: 5, name: 'Борщ', category: 'lunch', ingredients: [], standalone: false, archived: false },
    ]);
    await old.table('weeks').add({ id: 1, startDate: '2026-11-02', status: 'approved', createdAt: '' });
    await old.table('slots').bulkAdd([
      { id: 1, weekId: 1, date: '2026-11-02', meal: 'snack', items: [{ role: 'snack', dishId: 4 }] },
      { id: 2, weekId: 1, date: '2026-11-02', meal: 'dinner', items: [{ role: 'main', dishId: 1 }, { role: 'side', dishId: 2 }, { role: 'salad', dishId: 3 }] },
      { id: 3, weekId: 1, date: '2026-11-07', meal: 'lunch', items: [{ role: 'main', dishId: 1 }, { role: 'side', dishId: 2 }] },
      { id: 4, weekId: 1, date: '2026-11-08', meal: 'lunch', items: [{ role: 'lunch', dishId: 5 }] },
    ]);
    await old.table('carryOver').bulkAdd([
      { id: 1, dishId: 2, role: 'side', status: 'pending', fromWeekId: 1 },
      { id: 2, dishId: 1, role: 'main', status: 'pending', fromWeekId: 1 },
    ]);
    await old.table('sortRules').bulkAdd([
      { id: 1, keyword: 'пюре', category: 'side', createdAt: '' },
      { id: 2, keyword: 'плов', category: 'main', standalone: true, createdAt: '' },
    ]);
    await old.table('settings').add({ id: 'main', weekStartDay: 1, repeatPolicy: { main: 'strict', side: 'relaxed', snack: 'strict' } });
    old.close();

    database = new MenuDB(name);
    expect((await database.dishes.toArray()).map((d) => d.name)).toEqual(['Котлеты', 'Борщ']);
    expect(await database.dishes.get(1)).not.toHaveProperty('standalone');
    expect((await database.slots.toArray()).map((s) => [s.meal, s.items])).toEqual([
      ['dinner', [{ role: 'main', dishId: 1 }]],
      ['lunch', [{ role: 'main', dishId: 1 }]],
      ['lunch', [{ role: 'lunch', dishId: 5 }]],
    ]);
    expect((await database.carryOver.toArray()).map((c) => c.id)).toEqual([2]);
    expect(await database.sortRules.toArray()).toEqual([{ id: 2, keyword: 'плов', category: 'main', createdAt: '' }]);
    expect((await database.settings.get('main'))!.repeatPolicy).toEqual({ main: 'strict' });
    expect(await database.weeks.count()).toBe(1);
  });
});
