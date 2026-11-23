import Dexie, { type EntityTable } from 'dexie';
import type {
  CarryOver,
  Dish,
  FreezerItem,
  PrepTask,
  Product,
  Settings,
  ShoppingItem,
  Slot,
  SortRule,
  Week,
} from '../types';
import { dropRemovedSections } from '../logic/migrate';
import { defaultSettings, defaultStapleProducts } from './seed';

export class MenuDB extends Dexie {
  dishes!: EntityTable<Dish, 'id'>;
  products!: EntityTable<Product, 'id'>;
  sortRules!: EntityTable<SortRule, 'id'>;
  weeks!: EntityTable<Week, 'id'>;
  slots!: EntityTable<Slot, 'id'>;
  prepTasks!: EntityTable<PrepTask, 'id'>;
  carryOver!: EntityTable<CarryOver, 'id'>;
  freezer!: EntityTable<FreezerItem, 'id'>;
  shoppingItems!: EntityTable<ShoppingItem, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor(name = 'menu-planner') {
    super(name);

    // Booleans are not valid IndexedDB keys, so flags like `archived` are filtered in memory.
    this.version(1).stores({
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

    // v2: sections «Гарнир», «Салат», «Перекус» removed (SPEC §1). Same indexes, data rewritten.
    this.version(2)
      .stores({})
      .upgrade(async (tx) => {
        const names = ['dishes', 'slots', 'carryOver', 'sortRules', 'settings', 'weeks'] as const;
        const before = {} as Record<(typeof names)[number], Record<string, unknown>[]>;
        for (const name of names) before[name] = await tx.table(name).toArray();
        const after = dropRemovedSections(before);
        for (const name of names) {
          await tx.table(name).clear();
          await tx.table(name).bulkAdd(after[name]);
        }
      });

    this.on('populate', async (tx) => {
      await tx.table('settings').add(defaultSettings());
      await tx.table('products').bulkAdd(defaultStapleProducts());
    });
  }
}

export const db = new MenuDB();

/** Settings row, falling back to defaults if it is missing (e.g. after a partial import). */
export async function getSettings(database: MenuDB = db): Promise<Settings> {
  return (await database.settings.get('main')) ?? defaultSettings();
}
