import { TABS, type TabId } from '../navigation';
import { TabIcon } from './icons';

interface Props {
  active: TabId;
}

export function BottomNav({ active }: Props) {
  return (
    <nav
      aria-label="Основное меню"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-xl">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <li key={tab.id} className="flex-1">
              <a
                href={`#/${tab.id}`}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  isActive ? 'text-brand-700' : 'text-stone-500'
                }`}
              >
                <TabIcon id={tab.id} className="h-6 w-6" />
                {tab.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
