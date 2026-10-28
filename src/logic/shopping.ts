// Shopping list for an approved week (SPEC §7). The list is derived from the week's
// dishes on every render; `ShoppingItem` rows only keep ticks and hand-added products.
import { OTHER_PLACE_ID } from '../db/seed';
import type { CarryOver, Dish, PrepTask, Product, ShopPlace, ShoppingItem, Slot, Week } from '../types';
import { formatWeekRange } from './dates';
import { uniqueProducts } from './text';

/** A dish that needs the product, and how many times it is planned this week. */
export interface ShoppingSource {
  dishId: number;
  count: number;
  /** Comes from a «Заморозить на этой неделе» task. */
  prep?: boolean;
}

export interface ShoppingLine {
  productName: string;
  placeId: string;
  sources: ShoppingSource[];
  /** Total planned uses of the product (sum of `sources` counts). */
  uses: number;
  staple: boolean;
  /** Added by hand: kept in the list even if no dish needs it or it is a staple. */
  manual: boolean;
  bought: boolean;
  haveAtHome: boolean;
}

export interface ShoppingList {
  /** Products to buy: dish ingredients that are not staples, plus hand-added ones. */
  lines: ShoppingLine[];
  /** Staples the week's dishes need; left out of the list until added by hand. */
  staples: ShoppingLine[];
  /** Carried-over dishes whose ingredients are still at home («Продукты ещё есть?» → Да). */
  coveredDishIds: number[];
}

export interface ShoppingInput {
  slots: Slot[];
  prepTasks: PrepTask[];
  dishesById: Map<number, Dish>;
  products: Product[];
  items: ShoppingItem[];
  carryOvers: CarryOver[];
}

/** A product the week's dishes need, with the dishes that need it. */
export interface NeededProduct {
  productName: string;
  sources: ShoppingSource[];
}

/**
 * Ingredients of the week's dishes and prep tasks without duplicates (names are compared
 * normalized). Skipped dishes are not cooked, so they add nothing; neither do carried-over
 * dishes whose products are still at home («Продукты ещё есть?» → Да).
 */
export function neededProducts({ slots, prepTasks, dishesById, carryOvers }: ShoppingInput): {
  needed: NeededProduct[];
  coveredDishIds: number[];
} {
  const covered = new Set(carryOvers.filter((c) => c.haveIngredients === true).map((c) => c.id!));
  const coveredDishIds: number[] = [];
  const planned: { dishId: number; prep: boolean }[] = [];

  for (const slot of slots) {
    for (const item of slot.items) {
      if (item.dishId === null || item.skipped) continue;
      if (item.carryOverId !== undefined && covered.has(item.carryOverId)) {
        if (!coveredDishIds.includes(item.dishId)) coveredDishIds.push(item.dishId);
        continue;
      }
      planned.push({ dishId: item.dishId, prep: false });
    }
  }
  for (const task of prepTasks) planned.push({ dishId: task.dishId, prep: true });

  // productName → sources, in order of first appearance.
  const byName = new Map<string, ShoppingSource[]>();
  for (const { dishId, prep } of planned) {
    const dish = dishesById.get(dishId);
    if (!dish) continue;
    for (const name of uniqueProducts(dish.ingredients)) {
      const sources = byName.get(name) ?? [];
      const source = sources.find((s) => s.dishId === dishId && !!s.prep === prep);
      if (source) source.count++;
      else sources.push(prep ? { dishId, count: 1, prep } : { dishId, count: 1 });
      byName.set(name, sources);
    }
  }
  return { needed: [...byName].map(([productName, sources]) => ({ productName, sources })), coveredDishIds };
}

/** The list stored when it was last built; a changed menu is compared against it. */
export type ShoppingSnapshot = NeededProduct[];

const signature = (needed: NeededProduct[]) =>
  JSON.stringify(
    [...needed]
      .sort((a, b) => a.productName.localeCompare(b.productName))
      .map((n) => [n.productName, [...n.sources].map((s) => [s.dishId, s.count, !!s.prep]).sort()]),
  );

