import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBackup } from '../logic/backup';
import { seededRng } from '../logic/random';
import { exportBackup, importBackup } from './backup';
import { MenuDB, getSettings } from './db';
import { saveDish } from './dishes';
import { addFreezerItem } from './freezer';
import { createPlace } from './shopping';
import { assembleAndSave, createWeek, setWeekStatus } from './weeks';

let source: MenuDB;
let target: MenuDB;
let n = 0;

beforeEach(async () => {
  source = new MenuDB(`test-backup-src-${n}`);
  target = new MenuDB(`test-backup-dst-${n++}`);
});

afterEach(async () => {
  await source.delete();
  await target.delete();
});

async function fill(database: MenuDB) {
  for (const [name, category] of [
    ['Котлеты', 'main'],
    ['Пюре', 'side'],
    ['Винегрет', 'salad'],
    ['Сырники', 'breakfast'],
    ['Бутерброды', 'snack'],
    ['Щи', 'lunch'],
  ] as const) {
    await saveDish({ name, category, ingredients: [`продукт ${name}`], note: '', standalone: false }, undefined, database);
  }
  const weekId = await createWeek('2026-11-02', database);
  await assembleAndSave(weekId, seededRng(1), database);
  await setWeekStatus(weekId, 'approved', database);
  await addFreezerItem({ name: 'Фарш', frozenAt: '2026-10-01', quantity: '2 пакета' }, database, new Date(2026, 9, 28));
  await createPlace('Пекарня', database, 'bakery');
}

describe('export and import (SPEC §8)', () => {
  it('moves all data to another device unchanged', async () => {
    await fill(source);
    const backup = await exportBackup(source);
    await importBackup(parseBackup(JSON.stringify(backup), target.verno), target);

    const again = await exportBackup(target, new Date(backup.exportedAt));
    expect(again).toEqual(backup);
    expect((await getSettings(target)).places.map((p) => p.id)).toContain('bakery');
  });

  it('replaces the data that was there before', async () => {
    await fill(source);
    await saveDish({ name: 'Только на втором', category: 'main', ingredients: [], note: '', standalone: false }, undefined, target);
    await importBackup(await exportBackup(source), target);
    expect((await target.dishes.toArray()).map((d) => d.name)).not.toContain('Только на втором');
    expect(await target.dishes.count()).toBe(6);
  });

  it('changes nothing if the import fails half-way', async () => {
    await fill(source);
    const backup = await exportBackup(source);
    backup.tables.products.push({ ...backup.tables.products[0]!, id: 999 }); // duplicate unique name
    await saveDish({ name: 'Моё блюдо', category: 'main', ingredients: [], note: '', standalone: false }, undefined, target);

    await expect(importBackup(backup, target)).rejects.toThrow();
    expect((await target.dishes.toArray()).map((d) => d.name)).toEqual(['Моё блюдо']);
  });
});
