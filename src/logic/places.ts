// Editable list of shop places (SPEC §7). «Другое» always exists: new and orphaned products go there.
import { OTHER_PLACE_ID } from '../db/seed';
import type { ShopPlace } from '../types';
import { cleanName, normalizeProductName } from './text';

function checkName(places: ShopPlace[], name: string, exceptId?: string): string {
  const clean = cleanName(name);
  if (!clean) throw new Error('Введите название места');
  const key = normalizeProductName(clean);
  if (places.some((p) => p.id !== exceptId && normalizeProductName(p.name) === key)) {
    throw new Error('Такое место уже есть');
  }
  return clean;
}

/** New places go before «Другое», which stays last. */
export function addPlace(places: ShopPlace[], name: string, id: string): ShopPlace[] {
  const place = { id, name: checkName(places, name) };
  const other = places.findIndex((p) => p.id === OTHER_PLACE_ID);
  return other === -1 ? [...places, place] : [...places.slice(0, other), place, ...places.slice(other)];
}

export function renamePlace(places: ShopPlace[], id: string, name: string): ShopPlace[] {
  const clean = checkName(places, name, id);
  return places.map((p) => (p.id === id ? { ...p, name: clean } : p));
}

export function removePlace(places: ShopPlace[], id: string): ShopPlace[] {
  if (id === OTHER_PLACE_ID) throw new Error('Место «Другое» удалить нельзя');
  return places.filter((p) => p.id !== id);
}

/** Moves a place one step up (-1) or down (+1); «Другое» and the edges stay put. */
export function movePlace(places: ShopPlace[], id: string, step: -1 | 1): ShopPlace[] {
  const from = places.findIndex((p) => p.id === id);
  const to = from + step;
  if (from === -1 || to < 0 || to >= places.length) return places;
  if (places[from]!.id === OTHER_PLACE_ID || places[to]!.id === OTHER_PLACE_ID) return places;
  const result = [...places];
  [result[from], result[to]] = [result[to]!, result[from]!];
  return result;
}