/** True when the menu now needs something different from what the stored list shows. */
export function menuChanged(snapshot: ShoppingSnapshot, current: NeededProduct[]): boolean {
  return signature(snapshot) !== signature(current);
}

/**
 * Builds the list. With a `snapshot` the products come from it, not from the current menu,
 * so the list stays put until the user refreshes it; ticks and places always apply.
 */
export function buildShoppingList(input: ShoppingInput, snapshot?: ShoppingSnapshot): ShoppingList {
  const { products, items } = input;
  const fresh = neededProducts(input);
  const coveredDishIds = fresh.coveredDishIds;
  const needed = new Map((snapshot ?? fresh.needed).map((n) => [n.productName, n.sources]));

  const productsByName = new Map(products.map((p) => [p.name, p]));
  const itemsByName = new Map(items.map((i) => [i.productName, i]));
  const line = (productName: string, sources: ShoppingSource[]): ShoppingLine => {
    const product = productsByName.get(productName);
    const item = itemsByName.get(productName);
    return {
      productName,
      placeId: product?.placeId ?? OTHER_PLACE_ID,
      sources,
      uses: sources.reduce((sum, s) => sum + s.count, 0),
      staple: product?.isStaple ?? false,
      manual: item?.manual ?? false,
      bought: item?.bought ?? false,
      haveAtHome: item?.haveAtHome ?? false,
    };
  };

  const lines: ShoppingLine[] = [];
  const staples: ShoppingLine[] = [];
  for (const [name, sources] of needed) {
    const l = line(name, sources);
    (l.staple && !l.manual ? staples : lines).push(l);
  }
  for (const item of items) {
    if (item.manual && !needed.has(item.productName)) lines.push(line(item.productName, []));
  }
  return { lines, staples, coveredDishIds };
}

/** Nothing left to do for the line: bought or already at home. */
export function isDone(line: ShoppingLine): boolean {
  return line.bought || line.haveAtHome;
}

export interface PlaceGroup {
  place: ShopPlace;
  lines: ShoppingLine[];
}

const collator = new Intl.Collator('ru');

/**
 * Groups lines by shop place in the order of `places`; unknown places (e.g. deleted) go to «Другое».
 * Inside a group, lines still to buy come first, each part sorted by name. Empty groups are dropped.
 */
export function groupByPlace(lines: ShoppingLine[], places: ShopPlace[]): PlaceGroup[] {
  const known = new Set(places.map((p) => p.id));
  const fallback = places.find((p) => p.id === OTHER_PLACE_ID) ?? { id: OTHER_PLACE_ID, name: 'Другое' };
  const order = known.has(fallback.id) ? places : [...places, fallback];
  return order
    .map((place) => ({
      place,
      lines: lines
        .filter((l) => (known.has(l.placeId) ? l.placeId : fallback.id) === place.id)
        .sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || collator.compare(a.productName, b.productName)),
    }))
    .filter((g) => g.lines.length > 0);
}

/**
 * Plain text for «Поделиться списком»: only what is still to buy, grouped by place.
 * No ×N here: in a message it would read as a quantity.
 */
export function shareText(weekStart: string, groups: PlaceGroup[]): string {
  const parts = [`Покупки на ${formatWeekRange(weekStart)}`];
  for (const { place, lines } of groups) {
    const left = lines.filter((l) => !isDone(l));
    if (left.length === 0) continue;
    parts.push([`${place.name}:`, ...left.map((l) => `— ${l.productName}`)].join('\n'));
  }
  if (parts.length === 1) parts.push('Всё куплено.');
  return parts.join('\n\n');
}

/** Approved weeks, earliest first; the list opens on the latest one — the week being shopped for. */
export function shoppingWeeks(weeks: Week[]): Week[] {
  return weeks.filter((w) => w.status === 'approved').sort((a, b) => a.startDate.localeCompare(b.startDate));
}
