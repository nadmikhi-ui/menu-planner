// Automatic week assembly and slot editing (SPEC §3–4).
import type { Dish, DishCategory, ISODate, SlotItem } from '../types';
import { shuffle, type Rng } from './random';
import { ROLE_CATEGORY, emptyItems, weekSkeleton, type LunchVariant, type SlotDraft } from './week';

export interface PickContext {
  /** All dishes; archived ones are ignored. */
  dishes: Dish[];
  /** Dishes cooked last week (SPEC §4, 2-week window). */
  lastWeek: Set<number>;
  /** Most recent date each dish was cooked. */
  lastUsed: Map<number, ISODate>;
  rng: Rng;
}

export interface Pick {
  dish: Dish;
  /** False when the category ran out and a repeat had to be taken. */
  fresh: boolean;
}

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
  filter?: (dish: Dish) => boolean,
  prefer?: (dish: Dish) => boolean,
): number | null {
  const pick = pickDish(category, ctx, used, undefined, filter, prefer);
  if (!pick) return null;
  const id = pick.dish.id!;
  used.set(id, (used.get(id) ?? 0) + 1);
  return id;
}

const byId = (ctx: PickContext, id: number | null) => (id === null ? undefined : ctx.dishes.find((d) => d.id === id));

/**
 * Fills the empty positions of main + side (unless the main is standalone) + salad,
 * keeping dishes already placed there (carried-over ones). Without `withSalad`
 * a salad is kept only if it was already placed.
 */
function completeMainCourse(
  placed: SlotItem[],
  ctx: PickContext,
  used: Map<number, number>,
  withSalad: boolean,
  preferMain?: (dish: Dish) => boolean,
): SlotItem[] {
  const find = (role: SlotItem['role']) => placed.find((i) => i.role === role && i.dishId !== null);
  const [side, salad] = [find('side'), find('salad')];
  const main = find('main') ?? {
    role: 'main' as const,
    // A placed side needs a main that is not standalone.
    dishId: take('main', ctx, used, side ? (d) => !d.standalone : undefined, preferMain),
  };
  const items: SlotItem[] = [main];
  if (!byId(ctx, main.dishId)?.standalone) items.push(side ?? { role: 'side', dishId: take('side', ctx, used) });
  if (salad || withSalad) items.push(salad ?? { role: 'salad', dishId: take('salad', ctx, used) });
  return items;
}

function mainCourse(ctx: PickContext, used: Map<number, number>, withSalad: boolean): SlotItem[] {
  return completeMainCourse([], ctx, used, withSalad);
}

/** Prefers a fresh «Обед» dish, then a fresh main + side, then whatever is least repeated. */
function weekendLunch(ctx: PickContext, used: Map<number, number>): SlotItem[] {
  const soup = pickDish('lunch', ctx, used);
  if (soup?.fresh || (soup && !pickDish('main', ctx, used)?.fresh)) {
    return [{ role: 'lunch', dishId: take('lunch', ctx, used) }];
  }
  return pickDish('main', ctx, used) ? mainCourse(ctx, used, false) : emptyItems('lunch');
}

/** A dish from the carry-over queue (SPEC §5). */
export interface CarriedDish {
  carryOverId: number;
  dishId: number;
}

/**
 * Puts carried-over dishes into the earliest suitable empty positions of the skeleton.
 * A main goes to a dinner (or, if all dinners are taken, a weekend lunch as main + side);
 * a side only next to a main that can have one. Dishes that don't fit are left out.
 */
