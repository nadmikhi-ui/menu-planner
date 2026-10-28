import {
  addSalad,
  applyDish,
  assembleWeek,
  fillEmpty,
  rerollItem,
  setLunchVariant,
  type PickContext,
} from '../logic/assemble';
import { queueFor, toCarried } from '../logic/carryover';
import { historyContext, repeatSlots } from '../logic/history';
import type { Rng } from '../logic/random';
import { weekSkeleton, type LunchVariant, type SlotDraft } from '../logic/week';
import type { ISODate, Slot, SlotItem, Week, WeekStatus } from '../types';
import { syncCarryOvers } from './carryover';
import { db, type MenuDB } from './db';

/** Slots of a week in calendar and meal order. */
export async function weekSlots(weekId: number, database: MenuDB = db): Promise<Slot[]> {
  const slots = await database.slots.where('weekId').equals(weekId).toArray();
  return sortSlots(slots);
}

const MEAL_ORDER = { breakfast: 0, snack: 1, lunch: 2, dinner: 3 } as const;

export function sortSlots<T extends SlotDraft>(slots: T[]): T[] {
  return [...slots].sort((a, b) => a.date.localeCompare(b.date) || MEAL_ORDER[a.meal] - MEAL_ORDER[b.meal]);
}

/** Dishes plus what was cooked before this week. */
export async function pickContext(week: Week, rng: Rng = Math.random, database: MenuDB = db): Promise<PickContext> {
  const [dishes, weeks, slots] = await Promise.all([
    database.dishes.toArray(),
    database.weeks.toArray(),
    database.slots.toArray(),
  ]);
  return { dishes, rng, ...historyContext(weeks, slots, week) };
}

/** Creates an empty draft week starting on `startDate`. */
export async function createWeek(startDate: ISODate, database: MenuDB = db, now = new Date()): Promise<number> {
  return database.transaction('rw', database.weeks, database.slots, async () => {
    if (await database.weeks.where('startDate').equals(startDate).count()) {
      throw new Error('Неделя с этой даты уже есть');
    }
    const weekId = (await database.weeks.add({ startDate, status: 'draft', createdAt: now.toISOString() }))!;
    await database.slots.bulkAdd(weekSkeleton(startDate).map((s) => ({ ...s, weekId })));
    return weekId;
  });
}

async function getWeek(weekId: number, database: MenuDB): Promise<Week> {
  const week = await database.weeks.get(weekId);
  if (!week) throw new Error(`Week ${weekId} not found`);
  return week;
}

async function getDraft(weekId: number, database: MenuDB): Promise<Week> {
  const week = await getWeek(weekId, database);
  if (week.status !== 'draft') throw new Error('Менять можно только черновик');
  return week;
}

const TABLES = (database: MenuDB) => [database.weeks, database.slots, database.dishes, database.carryOver];

/** «Пересобрать всё» replaces every dish; «Заполнить только пустые» keeps the chosen ones. */
export type AssembleMode = 'all' | 'empty';

/**
 * «Собрать неделю автоматически». Dishes from the carry-over queue (with `all`, including ones
 * this draft held before) are placed first, into empty positions (SPEC §5).
 */
export async function assembleAndSave(
  weekId: number,
  rng: Rng = Math.random,
  database: MenuDB = db,
  mode: AssembleMode = 'all',
): Promise<void> {
  await database.transaction('rw', TABLES(database), async () => {
    const week = await getDraft(weekId, database);
    if (mode === 'all') {
      await database.slots.where('weekId').equals(weekId).delete();
      await syncCarryOvers(weekId, database);
    }

    const ctx = await pickContext(week, rng, database);
    const carried = toCarried(queueFor(await database.carryOver.toArray(), await database.weeks.toArray(), week));
    if (mode === 'all') {
      const slots = assembleWeek(week.startDate, ctx, carried);
      await database.slots.bulkAdd(slots.map((s) => ({ ...s, weekId })));
    } else {
      const slots = fillEmpty(await weekSlots(weekId, database), ctx, carried);
      await database.slots.bulkPut(slots);
    }
    await syncCarryOvers(weekId, database);
  });
}

type SlotEdit = (slots: Slot[], slotIndex: number, ctx: PickContext) => SlotItem[] | null;

/** Runs a pure slot edit inside a transaction. Returns false if the edit found nothing to change. */
async function editSlot(
  weekId: number,
  slotId: number,
  edit: SlotEdit,
  rng: Rng,
  database: MenuDB,
): Promise<boolean> {
  return database.transaction('rw', TABLES(database), async () => {
    const week = await getDraft(weekId, database);
    const slots = await weekSlots(weekId, database);
    const index = slots.findIndex((s) => s.id === slotId);
    if (index < 0) throw new Error(`Slot ${slotId} not found`);
    const items = edit(slots, index, await pickContext(week, rng, database));
    if (!items) return false;
    await database.slots.update(slotId, { items });
    await syncCarryOvers(weekId, database);
    return true;
  });
}

/** Manual choice from the list; `null` clears the position. */
export function chooseDish(
  weekId: number,
  slotId: number,
  itemIndex: number,
  dishId: number | null,
  rng: Rng = Math.random,
  database: MenuDB = db,
): Promise<boolean> {
  return editSlot(weekId, slotId, (slots, i, ctx) => applyDish(slots, i, itemIndex, dishId, ctx), rng, database);
}

