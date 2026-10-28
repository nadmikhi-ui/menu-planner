import { toISODate } from '../logic/dates';
import { prepTaskProblem, validateFreezerDraft, type FreezerDraft } from '../logic/freezer';
import { cleanName } from '../logic/text';
import { db, type MenuDB } from './db';

function checkDraft(draft: FreezerDraft, now: Date): FreezerDraft {
  const errors = validateFreezerDraft(draft, toISODate(now));
  if (errors.length) throw new Error(errors.join('. '));
  return { name: cleanName(draft.name), frozenAt: draft.frozenAt, quantity: cleanName(draft.quantity) };
}

/** Adds a record to «Сейчас в морозилке» by hand. */
export async function addFreezerItem(draft: FreezerDraft, database: MenuDB = db, now = new Date()): Promise<number> {
  const clean = checkDraft(draft, now);
  return (await database.freezer.add({ ...clean, status: 'in_stock', updatedAt: now.toISOString() }))!;
}

export async function updateFreezerItem(id: number, draft: FreezerDraft, database: MenuDB = db, now = new Date()) {
  await database.freezer.update(id, { ...checkDraft(draft, now), updatedAt: now.toISOString() });
}

/** «Использовала часть»: only the remaining quantity changes. */
export async function useFreezerPart(id: number, quantityLeft: string, database: MenuDB = db, now = new Date()) {
  await database.freezer.update(id, { quantity: cleanName(quantityLeft), updatedAt: now.toISOString() });
}

/** «Закончилось». The record stays in the database and can be returned. */
export async function finishFreezerItem(id: number, database: MenuDB = db, now = new Date()) {
  await database.freezer.update(id, { status: 'finished', finishedAt: now.toISOString(), updatedAt: now.toISOString() });
}

export async function restoreFreezerItem(id: number, database: MenuDB = db, now = new Date()) {
  await database.freezer.update(id, { status: 'in_stock', finishedAt: undefined, updatedAt: now.toISOString() });
}

/** «Заморозить на этой неделе»: adds a prep idea to a week that is not finished. */
export async function addPrepTask(weekId: number, dishId: number, database: MenuDB = db): Promise<number> {
  return database.transaction('rw', database.weeks, database.dishes, database.prepTasks, async () => {
    const week = await database.weeks.get(weekId);
    if (!week) throw new Error(`Week ${weekId} not found`);
    if (week.status === 'done') throw new Error('Неделя уже завершена');
    const tasks = await database.prepTasks.where('weekId').equals(weekId).toArray();
    const problem = prepTaskProblem(tasks, weekId, await database.dishes.get(dishId));
    if (problem) throw new Error(problem);
    return (await database.prepTasks.add({ weekId, dishId, done: false }))!;
  });
}

/** Removes a task that is not done yet. */
export async function removePrepTask(id: number, database: MenuDB = db) {
  await database.transaction('rw', database.prepTasks, async () => {
    const task = await database.prepTasks.get(id);
    if (task?.done) throw new Error('Сначала снимите отметку «Сделано»');
    await database.prepTasks.delete(id);
  });
}

/** «Сделано»: the prep goes to «Сейчас в морозилке» under the idea's name. */
export async function completePrepTask(
  id: number,
  details: { frozenAt: string; quantity: string },
  database: MenuDB = db,
  now = new Date(),
): Promise<number> {
  return database.transaction('rw', database.prepTasks, database.dishes, database.freezer, async () => {
    const task = await database.prepTasks.get(id);
    if (!task) throw new Error(`Prep task ${id} not found`);
    if (task.done) throw new Error('Уже отмечено «Сделано»');
    const dish = await database.dishes.get(task.dishId);
    const clean = checkDraft({ name: dish?.name ?? 'Заготовка', ...details }, now);
    const freezerItemId = (await database.freezer.add({
      ...clean,
      dishId: task.dishId,
      status: 'in_stock',
      updatedAt: now.toISOString(),
    }))!;
    await database.prepTasks.update(id, { done: true, doneAt: now.toISOString(), freezerItemId });
    return freezerItemId;
  });
}

/** Undoes «Сделано» and removes the freezer record it created. */
export async function undoPrepTask(id: number, database: MenuDB = db) {
  await database.transaction('rw', database.prepTasks, database.freezer, async () => {
    const task = await database.prepTasks.get(id);
    if (!task?.done) return;
    if (task.freezerItemId !== undefined) await database.freezer.delete(task.freezerItemId);
    await database.prepTasks.update(id, { done: false, doneAt: undefined, freezerItemId: undefined });
  });
}
