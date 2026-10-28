import { describe, expect, it } from 'vitest';
import {
  EXPORT_REMINDER_DAYS,
  TABLE_NAMES,
  backupFileName,
  backupSummary,
  exportStatus,
  makeBackup,
  parseBackup,
  type BackupTables,
} from './backup';

const emptyTables = () => Object.fromEntries(TABLE_NAMES.map((n) => [n, []])) as unknown as BackupTables;

function sample() {
  const tables = emptyTables();
  tables.settings = [{ id: 'main', weekStartDay: 1 }];
  tables.dishes = [{ id: 1, name: 'Борщ', category: 'lunch', ingredients: ['свекла'] }];
  tables.weeks = [{ id: 1, startDate: '2026-11-02', status: 'done' }];
  tables.slots = [{ id: 1, weekId: 1, date: '2026-11-02', meal: 'lunch', items: [] }];
  tables.freezer = [
    { id: 1, name: 'Фарш', status: 'in_stock' },
    { id: 2, name: 'Укроп', status: 'finished' },
  ];
  return makeBackup(tables, 1, new Date('2026-10-28T10:00:00Z'));
}

describe('backup (SPEC §8)', () => {
  it('round-trips through JSON', () => {
    const backup = sample();
    expect(parseBackup(JSON.stringify(backup), 1)).toEqual(backup);
  });

  it('summarizes what will be loaded', () => {
    expect(backupSummary(sample())).toEqual({ dishes: 1, weeks: 1, freezer: 1, products: 0 });
  });

  it('names the file by date', () => {
    expect(backupFileName(new Date(2026, 9, 28, 23, 59))).toBe('menu-planner-2026-10-28.json');
  });

  it('treats missing tables as empty', () => {
    const { tables, ...rest } = sample();
    const parsed = parseBackup(JSON.stringify({ ...rest, tables: { dishes: tables.dishes } }), 1);
    expect(parsed.tables.dishes).toHaveLength(1);
    expect(parsed.tables.freezer).toEqual([]);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('не json', 1)).toThrow('это не JSON');
    expect(() => parseBackup('{"app":"other","tables":{}}', 1)).toThrow('Это не резервная копия');
    expect(() => parseBackup('[]', 1)).toThrow('Это не резервная копия');
  });

  it('rejects backups from a newer app version', () => {
    expect(() => parseBackup(JSON.stringify({ ...sample(), schemaVersion: 2 }), 1)).toThrow('более новой версией');
    expect(() => parseBackup(JSON.stringify({ ...sample(), schemaVersion: 'x' }), 1)).toThrow('версия');
  });

  it('points at a damaged table and row', () => {
    const backup = sample();
    expect(() => parseBackup(JSON.stringify({ ...backup, tables: { ...backup.tables, weeks: {} } }), 1)).toThrow(
      'раздел «недели»',
    );
    const dishes = [...backup.tables.dishes, { id: 2, name: 'Каша', category: 'dessert', ingredients: [] }];
    expect(() => parseBackup(JSON.stringify({ ...backup, tables: { ...backup.tables, dishes } }), 1)).toThrow(
      'раздел «блюда», запись 2 — неизвестный раздел',
    );
    const slots = [{ weekId: 1, items: [] }];
    expect(() => parseBackup(JSON.stringify({ ...backup, tables: { ...backup.tables, slots } }), 1)).toThrow('нет id');
  });
});

describe('export reminder (SPEC §8)', () => {
  const now = new Date(2026, 9, 28, 12);

  it('says so when the data was never exported', () => {
    expect(exportStatus(undefined, now)).toEqual({ kind: 'never' });
  });

  it('counts calendar days since the last export', () => {
    expect(exportStatus(new Date(2026, 9, 28, 1).toISOString(), now)).toEqual({ kind: 'ok', daysAgo: 0 });
    expect(exportStatus(new Date(2026, 9, 27, 23, 59).toISOString(), now)).toEqual({ kind: 'ok', daysAgo: 1 });
  });

  it('reminds once a month has passed', () => {
    const at = (daysAgo: number) => new Date(2026, 9, 28 - daysAgo, 8).toISOString();
    expect(exportStatus(at(EXPORT_REMINDER_DAYS - 1), now).kind).toBe('ok');
    expect(exportStatus(at(EXPORT_REMINDER_DAYS), now)).toEqual({ kind: 'due', daysAgo: EXPORT_REMINDER_DAYS });
    expect(exportStatus(at(90), now).kind).toBe('due');
  });
});
