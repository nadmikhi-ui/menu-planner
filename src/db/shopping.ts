import { addPlace, movePlace, removePlace, renamePlace } from '../logic/places';
import type { ShoppingInput } from '../logic/shopping';
import { normalizeProductName } from '../logic/text';
import type { ShopPlace, ShoppingItem } from '../types';
import { db, getSettings, type MenuDB } from './db';
import { ensureProducts } from './dishes';
import { OTHER_PLACE_ID } from './seed';

type ItemFlags = Partial<Pick<ShoppingItem, 'bought' | 'haveAtHome'>>;

function itemRow(weekId: number, productName: string, database: MenuDB) {
  return database.shoppingItems.where('[weekId+productName]').equals([weekId, productName]).first();
}

/** «Куплено» / «Уже есть дома» for a product of the week's list. */
export async function setItemFlags(weekId: number, productName: string, flags: ItemFlags, database: MenuDB = db) {
  await database.transaction('rw', database.shoppingItems, async () => {
    const row = await itemRow(weekId, productName, database);
    if (row) await database.shoppingItems.update(row.id!, flags);
    else await database.shoppingItems.add({ weekId, productName, bought: false, haveAtHome: false, manual: false, ...flags });
  });
}

/**
 * Adds a product by hand (also a staple the week needs). Unknown products join the
 * dictionary with the place «Другое». Returns the normalized name.
 */
export async function addManualItem(weekId: number, name: string, database: MenuDB = db): Promise<string> {
  const productName = normalizeProductName(name);
  if (!productName) throw new Error('Введите продукт');
  await database.transaction('rw', database.shoppingItems, database.products, async () => {
    await ensureProducts([productName], database);
    const row = await itemRow(weekId, productName, database);
    if (row) await database.shoppingItems.update(row.id!, { manual: true });
    else await database.shoppingItems.add({ weekId, productName, bought: false, haveAtHome: false, manual: true });
  });
  return productName;
}

/** Takes a hand-added product out of the list (a staple goes back to «Постоянные запасы»). */
export async function removeManualItem(weekId: number, productName: string, database: MenuDB = db) {
  const row = await itemRow(weekId, productName, database);
  if (row) await database.shoppingItems.delete(row.id!);
}

async function updateProduct(name: string, patch: { placeId?: string; isStaple?: boolean }, database: MenuDB) {
  await database.transaction('rw', database.products, async () => {
    await ensureProducts([name], database);
    await database.products.where('name').equals(normalizeProductName(name)).modify(patch);
  });
}

/** Remembers where the product is bought; applies to every list from now on. */
export function setProductPlace(name: string, placeId: string, database: MenuDB = db) {
  return updateProduct(name, { placeId }, database);
}

/** Adds the product to «Постоянные запасы» or removes it from there. */
export function setStaple(name: string, isStaple: boolean, database: MenuDB = db) {
  return updateProduct(name, { isStaple }, database);
}

async function updatePlaces(change: (places: ShopPlace[]) => ShopPlace[], database: MenuDB) {
  const settings = await getSettings(database);
  await database.settings.put({ ...settings, places: change(settings.places) });
}

export function createPlace(name: string, database: MenuDB = db, id = `place-${Date.now().toString(36)}`) {
  return updatePlaces((places) => addPlace(places, name, id), database);
}

export function changePlaceName(id: string, name: string, database: MenuDB = db) {
  return updatePlaces((places) => renamePlace(places, id, name), database);
}

export function reorderPlace(id: string, step: -1 | 1, database: MenuDB = db) {
  return updatePlaces((places) => movePlace(places, id, step), database);
}

/** Deletes a place; its products move to «Другое». */
export async function deletePlace(id: string, database: MenuDB = db) {
  await database.transaction('rw', database.settings, database.products, async () => {
    await updatePlaces((places) => removePlace(places, id), database);
    await database.products.where('placeId').equals(id).modify({ placeId: OTHER_PLACE_ID });
  });
}

/** Everything `buildShoppingList` needs for one week. */
export async function shoppingInput(weekId: number, database: MenuDB = db): Promise<ShoppingInput> {
  const [slots, prepTasks, dishes, products, items, carryOvers] = await Promise.all([
    database.slots.where('weekId').equals(weekId).toArray(),
    database.prepTasks.where('weekId').equals(weekId).toArray(),
    database.dishes.toArray(),
    database.products.toArray(),
    database.shoppingItems.where('weekId').equals(weekId).toArray(),
    database.carryOver.toArray(),
  ]);
  return { slots, prepTasks, dishesById: new Map(dishes.map((d) => [d.id!, d])), products, items, carryOvers };
}
