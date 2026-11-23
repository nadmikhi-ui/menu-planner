import { useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { ensureBookLibrary } from './db/books';
import { parseHash, type Route, type ScreenProps, type TabId } from './navigation';
import { DishesScreen } from './screens/DishesScreen';
import { FreezerScreen } from './screens/FreezerScreen';
import { MoreScreen } from './screens/MoreScreen';
import { ShoppingScreen } from './screens/ShoppingScreen';
import { WeekScreen } from './screens/WeekScreen';

const SCREENS: Record<TabId, (props: ScreenProps) => React.JSX.Element> = {
  week: WeekScreen,
  dishes: DishesScreen,
  shopping: ShoppingScreen,
  freezer: FreezerScreen,
  more: MoreScreen,
};

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Only a tab switch scrolls to top; closing a form keeps the list position.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.tab]);

  // Recipe books (SPEC §1.1): added once to the user's library, next to their own dishes.
  const [bookNotice, setBookNotice] = useState<string | null>(null);
  useEffect(() => {
    ensureBookLibrary()
      .then((r) => {
        if (r && r.added + r.enriched > 0) {
          setBookNotice(
            `Добавлены рецепты из книг: ${r.added} блюд и заготовок${r.enriched ? `, ещё ${r.enriched} ваших блюд получили рецепт` : ''}.`,
          );
        }
      })
      .catch((e: unknown) => console.error('Book library import failed', e));
  }, []);

  useEffect(() => {
    if (!bookNotice) return;
    const t = window.setTimeout(() => setBookNotice(null), 8000);
    return () => window.clearTimeout(t);
  }, [bookNotice]);

  const ActiveScreen = SCREENS[route.tab];

  return (
    <div className="min-h-full pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
      <main>
        <ActiveScreen path={route.path} />
      </main>
      {bookNotice && (
        <div className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 flex items-start gap-3 rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white shadow-lg">
          <p className="flex-1 py-1">{bookNotice}</p>
          <button
            type="button"
            onClick={() => setBookNotice(null)}
            aria-label="Закрыть"
            className="-my-1 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-lg text-stone-300"
          >
            ×
          </button>
        </div>
      )}
      <BottomNav active={route.tab} />
    </div>
  );
}
