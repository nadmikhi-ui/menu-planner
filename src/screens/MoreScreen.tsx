import { useLiveQuery } from 'dexie-react-hooks';
import { Screen } from '../components/Screen';
import { db } from '../db/db';
import type { ScreenProps } from '../navigation';
import { DataPage } from './more/DataPage';
import { HistoryPage } from './more/HistoryPage';
import { SettingsPage } from './more/SettingsPage';

const SECTIONS = [
  { hash: '#/more/history', title: 'История недель', text: 'Все недели, просмотр любой из них и «Повторить как черновик».' },
  {
    hash: '#/more/settings',
    title: 'Настройки',
    text: 'День начала недели, правила повторов, срок хранения заморозки, места покупок, постоянные запасы.',
  },
  { hash: '#/more/data', title: 'Экспорт и импорт', text: 'Сохранить все данные в файл или загрузить их из файла.' },
];

/** «Ещё» (SPEC §8–9): `#/more/history[/<weekId>[/repeat]]`, `#/more/settings`, `#/more/data`. */
export function MoreScreen({ path }: ScreenProps) {
  switch (path[0]) {
    case 'history':
      return <HistoryPage path={path.slice(1)} />;
    case 'settings':
      return <SettingsPage />;
    case 'data':
      return <DataPage />;
    default:
      return <MoreMenu />;
  }
}

function MoreMenu() {
  const stats = useLiveQuery(async () => ({
    dishes: await db.dishes.count(),
    weeks: await db.weeks.count(),
    products: await db.products.count(),
  }));

  return (
    <Screen title="Ещё">
      <ul className="space-y-3">
        {SECTIONS.map((s) => (
          <li key={s.hash}>
            <a
              href={s.hash}
              className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-stone-200 active:bg-stone-50"
            >
              <span className="flex-1">
                <span className="block font-medium">{s.title}</span>
                <span className="mt-0.5 block text-sm text-stone-500">{s.text}</span>
              </span>
              <span className="text-xl text-stone-400">›</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center text-xs text-stone-400">
        {stats
          ? `Данные на устройстве: блюд — ${stats.dishes}, недель — ${stats.weeks}, продуктов — ${stats.products}`
          : 'Загрузка данных…'}
      </p>
    </Screen>
  );
}
