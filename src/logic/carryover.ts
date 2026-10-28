// Skips and the carry-over queue (SPEC §5).
import type { CarryOver, CarryOverStatus, ISODateTime, SkipInfo, Slot, SlotItem, Week } from '../types';
import type { CarriedDish } from './assemble';

/** Pending carry-overs a week can take: skipped in weeks that started before it, oldest first. */
export function queueFor(carryOvers: CarryOver[], weeks: Week[], target: Pick<Week, 'startDate'>): CarryOver[] {
  const startById = new Map(weeks.map((w) => [w.id, w.startDate]));
  return carryOvers
    .filter((c) => c.status === 'pending' && (startById.get(c.fromWeekId) ?? '') < target.startDate)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function toCarried(queue: CarryOver[]): CarriedDish[] {
  return queue.map((c) => ({ carryOverId: c.id!, dishId: c.dishId }));
}

export interface PlacementPatch {
  id: number;
  status: CarryOverStatus;
  placedWeekId?: number;
}

/**
 * Keeps queue statuses in line with a week's slots: a carry-over referenced by an item
 * is «placed» in that week; one placed there earlier but no longer referenced
 * (replaced, reassembled, week deleted) goes back to «pending».
 */
export function placementPatches(carryOvers: CarryOver[], weekId: number, slots: Pick<Slot, 'items'>[]): PlacementPatch[] {
  const referenced = new Set(slots.flatMap((s) => s.items.map((i) => i.carryOverId)).filter((id) => id !== undefined));
  const patches: PlacementPatch[] = [];
  for (const c of carryOvers) {
    const placedHere = c.status === 'placed' && c.placedWeekId === weekId;
    if (referenced.has(c.id!) && !placedHere && c.status !== 'cancelled') {
      patches.push({ id: c.id!, status: 'placed', placedWeekId: weekId });
    } else if (!referenced.has(c.id!) && placedHere) {
      patches.push({ id: c.id!, status: 'pending' });
    }
  }
  return patches;
}

/** Marks the given items as skipped. Skipping an already skipped item updates its reason. */
export function skipItems(items: SlotItem[], indexes: number[], skip: Omit<SkipInfo, 'at'>, now: ISODateTime): SlotItem[] {
  return items.map((item, i) => {
    if (!indexes.includes(i)) return item;
    const skipped: SkipInfo = { reason: skip.reason, at: now };
    const comment = skip.comment?.trim();
    if (comment) skipped.comment = comment;
    return { ...item, skipped };
  });
}

export function unskipItem(items: SlotItem[], index: number): SlotItem[] {
  return items.map((item, i) => {
    if (i !== index) return item;
    const { skipped: _, ...rest } = item;
    return rest;
  });
}

/** Carry-overs for newly skipped dishes (empty positions have nothing to carry). */
export function carryOversForSkip(
  slot: Slot,
  indexes: number[],
  existing: CarryOver[],
  now: ISODateTime,
): CarryOver[] {
  return indexes.flatMap((i) => {
    const item = slot.items[i];
    if (!item || item.dishId === null || !item.skipped) return [];
    const already = existing.some((c) => c.fromSlotId === slot.id && c.role === item.role && c.status !== 'cancelled');
    if (already) return [];
    return [
      {
        dishId: item.dishId,
        role: item.role,
        fromWeekId: slot.weekId,
        fromSlotId: slot.id!,
        skipped: item.skipped,
        status: 'pending' as const,
        createdAt: now,
      },
    ];
  });
}
