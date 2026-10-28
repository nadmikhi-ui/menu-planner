// JSON export / import of all data (SPEC §8).
import { CATEGORIES, type ISODateTime } from '../types';
import { parseISODate, toISODate } from './dates';

export const BACKUP_APP = 'menu-planner';

/** Every Dexie table, in the order they are written on import. */
export const TABLE_NAMES = [
  'settings',
  'products',
  'sortRules',
  'dishes',
  'weeks',
  'slots',
  'prepTasks',
  'carryOver',
  'freezer',
  'shoppingItems',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

export type BackupTables = Record<TableName, Record<string, unknown>[]>;

export interface Backup {
  app: typeof BACKUP_APP;
  /** Dexie schema version the data was exported from. */
  schemaVersion: number;
  exportedAt: string;
  tables: BackupTables;
}

export function makeBackup(tables: BackupTables, schemaVersion: number, now: Date): Backup {
  return { app: BACKUP_APP, schemaVersion, exportedAt: now.toISOString(), tables };
}

/** «menu-planner-2026-10-28.json» */
export function backupFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `menu-planner-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Row checks that catch a wrong or damaged file before anything is overwritten. */
function rowProblem(table: TableName, row: Record<string, unknown>): string | null {
  if (table === 'settings') return row.id === 'main' ? null : 'нет id настроек';
  if (typeof row.id !== 'number') return 'нет id';
  switch (table) {
    case 'dishes':
      if (typeof row.name !== 'string') return 'нет названия';
      if (!CATEGORIES.includes(row.category as never)) return 'неизвестный раздел';
      if (!Array.isArray(row.ingredients)) return 'нет ингредиентов';
      return null;
    case 'products':
      return typeof row.name === 'string' ? null : 'нет названия';
    case 'weeks':
      return typeof row.startDate === 'string' && typeof row.status === 'string' ? null : 'нет даты или статуса';
    case 'slots':
      return typeof row.weekId === 'number' && Array.isArray(row.items) ? null : 'нет недели или блюд';
    default:
      return null;
  }
}

const TABLE_LABELS: Record<TableName, string> = {
  settings: 'настройки',
  products: 'продукты',
  sortRules: 'правила сортировки',
  dishes: 'блюда',
  weeks: 'недели',
  slots: 'приёмы пищи',
  prepTasks: 'заготовки недели',
  carryOver: 'перенос',
  freezer: 'морозилка',
  shoppingItems: 'список покупок',
};

/** Reads a backup file; throws an Error with a Russian message if it cannot be imported. */
export function parseBackup(text: string, currentSchemaVersion: number): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Не удалось прочитать файл: это не JSON');
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP || !isObject(raw.tables)) {
    throw new Error('Это не резервная копия «Меню недели»');
  }
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : NaN;
  if (!Number.isInteger(version) || version < 1) throw new Error('В файле не указана версия данных');
  if (version > currentSchemaVersion) {
    throw new Error('Файл сохранён более новой версией приложения. Обновите приложение и повторите.');
  }

  const tables = {} as BackupTables;
  for (const name of TABLE_NAMES) {
    const rows = raw.tables[name] ?? [];
    if (!Array.isArray(rows)) throw new Error(`Файл повреждён: раздел «${TABLE_LABELS[name]}»`);
    rows.forEach((row: unknown, i) => {
      const problem = isObject(row) ? rowProblem(name, row) : 'не запись';
      if (problem) throw new Error(`Файл повреждён: раздел «${TABLE_LABELS[name]}», запись ${i + 1} — ${problem}`);
    });
    tables[name] = rows as Record<string, unknown>[];
  }
  return {
    app: BACKUP_APP,
    schemaVersion: version,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    tables,
  };
}

export interface BackupSummary {
  dishes: number;
  weeks: number;
  freezer: number;
  products: number;
}

export function backupSummary(backup: Backup): BackupSummary {
  return {
    dishes: backup.tables.dishes.length,
    weeks: backup.tables.weeks.length,
    freezer: backup.tables.freezer.filter((i) => i.status === 'in_stock').length,
    products: backup.tables.products.length,
  };
}

/** After this many days without an export the app reminds to make one. */
export const EXPORT_REMINDER_DAYS = 30;

export type ExportStatus =
  /** Never exported. */
  | { kind: 'never' }
  | { kind: 'ok' | 'due'; daysAgo: number };

/** Calendar days between the last export and `now`; «due» from `EXPORT_REMINDER_DAYS` on. */
export function exportStatus(lastExportAt: ISODateTime | undefined, now: Date): ExportStatus {
  if (!lastExportAt) return { kind: 'never' };
  const last = parseISODate(toISODate(new Date(lastExportAt)));
  const daysAgo = Math.max(0, Math.round((parseISODate(toISODate(now)).getTime() - last.getTime()) / 86_400_000));
  return { kind: daysAgo >= EXPORT_REMINDER_DAYS ? 'due' : 'ok', daysAgo };
}
