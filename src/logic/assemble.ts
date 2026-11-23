// Automatic week assembly and slot editing (SPEC §3–4, §6.1).
import type { Dish, DishCategory, ISODate, SlotItem } from '../types';
import { shuffle, type Rng } from './random';
import { ROLE_CATEGORY, emptyItems, weekSkeleton, type LunchVariant, type SlotDraft } from './week';

/** A prep available for this week (in the freezer or planned earlier) and the dishes it is for (SPEC §6.1). */
export interface PrepSupply {
  prepId: number;
  name: string;
  dishIds: ReadonlySet<number>;
}

export interface PickContext {
  /** All dishes; archived ones are ignored. */
  dishes: Dish[];
  /** Dishes cooked last week (SPEC §4, 2-week window). */
  lastWeek: Set<number>;
  /** Most recent date each dish was cooked. */
  lastUsed: Map<number, ISODate>;
  rng: Rng;
  /** Preps to use up first, oldest first. */
  supplies?: PrepSupply[];
}

export interface Pick {
  dish: Dish;
  /** False when the category ran out and a repeat had to be taken. */
  fresh: boolean;
}

/** How many dishes per week each available prep brings in (a prep is usually 2–3 portions or bags). */
export const DISHES_PER_PREP = 2;

/** How many times each dish occurs in the given slots. */
export function usageCounts(slots: SlotDraft[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const slot of slots) {
    for (const item of slot.items) {
      if (item.dishId !== null) counts.set(item.dishId, (counts.get(item.dishId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Picks a random dish of the category that is neither in this week nor cooked last week.
 * If there is none, takes the dish used least this week, then the one unused for the longest
 * time (never-used first) — and reports it as not fresh. `null` if the category is empty.
 * `prefer` is a soft wish (e.g. another protein than the neighbouring dinners): it only
 * chooses among equally good candidates and never makes the pick less fresh.
 */
export function pickDish(
  category: DishCategory,
  ctx: PickContext,
  used: Map<number, number>,
  exclude: ReadonlySet<number> = new Set(),
  filter: (dish: Dish) => boolean = () => true,
  prefer: (dish: Dish) => boolean = () => true,
): Pick | null {
  const candidates = ctx.dishes.filter(
    (d) => !d.archived && d.category === category && !exclude.has(d.id!) && filter(d),
  );
  if (candidates.length === 0) return null;
  const preferred = (list: Dish[]) => (list.some(prefer) ? list.filter(prefer) : list);

  const fresh = candidates.filter((d) => !used.has(d.id!) && !ctx.lastWeek.has(d.id!));
  if (fresh.length > 0) return { dish: shuffle(preferred(fresh), ctx.rng)[0]!, fresh: true };

  const usedCount = (d: Dish) => used.get(d.id!) ?? 0;
  const lastUsed = (d: Dish) => ctx.lastUsed.get(d.id!) ?? '';
  const rank = (a: Dish, b: Dish) => usedCount(a) - usedCount(b) || lastUsed(a).localeCompare(lastUsed(b));
  const sorted = shuffle(candidates, ctx.rng).sort(rank);
  const best = sorted.filter((d) => rank(d, sorted[0]!) === 0);
  return { dish: preferred(best)[0]!, fresh: false };
}

/** Proteins that should not follow each other in consecutive dinners («не две рыбы подряд»). */
const ALTERNATING: ReadonlySet<string> = new Set(['meat', 'poultry', 'fish']);

const byId = (ctx: PickContext, id: number | null) => (id === null ? undefined : ctx.dishes.find((d) => d.id === id));

/**
 * Soft wish for a dinner main: a protein different from the main of the previous and the next
 * dinner (when already chosen). «Другое» and unset proteins never clash.
 */
export function differentProtein(slots: SlotDraft[], slotIndex: number, ctx: PickContext): (dish: Dish) => boolean {
  const dinners = slots.map((s, i) => ({ s, i })).filter(({ s }) => s.meal === 'dinner');
  const at = dinners.findIndex(({ i }) => i === slotIndex);
  if (at < 0) return () => true;
  const neighbours = [dinners[at - 1], dinners[at + 1]]
    .map((n) => byId(ctx, n?.s.items.find((it) => it.role === 'main')?.dishId ?? null)?.protein)
    .filter((p): p is NonNullable<Dish['protein']> => p !== undefined && ALTERNATING.has(p));
  return (dish) => dish.protein === undefined || !neighbours.includes(dish.protein);
}

function take(
  category: DishCategory,
  ctx: PickContext,
  used: Map<number, number>,
  prefer?: (dish: Dish) => boolean,
): number | null {
  const pick = pickDish(category, ctx, used, undefined, undefined, prefer);
  if (!pick) return null;
  const id = pick.dish.id!;
  used.set(id, (used.get(id) ?? 0) + 1);
  return id;
}

/** Prefers a fresh «Обед» dish, then a fresh main, then whatever is least repeated. */
function weekendLunch(ctx: PickContext, used: Map<number, number>): SlotItem[] {
  const soup = pickDish('lunch', ctx, used);
  if (soup?.fresh || (soup && !pickDish('main', ctx, used)?.fresh)) {
    return [{ role: 'lunch', dishId: take('lunch', ctx, used) }];
  }
  return pickDish('main', ctx, used) ? [{ role: 'main', dishId: take('main', ctx, used) }] : emptyItems('lunch');
}

/** A dish from the carry-over queue (SPEC §5). */
export interface CarriedDish {
  carryOverId: number;
  dishId: number;
}

/** Empty position for a dish of the category: dinner main, weekend lunch (either variant), breakfast. */
function emptyPositions(slots: SlotDraft[], category: DishCategory): { slot: SlotDraft; index: number }[] {
  const result: { slot: SlotDraft; index: number }[] = [];
  slots.forEach((slot, index) => {
    const only = slot.items.length === 1 ? slot.items[0]! : undefined;
    if (!only || only.dishId !== null) return;
    const fits =
      (category === 'main' && (slot.meal === 'dinner' || slot.meal === 'lunch')) ||
      (category === 'lunch' && slot.meal === 'lunch') ||
      (category === 'breakfast' && slot.meal === 'breakfast');
    if (fits) result.push({ slot, index });
  });
  return result;
}

function put(slot: SlotDraft, category: DishCategory, dishId: number, carryOverId?: number) {
  const role = category === 'main' ? 'main' : category === 'lunch' ? 'lunch' : 'breakfast';
  slot.items = [{ role, dishId, ...(carryOverId !== undefined ? { carryOverId } : {}) }];
}

/**
 * Puts carried-over dishes into the earliest suitable empty positions of the skeleton:
 * a main goes to a dinner (or, if all dinners are taken, a weekend lunch). Dishes that don't fit are left out.
 */
export function placeCarried(slots: SlotDraft[], carried: CarriedDish[], ctx: PickContext): void {
  for (const { carryOverId, dishId } of carried) {
    const dish = byId(ctx, dishId);
    if (!dish || dish.category === 'prep') continue;
    const positions = emptyPositions(slots, dish.category);
    const target = positions.find((p) => p.slot.meal === 'dinner') ?? positions[0];
    if (target) put(target.slot, dish.category, dishId, carryOverId);
  }
}

/**
 * SPEC §6.1: dishes that use an available prep go in before the random fill — up to
 * `DISHES_PER_PREP` per prep, fresh dishes only (not this week, not cooked last week).
 * Positions are spread over the week; a dinner keeps proteins alternating when it can.
 */
export function placeFromPreps(slots: SlotDraft[], ctx: PickContext, used: Map<number, number>): void {
  for (const supply of ctx.supplies ?? []) {
    let placed = [...supply.dishIds].filter((id) => used.has(id)).length;
    const candidates = shuffle(
      ctx.dishes.filter(
        (d) => supply.dishIds.has(d.id!) && !d.archived && d.category !== 'prep' && !used.has(d.id!) && !ctx.lastWeek.has(d.id!),
      ),
      ctx.rng,
    );
    for (const dish of candidates) {
      if (placed >= DISHES_PER_PREP) break;
      const positions = emptyPositions(slots, dish.category).filter(
        // A main from a prep goes to a dinner first; weekend lunches only if dinners are taken.
        (p, _, all) => dish.category !== 'main' || p.slot.meal === 'dinner' || !all.some((q) => q.slot.meal === 'dinner'),
      );
      if (!positions.length) continue;
      const fitting = positions.filter((p) => differentProtein(slots, p.index, ctx)(dish));
      const pool = fitting.length ? fitting : positions;
      const target = pool[Math.floor(ctx.rng() * pool.length)]!;
      put(target.slot, dish.category, dish.id!);
      used.set(dish.id!, (used.get(dish.id!) ?? 0) + 1);
      placed++;
    }
  }
}

/**
 * Builds a whole week. Carried-over dishes go in first (SPEC §5), then dishes for available
 * preps (SPEC §6.1), then dinners, so weekend lunches avoid every dinner (SPEC §3); then
 * lunches and breakfasts.
 */
export function assembleWeek(start: ISODate, ctx: PickContext, carried: CarriedDish[] = []): SlotDraft[] {
  return fillEmpty(weekSkeleton(start), ctx, carried);
}

/**
 * «Заполнить только пустые»: keeps every chosen dish and fills the empty positions by the
 * same rules as a full assembly. Returns new slots in the same order (ids are kept).
 */
export function fillEmpty<T extends SlotDraft>(source: T[], ctx: PickContext, carried: CarriedDish[] = []): T[] {
  const slots = source.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) }));
  placeCarried(slots, carried, ctx);
  const used = usageCounts(slots);
  placeFromPreps(slots, ctx, used);

  slots.forEach((slot, index) => {
    if (slot.meal !== 'dinner') return;
    const main = slot.items[0];
    if (!main || main.dishId === null) {
      slot.items = [{ role: 'main', dishId: take('main', ctx, used, differentProtein(slots, index, ctx)) }];
    }
  });
  for (const slot of slots) {
    if (slot.meal === 'lunch' && slot.items.every((i) => i.dishId === null)) {
      slot.items = slot.items[0]?.role === 'main' ? [{ role: 'main', dishId: take('main', ctx, used) }] : weekendLunch(ctx, used);
    }
  }
  for (const slot of slots) {
    const item = slot.items[0]!;
    if (slot.meal === 'breakfast' && item.dishId === null) item.dishId = take('breakfast', ctx, used);
  }
  return slots;
}

/** Sets a dish in one position; `null` clears it. */
export function applyDish(
  slots: SlotDraft[],
  slotIndex: number,
  itemIndex: number,
  dishId: number | null,
  _ctx: PickContext,
  carryOverId?: number,
): SlotItem[] {
  const items = slots[slotIndex]!.items.map((i) => ({ ...i }));
  const item = items[itemIndex]!;
  item.dishId = dishId;
  delete item.skipped;
  if (carryOverId === undefined) delete item.carryOverId;
  else item.carryOverId = carryOverId;
  return items;
}

/**
 * «Заменить на другое случайное»: a different dish for the position, following the same
 * preferences as auto-assembly. `null` if the category has no other dish.
 */
export function rerollItem(
  slots: SlotDraft[],
  slotIndex: number,
  itemIndex: number,
  ctx: PickContext,
): SlotItem[] | null {
  const item = slots[slotIndex]!.items[itemIndex]!;
  const others = slots.map((s, i) =>
    i === slotIndex ? { ...s, items: s.items.filter((_, j) => j !== itemIndex) } : s,
  );
  const exclude = new Set(item.dishId === null ? [] : [item.dishId]);
  const prefer = item.role === 'main' ? differentProtein(slots, slotIndex, ctx) : undefined;
  const pick = pickDish(ROLE_CATEGORY[item.role], ctx, usageCounts(others), exclude, undefined, prefer);
  return pick ? applyDish(slots, slotIndex, itemIndex, pick.dish.id!, ctx) : null;
}

/** Switches a weekend lunch between a «Обед» dish and a main, filling the new position. */
export function setLunchVariant(
  slots: SlotDraft[],
  slotIndex: number,
  variant: LunchVariant,
  ctx: PickContext,
): SlotItem[] {
  const used = usageCounts(slots.filter((_, i) => i !== slotIndex));
  return variant === 'soup'
    ? [{ role: 'lunch', dishId: take('lunch', ctx, used) }]
    : [{ role: 'main', dishId: take('main', ctx, used) }];
}
