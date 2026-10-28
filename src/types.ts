// Domain types and reference constants. See docs/SPEC.md.

/** ISO date `YYYY-MM-DD` (calendar day). */
export type ISODate = string;
/** Full ISO timestamp. */
export type ISODateTime = string;

// ---------- Dishes (SPEC §1) ----------

export type DishCategory = 'main' | 'side' | 'salad' | 'breakfast' | 'snack' | 'lunch' | 'prep';

export const CATEGORIES: DishCategory[] = ['main', 'side', 'salad', 'breakfast', 'snack', 'lunch', 'prep'];

export const CATEGORY_LABELS: Record<DishCategory, string> = {
  main: 'Основное блюдо',
  side: 'Гарнир',
  salad: 'Салат',
  breakfast: 'Завтрак',
  snack: 'Перекус',
  lunch: 'Обед',
  prep: 'Заготовка в морозилку',
};

export type ProteinType = 'meat' | 'poultry' | 'fish' | 'other';

export const PROTEIN_LABELS: Record<ProteinType, string> = {
  meat: 'Мясо',
  poultry: 'Птица',
  fish: 'Рыба',
  other: 'Другое',
};

/** Freezer prep kind (SPEC §6). */
export type PrepType = 'berries' | 'soup' | 'main' | 'greens' | 'other';

export const PREP_TYPE_LABELS: Record<PrepType, string> = {
  berries: 'Ягоды/фрукты для компотов',
  soup: 'Заготовки для супов',
  main: 'Заготовки для основных блюд',
  greens: 'Зелень',
  other: 'Другое',
};

export type PrepSource = 'bought' | 'fresh';

export const PREP_SOURCE_LABELS: Record<PrepSource, string> = {
  bought: 'Покупная заморозка',
  fresh: 'Заморозить свежее с рынка',
};

export interface Dish {
  id?: number;
  name: string;
  category: DishCategory;
  /** Product names only, no quantities. */
  ingredients: string[];
  note: string;
  /** Only for `main`. */
  protein?: ProteinType;
  /** Only for `main`: needs no side dish (плов, лазанья…). */
  standalone: boolean;
  /** Only for `prep`. */
  prepType?: PrepType;
  /** Only for `prep`. */
  prepSource?: PrepSource;
  addedAt: ISODateTime;
  /** Hidden from pickers, never physically deleted. */
  archived: boolean;
}

// ---------- Products dictionary (SPEC §7) ----------

export interface Product {
  id?: number;
  /** Normalized (trimmed, lower-case) product name; unique. */
  name: string;
  /** References `ShopPlace.id` from settings. */
  placeId: string;
  /** «Постоянные запасы» — excluded from shopping lists by default. */
  isStaple: boolean;
}

// ---------- Auto-sort rules (SPEC §2) ----------

/**
 * User corrections to the auto-sorter. Built-in keyword rules live in code;
 * rules in the DB always take precedence over them.
 */
export interface SortRule {
  id?: number;
  /** Normalized keyword or full dish name. */
  keyword: string;
  category: DishCategory;
  standalone?: boolean;
  createdAt: ISODateTime;
}

// ---------- Weeks and slots (SPEC §3–5) ----------

export type WeekStatus = 'draft' | 'approved' | 'done';

export const WEEK_STATUS_LABELS: Record<WeekStatus, string> = {
  draft: 'Черновик',
  approved: 'Утверждена',
  done: 'Завершена',
};

export interface Week {
  id?: number;
  /** First day of the week (= day after shopping). */
  startDate: ISODate;
  status: WeekStatus;
  createdAt: ISODateTime;
  approvedAt?: ISODateTime;
  completedAt?: ISODateTime;
}

/** Meal of the day. Weekdays: breakfast/snack/dinner; Sat & Sun: breakfast/lunch/dinner. */
export type MealType = 'breakfast' | 'snack' | 'lunch' | 'dinner';

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Завтрак',
  snack: 'Перекус в обед',
  lunch: 'Обед',
  dinner: 'Ужин',
};

/** Position of a dish inside a slot, e.g. dinner = main + side + salad. */
export type SlotRole = 'main' | 'side' | 'salad' | 'breakfast' | 'snack' | 'lunch';

export type SkipReason = 'leftovers' | 'ate_out' | 'other';

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  leftovers: 'Съели остатки',
  ate_out: 'Ели вне дома',
  other: 'Другое',
};

export interface SkipInfo {
  reason: SkipReason;
  comment?: string;
  at: ISODateTime;
}

export interface SlotItem {
  role: SlotRole;
  dishId: number | null;
  /** Set when the dish (or the whole slot) was marked «Пропущено». */
  skipped?: SkipInfo;
  /** `CarryOver.id` if the dish came from the carry-over queue. */
  carryOverId?: number;
}

export interface Slot {
  id?: number;
  weekId: number;
  date: ISODate;
  meal: MealType;
  items: SlotItem[];
}

/** «Заморозить на этой неделе» task (SPEC §6). */
export interface PrepTask {
  id?: number;
  weekId: number;
  dishId: number;
  done: boolean;
  doneAt?: ISODateTime;
  /** The «Сейчас в морозилке» record created by «Сделано»; removed again if the mark is undone. */
  freezerItemId?: number;
}

// ---------- Carry-over queue (SPEC §5) ----------

export type CarryOverStatus = 'pending' | 'placed' | 'cancelled';

export interface CarryOver {
  id?: number;
  dishId: number;
  role: SlotRole;
  fromWeekId: number;
  fromSlotId: number;
  skipped: SkipInfo;
  status: CarryOverStatus;
  /** «Продукты ещё есть?» — if true, ingredients are left out of the next shopping list. */
  haveIngredients?: boolean;
  placedWeekId?: number;
  createdAt: ISODateTime;
}

// ---------- Freezer (SPEC §6) ----------

export type FreezerStatus = 'in_stock' | 'finished';

export interface FreezerItem {
  id?: number;
  name: string;
  /** Source prep idea, if any. */
  dishId?: number;
  frozenAt: ISODate;
  /** Free text: «3 пакета». */
  quantity: string;
  status: FreezerStatus;
  updatedAt: ISODateTime;
  finishedAt?: ISODateTime;
}

// ---------- Shopping list (SPEC §7) ----------

export interface ShoppingItem {
  id?: number;
  weekId: number;
  /** Normalized product name (matches `Product.name`). */
  productName: string;
  bought: boolean;
  haveAtHome: boolean;
  /** Added by hand, not derived from the week's dishes. */
  manual: boolean;
}

// ---------- Settings (SPEC §8) ----------

export interface ShopPlace {
  id: string;
  name: string;
}

export type RepeatPolicy = 'strict' | 'relaxed';

/** 0 = Sunday … 6 = Saturday (same as `Date.getDay()`). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
  0: 'Воскресенье',
};

export interface Settings {
  id: 'main';
  weekStartDay: Weekday;
  places: ShopPlace[];
  repeatPolicy: Record<DishCategory, RepeatPolicy>;
  freezerMaxAgeMonths: number;
}
