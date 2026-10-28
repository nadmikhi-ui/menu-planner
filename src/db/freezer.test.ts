import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildShoppingList } from '../logic/shopping';
import { MenuDB } from './db';
import { saveDish } from './dishes';
import {
  addFreezerItem,
  addPrepTask,
  completePrepTask,
  finishFreezerItem,
  removePrepTask,
  restoreFreezerItem,
  undoPrepTask,
  updateFreezerItem,
  useFreezerPart,
} from './freezer';
import { shoppingInput } from './shopping';
import { createWeek, deleteDraft, setWeekStatus } from './weeks';

let database: MenuDB;
let n = 0;
const NOW = new Date(2026, 9, 28, 12);

beforeEach(async () => {
  database = new MenuDB(`test-freezer-${n++}`);
});

afterEach(async () => {
  await database.delete();
});

const prepIdea = (name: string, ingredients: string[] = []) =>
  saveDish({ name, category: 'prep', ingredients, note: '', standalone: false, prepType: 'greens', prepSource: 'fresh' }, undefined, database);

describe('«Сейчас в морозилке» (SPEC §6)', () => {
  it('adds, edits, uses part of and finishes a record', async () => {
    const id = await addFreezerItem({ name: '  Фарш ', frozenAt: '2026-10-01', quantity: '3 пакета' }, database, NOW);
    expect(await database.freezer.get(id)).toMatchObject({ name: 'Фарш', quantity: '3 пакета', status: 'in_stock' });

    await useFreezerPart(id, '1 пакет', database, NOW);
    expect((await database.freezer.get(id))!.quantity).toBe('1 пакет');

    await updateFreezerItem(id, { name: 'Фарш говяжий', frozenAt: '2026-09-30', quantity: '1 пакет' }, database, NOW);
    expect(await database.freezer.get(id)).toMatchObject({ name: 'Фарш говяжий', frozenAt: '2026-09-30' });

    await finishFreezerItem(id, database, NOW);
    expect(await database.freezer.get(id)).toMatchObject({ status: 'finished', finishedAt: NOW.toISOString() });

    await restoreFreezerItem(id, database, NOW);
    const restored = (await database.freezer.get(id))!;
    expect(restored.status).toBe('in_stock');
    expect(restored.finishedAt).toBeUndefined();
  });

  it('rejects records without a name or frozen in the future', async () => {
    await expect(addFreezerItem({ name: '', frozenAt: '2026-10-01', quantity: '' }, database, NOW)).rejects.toThrow('Введите название');
    await expect(addFreezerItem({ name: 'Фарш', frozenAt: '2026-10-29', quantity: '' }, database, NOW)).rejects.toThrow('в будущем');
  });
});

describe('«Заморозить на этой неделе»', () => {
  it('adds a prep idea to the week once, and its ingredients go to the shopping list', async () => {
    const dill = await prepIdea('Укроп в масле', ['укроп', 'масло сливочное']);
    const weekId = await createWeek('2026-11-02', database);
    await addPrepTask(weekId, dill, database);
    await expect(addPrepTask(weekId, dill, database)).rejects.toThrow('уже в плане');

    await setWeekStatus(weekId, 'approved', database);
    const { lines } = buildShoppingList(await shoppingInput(weekId, database));
    expect(lines.map((l) => l.productName)).toEqual(['укроп', 'масло сливочное']);
    expect(lines[0]!.sources).toEqual([{ dishId: dill, count: 1, prep: true }]);
  });

  it('accepts only prep dishes and weeks that are not finished', async () => {
    const soup = await saveDish({ name: 'Щи', category: 'lunch', ingredients: [], note: '', standalone: false }, undefined, database);
    const dill = await prepIdea('Укроп');
    const weekId = await createWeek('2026-11-02', database);
    await expect(addPrepTask(weekId, soup, database)).rejects.toThrow('Это не заготовка');

    await setWeekStatus(weekId, 'approved', database);
    await setWeekStatus(weekId, 'done', database);
    await expect(addPrepTask(weekId, dill, database)).rejects.toThrow('завершена');
  });

  it('«Сделано» puts the prep into the freezer; undoing removes it again', async () => {
    const dill = await prepIdea('Укроп');
    const weekId = await createWeek('2026-11-02', database);
    const taskId = await addPrepTask(weekId, dill, database);

    const itemId = await completePrepTask(taskId, { frozenAt: '2026-10-28', quantity: '2 контейнера' }, database, NOW);
    expect(await database.freezer.get(itemId)).toMatchObject({
      name: 'Укроп',
      dishId: dill,
      frozenAt: '2026-10-28',
      quantity: '2 контейнера',
      status: 'in_stock',
    });
    expect(await database.prepTasks.get(taskId)).toMatchObject({ done: true, freezerItemId: itemId });
    await expect(completePrepTask(taskId, { frozenAt: '2026-10-28', quantity: '' }, database, NOW)).rejects.toThrow('Сделано');
    await expect(removePrepTask(taskId, database)).rejects.toThrow('Сделано');

    await undoPrepTask(taskId, database);
    expect(await database.freezer.get(itemId)).toBeUndefined();
    const task = (await database.prepTasks.get(taskId))!;
    expect(task.done).toBe(false);
    expect(task.freezerItemId).toBeUndefined();

    await removePrepTask(taskId, database);
    expect(await database.prepTasks.count()).toBe(0);
  });

  it('deleting a draft removes its prep tasks but keeps what was already frozen', async () => {
    const dill = await prepIdea('Укроп');
    const parsley = await prepIdea('Петрушка');
    const weekId = await createWeek('2026-11-02', database);
    const done = await addPrepTask(weekId, dill, database);
    await addPrepTask(weekId, parsley, database);
    await completePrepTask(done, { frozenAt: '2026-10-28', quantity: '' }, database, NOW);

    await deleteDraft(weekId, database);
    expect(await database.prepTasks.count()).toBe(0);
    expect((await database.freezer.toArray()).map((i) => i.name)).toEqual(['Укроп']);
  });
});
