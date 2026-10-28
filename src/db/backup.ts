import { TABLE_NAMES, makeBackup, type Backup, type BackupTables } from '../logic/backup';
import { db, type MenuDB } from './db';

const tablesOf = (database: MenuDB) => TABLE_NAMES.map((name) => database.table(name));

/** Everything stored on the device, as one JSON-ready object. */
export async function exportBackup(database: MenuDB = db, now = new Date()): Promise<Backup> {
  const tables = {} as BackupTables;
  await database.transaction('r', tablesOf(database), async () => {
    for (const name of TABLE_NAMES) tables[name] = await database.table(name).toArray();
  });
  return makeBackup(tables, database.verno, now);
}

/**
 * Replaces all data with the backup's. Runs in one transaction: if any row fails
 * (e.g. a duplicate product), nothing is changed.
 */
export async function importBackup(backup: Backup, database: MenuDB = db): Promise<void> {
  await database.transaction('rw', tablesOf(database), async () => {
    for (const name of TABLE_NAMES) await database.table(name).clear();
    for (const name of TABLE_NAMES) await database.table(name).bulkAdd(backup.tables[name]);
  });
}
