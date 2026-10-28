export type TabId = 'week' | 'dishes' | 'shopping' | 'freezer' | 'more';

export interface Tab {
  id: TabId;
  label: string;
}

/** Bottom navigation order (SPEC §9). */
export const TABS: Tab[] = [
  { id: 'week', label: 'Неделя' },
  { id: 'dishes', label: 'Блюда' },
  { id: 'shopping', label: 'Покупки' },
  { id: 'freezer', label: 'Морозилка' },
  { id: 'more', label: 'Ещё' },
];

/** Props every top-level screen receives. */
export interface ScreenProps {
  path: string[];
}

export const DEFAULT_TAB: TabId = 'week';

export interface Route {
  tab: TabId;
  /** Segments after the tab: `#/dishes/12` → `['12']`. */
  path: string[];
}

/** Parses `#/dishes/new` → `{ tab: 'dishes', path: ['new'] }`; unknown tabs fall back to the default tab. */
export function parseHash(hash: string): Route {
  const [id, ...path] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const tab = TABS.find((t) => t.id === id)?.id;
  return tab ? { tab, path } : { tab: DEFAULT_TAB, path: [] };
}

/** True while the current history entry was pushed by `openRoute`, so closing can go back. */
let pushedInApp = false;

/** Opens a nested route (e.g. a form) so the phone's Back button closes it. */
export function openRoute(hash: string): void {
  pushedInApp = true;
  window.location.hash = hash;
}

/** Closes a nested route: goes back if we opened it, otherwise replaces it with `fallback`. */
export function closeRoute(fallback: string): void {
  if (pushedInApp) {
    pushedInApp = false;
    window.history.back();
  } else {
    window.location.replace(fallback);
  }
}
