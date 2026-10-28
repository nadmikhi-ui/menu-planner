import { carryOversForSkip, placementPatches, skipItems, unskipItem } from '../logic/carryover';
import type { SkipInfo, Week } from '../types';
import { db, type MenuDB } from './db';

/** Re-derives which carry-overs are placed in `weekId` from its slots. Call inside a transaction. */
export async function syncCarryOvers(weekId: number, database: MenuDB = db): Promise<void> {
  const [carryOvers, slots] = await Promise.all([
    database.carryOver.toArray(),
    database.slots.where('weekId').equals(weekId).toArray(),
  ]);
  for (const patch of placementPatches(carryOvers, weekId, slots)) {
    await database.carryOver.update(patch.id, { status: patch.status, placedWeekId: patch.placedWeekId });
  }
}

async function getApprovedSlot(weekId: number, slotId: number, database: MenuDB) {
  const week: Week | undefined = await database.weeks.get(weekId);
  if (week?.status !== 'approved') throw new Error('Пропуски отмечаются в утверждённой неделе');
  const slot = await database.slots.get(slotId);
  if (!slot || slot.weekId !== weekId) throw new Error(`Slot ${slotId} not found`);
  return slot;
}

/**
 * «Пропущено» for some dishes of a meal (or all of them): the dishes go to the
 * carry-over queue and no longer count as cooked (SPEC §5).
 */
export async function skipDishes(
  weekId: number,
  slotId: number,
  itemIndexes: number[],
  skip: Omit<SkipInfo, 'at'>,
  database: MenuDB = db,
  now = new Date(),
): Promise<void> {
  await database.transaction('rw', database.weeks, database.slots, database.carryOver, async () => {
    const slot = await getApprovedSlot(weekId, slotId, database);
    const items = skipItems(slot.items, itemIndexes, skip, now.toISOString());
    await database.slots.update(slotId, { items });

    const existing = await database.carryOver.where('fromWeekId').equals(weekId).toArray();
    // Re-skipping updates the reason of carry-overs that already exist.
    for (const c of existing) {
      const item = items.find((i, idx) => itemIndexes.includes(idx) && i.role === c.role);
      if (c.fromSlotId === slotId && item?.skipped && c.status !== 'cancelled') {
        await database.carryOver.update(c.id!, { skipped: item.skipped });
      }
    }
    await database.carryOver.bulkAdd(carryOversForSkip({ ...slot, items }, itemIndexes, existing, now.toISOString()));
  });
}

/**
 * Removes the «Пропущено» mark. Its carry-over is deleted; if it was already placed
 * in a draft, the dish stays there as a regular choice.
 */
export async function unskipDish(weekId: number, slotId: number, itemIndex: number, database: MenuDB = db): Promise<void> {
  await database.transaction('rw', database.weeks, database.slots, database.carryOver, async () => {
    const slot = await getApprovedSlot(weekId, slotId, database);
    const role = slot.items[itemIndex]?.role;
    await database.slots.update(slotId, { items: unskipItem(slot.items, itemIndex) });

    const carryOvers = await database.carryOver.where('fromWeekId').equals(weekId).toArray();
    for (const c of carryOvers.filter((c) => c.fromSlotId === slotId && c.role === role)) {
      await detachFromWeek(c.id!, c.placedWeekId, database);
      await database.carryOver.delete(c.id!);
    }
  });
}

async function detachFromWeek(carryOverId: number, weekId: number | undefined, database: MenuDB) {
  if (weekId === undefined) return;
  await database.slots
    .where('weekId')
    .equals(weekId)
    .modify((slot) => {
      for (const item of slot.items) if (item.carryOverId === carryOverId) delete item.carryOverId;
    });
}

/** «Отменить перенос». A dish already placed in a draft stays there as a regular choice. */
export async function cancelCarryOver(id: number, database: MenuDB = db): Promise<void> {
  await database.transaction('rw', database.slots, database.carryOver, async () => {
    const c = await database.carryOver.get(id);
    if (!c) return;
    await detachFromWeek(id, c.placedWeekId, database);
    await database.carryOver.update(id, { status: 'cancelled', placedWeekId: undefined });
  });
}

/** «Продукты ещё есть?» — `true` keeps the dish's ingredients out of the next shopping list. */
export async function setHaveIngredients(id: number, value: boolean | undefined, database: MenuDB = db) {
  await database.carryOver.update(id, { haveIngredients: value });
}