/** Puts a dish from the carry-over queue into a position by hand. */
export async function chooseCarryOver(
  weekId: number,
  slotId: number,
  itemIndex: number,
  carryOverId: number,
  rng: Rng = Math.random,
  database: MenuDB = db,
): Promise<boolean> {
  const carryOver = await database.carryOver.get(carryOverId);
  if (!carryOver) throw new Error(`Carry-over ${carryOverId} not found`);
  return editSlot(
    weekId,
    slotId,
    (slots, i, ctx) => applyDish(slots, i, itemIndex, carryOver.dishId, ctx, carryOverId),
    rng,
    database,
  );
}

/** «Заменить на другое случайное». False if the category has no other dish. */
export function rerollDish(
  weekId: number,
  slotId: number,
  itemIndex: number,
  rng: Rng = Math.random,
  database: MenuDB = db,
): Promise<boolean> {
  return editSlot(weekId, slotId, (slots, i, ctx) => rerollItem(slots, i, itemIndex, ctx), rng, database);
}

export function changeLunchVariant(
  weekId: number,
  slotId: number,
  variant: LunchVariant,
  rng: Rng = Math.random,
  database: MenuDB = db,
): Promise<boolean> {
  return editSlot(weekId, slotId, (slots, i, ctx) => setLunchVariant(slots, i, variant, ctx), rng, database);
}

export function addLunchSalad(weekId: number, slotId: number, rng: Rng = Math.random, database: MenuDB = db) {
  return editSlot(weekId, slotId, (slots, i, ctx) => addSalad(slots, i, ctx), rng, database);
}

export function removeItem(weekId: number, slotId: number, itemIndex: number, database: MenuDB = db) {
  return editSlot(weekId, slotId, (slots, i) => slots[i]!.items.filter((_, j) => j !== itemIndex), Math.random, database);
}

/** Черновик → Утверждена → Завершена; an approved week can go back to draft. */
const TRANSITIONS: Record<WeekStatus, WeekStatus[]> = {
  draft: ['approved'],
  approved: ['draft', 'done'],
  done: [],
};

export async function setWeekStatus(
  weekId: number,
  status: WeekStatus,
  database: MenuDB = db,
  now = new Date(),
): Promise<void> {
  await database.transaction('rw', database.weeks, database.slots, async () => {
    const week = await getWeek(weekId, database);
    if (!TRANSITIONS[week.status].includes(status)) {
      throw new Error(`Cannot change week status from ${week.status} to ${status}`);
    }
    if (status === 'draft') {
      const slots = await database.slots.where('weekId').equals(weekId).toArray();
      if (slots.some((s) => s.items.some((i) => i.skipped))) {
        throw new Error('Сначала снимите отметки «Пропущено»');
      }
    }
    const patch: Partial<Week> = { status };
    if (status === 'approved') patch.approvedAt = now.toISOString();
    if (status === 'done') patch.completedAt = now.toISOString();
    await database.weeks.update(weekId, patch);
  });
}

/** Deletes a draft; carry-overs it held go back to the queue. */
export async function deleteDraft(weekId: number, database: MenuDB = db): Promise<void> {
  await database.transaction('rw', [database.weeks, database.slots, database.carryOver, database.prepTasks], async () => {
    await getDraft(weekId, database);
    await database.slots.where('weekId').equals(weekId).delete();
    await database.prepTasks.where('weekId').equals(weekId).delete();
    await syncCarryOvers(weekId, database);
    await database.weeks.delete(weekId);
  });
}

/**
 * «Повторить как черновик» (SPEC §8): a new draft starting on `startDate` with the same dishes
 * and prep tasks as `sourceId`. Only one draft at a time, as on the «Неделя» tab.
 */
export async function repeatAsDraft(sourceId: number, startDate: ISODate, database: MenuDB = db, now = new Date()): Promise<number> {
  return database.transaction('rw', [database.weeks, database.slots, database.dishes, database.prepTasks], async () => {
    const source = await getWeek(sourceId, database);
    if (await database.weeks.where('status').equals('draft').count()) {
      throw new Error('Черновик уже есть. Утвердите или удалите его, затем повторите.');
    }
    if (await database.weeks.where('startDate').equals(startDate).count()) {
      throw new Error('Неделя с этой даты уже есть');
    }
    const dishes = await database.dishes.toArray();
    const dishesById = new Map(dishes.map((d) => [d.id!, d]));
    const slots = repeatSlots(await database.slots.where('weekId').equals(source.id!).toArray(), startDate, dishesById);

    const weekId = (await database.weeks.add({ startDate, status: 'draft', createdAt: now.toISOString() }))!;
    await database.slots.bulkAdd(slots.map((s) => ({ ...s, weekId })));
    const prepDishIds = new Set(
      (await database.prepTasks.where('weekId').equals(source.id!).toArray())
        .map((t) => t.dishId)
        .filter((id) => dishesById.get(id)?.archived === false),
    );
    await database.prepTasks.bulkAdd([...prepDishIds].map((dishId) => ({ weekId, dishId, done: false })));
    return weekId;
  });
}
