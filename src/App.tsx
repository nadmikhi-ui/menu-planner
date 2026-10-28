import { useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
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

  const ActiveScreen = SCREENS[route.tab];

  return (
    <div className="min-h-full pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
      <main>
        <ActiveScreen path={route.path} />
      </main>
      <BottomNav active={route.tab} />
    </div>
  );
}