export function placeCarried(slots: SlotDraft[], carried: CarriedDish[], ctx: PickContext): void {
  const emptyAt = (slot: SlotDraft, role: SlotItem['role']) =>
    slot.items.find((i) => i.role === role && i.dishId === null);
  const hasStandaloneMain = (slot: SlotDraft) =>
    slot.items.some((i) => i.role === 'main' && byId(ctx, i.dishId)?.standalone);

  for (const { carryOverId, dishId } of carried) {
    const dish = byId(ctx, dishId);
    if (!dish || dish.category === 'prep') continue;
    const put = (item: SlotItem | undefined) => {
      if (!item) return false;
      item.dishId = dishId;
      item.carryOverId = carryOverId;
      return true;
    };

    switch (dish.category) {
      case 'main': {
        const dinner = slots.find(
          (s) => s.meal === 'dinner' && emptyAt(s, 'main') && !(dish.standalone && s.items.some((i) => i.role === 'side' && i.dishId !== null)),
        );
        if (put(dinner && emptyAt(dinner, 'main'))) break;
        const lunch = slots.find((s) => s.meal === 'lunch' && s.items.every((i) => i.dishId === null));
        if (lunch) {
          lunch.items = [{ role: 'main', dishId: null }, { role: 'side', dishId: null }];
          put(lunch.items[0]);
        }
        break;
      }
      case 'side': {
        const dinner = slots.find((s) => s.meal === 'dinner' && emptyAt(s, 'side') && !hasStandaloneMain(s));
        put(dinner && emptyAt(dinner, 'side'));
        break;
      }
      case 'salad': {
        const dinner = slots.find((s) => s.meal === 'dinner' && emptyAt(s, 'salad'));
        put(dinner && emptyAt(dinner, 'salad'));
        break;
      }
      default: {
        const role = dish.category;
        const slot = slots.find((s) => emptyAt(s, role));
        put(slot && emptyAt(slot, role));
      }
    }
  }
}

/**
 * Builds a whole week. Carried-over dishes go in first (SPEC §5), then dinners,
 * so weekend lunches avoid every dinner main and side (SPEC §3); then lunches,
 * breakfasts and snacks.
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

  slots.forEach((slot, index) => {
    if (slot.meal === 'dinner') {
      slot.items = completeMainCourse(slot.items, ctx, used, true, differentProtein(slots, index, ctx));
    }
  });
  for (const slot of slots) {
    if (slot.meal !== 'lunch') continue;
    const soup = slot.items.find((i) => i.role === 'lunch');
    if (!soup) slot.items = completeMainCourse(slot.items, ctx, used, false);
    else if (soup.dishId === null) slot.items = weekendLunch(ctx, used);
  }
  for (const slot of slots) {
    const item = slot.items[0]!;
    if ((slot.meal === 'breakfast' || slot.meal === 'snack') && item.dishId === null) {
      item.dishId = take(item.role, ctx, used);
    }
  }
  return slots;
}

/**
 * Sets a dish in one position. Choosing a standalone main drops the side;
 * choosing a regular main brings the side back and fills it.
 */
export function applyDish(
  slots: SlotDraft[],
  slotIndex: number,
  itemIndex: number,
  dishId: number | null,
  ctx: PickContext,
  carryOverId?: number,
): SlotItem[] {
  const items = slots[slotIndex]!.items.map((i) => ({ ...i }));
  const item = items[itemIndex]!;
  item.dishId = dishId;
  delete item.skipped;
  if (carryOverId === undefined) delete item.carryOverId;
  else item.carryOverId = carryOverId;

  if (item.role !== 'main') return items;
  const sideIndex = items.findIndex((i) => i.role === 'side');
  if (byId(ctx, dishId)?.standalone) {
    if (sideIndex >= 0) items.splice(sideIndex, 1);
  } else if (sideIndex < 0) {
    const others = slots.map((s, i) => (i === slotIndex ? { ...s, items } : s));
    items.splice(itemIndex + 1, 0, { role: 'side', dishId: take('side', ctx, usageCounts(others)) });
  }
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

/** Switches a weekend lunch between «Обед» dish and main + side, filling the new positions. */
export function setLunchVariant(
  slots: SlotDraft[],
  slotIndex: number,
  variant: LunchVariant,
  ctx: PickContext,
): SlotItem[] {
  const used = usageCounts(slots.filter((_, i) => i !== slotIndex));
  return variant === 'soup' ? [{ role: 'lunch', dishId: take('lunch', ctx, used) }] : mainCourse(ctx, used, false);
}

/** Adds the optional salad to a main + side lunch. */
export function addSalad(slots: SlotDraft[], slotIndex: number, ctx: PickContext): SlotItem[] {
  const items = slots[slotIndex]!.items;
  if (items.some((i) => i.role === 'salad')) return items;
  return [...items, { role: 'salad', dishId: take('salad', ctx, usageCounts(slots)) }];
}
