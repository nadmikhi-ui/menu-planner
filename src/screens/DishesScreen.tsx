import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { EmptyState, Screen } from '../components/Screen';
import { Badge, Chip, inputClass } from '../components/ui';
import { db } from '../db/db';
import { matchesSearch, sortByName } from '../logic/dish';
import { openRoute, type ScreenProps } from '../navigation';
import { CATEGORIES, CATEGORY_LABELS, PREP_TYPE_LABELS, PROTEIN_LABELS, type Dish, type DishCategory } from '../types';
import { DishEditor } from './dishes/DishForm';

type Filter = DishCategory | 'all';

/** Short labels for the filter row. */
const FILTER_LABELS: Record<DishCategory, string> = {
  main: 'Основные',
  side: 'Гарниры',
  salad: 'Салаты',
  breakfast: 'Завтраки',
  snack: 'Перекусы',
  lunch: 'Обеды',
  prep: 'Заготовки',
};

export function DishesScreen({ path }: ScreenProps) {
  const dishes = useLiveQuery(() => db.dishes.toArray());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const editing = path[0];

  const counts = useMemo(() => {
    const result = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<DishCategory, number>;
    for (const d of dishes ?? []) if (!d.archived) result[d.category]++;
    return result;
  }, [dishes]);
  const archivedCount = dishes?.filter((d) => d.archived).length ?? 0;

  const visible = useMemo(
    () =>
      sortByName(
        (dishes ?? []).filter(
          (d) => d.archived === showArchived && (filter === 'all' || d.category === filter) && matchesSearch(d, query),
        ),
      ),
    [dishes, filter, query, showArchived],
  );

  const groups = CATEGORIES.map((category) => ({
    category,
    dishes: visible.filter((d) => d.category === category),
  })).filter((g) => g.dishes.length > 0);

  return (
    <>
      <Screen title={showArchived ? 'Архив блюд' : 'Блюда'}>
        {dishes && dishes.length === 0 ? (
          <EmptyState title="Библиотека блюд пуста" text="Нажмите «+», чтобы добавить первое блюдо." />
        ) : (
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по названию или продукту"
              aria-label="Поиск блюд"
              className={inputClass}
            />

            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
                Все
              </Chip>
              {CATEGORIES.map((c) => (
                <Chip key={c} selected={filter === c} onClick={() => setFilter(c)}>
                  {FILTER_LABELS[c]}
                  {!showArchived && <span className="ml-1 opacity-60">{counts[c]}</span>}
                </Chip>
              ))}
            </div>

            {groups.length === 0 ? (
              <p className="py-10 text-center text-sm text-stone-500">
                {query ? 'Ничего не найдено' : showArchived ? 'В архиве пусто' : 'В этом разделе пока нет блюд'}
              </p>
            ) : (
              groups.map((g) => (
                <section key={g.category} className="mt-5">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {CATEGORY_LABELS[g.category]}
                  </h2>
                  <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
                    {g.dishes.map((d) => (
                      <li key={d.id}>
                        <DishRow dish={d} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}

            {(showArchived || archivedCount > 0) && (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="mx-auto mt-6 block min-h-11 px-4 text-sm font-medium text-stone-500 underline-offset-2 active:underline"
              >
                {showArchived ? '← Вернуться к блюдам' : `Архив (${archivedCount})`}
              </button>
            )}
          </>
        )}
      </Screen>

      {!editing && (
        <button
          type="button"
          onClick={() => openRoute('#/dishes/new')}
          aria-label="Добавить блюдо"
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-3xl leading-none text-white shadow-lg active:bg-brand-800"
        >
          +
        </button>
      )}

      {editing && <DishEditor key={path.join('/')} idParam={editing} preset={path[1]} />}
    </>
  );
}

function DishRow({ dish }: { dish: Dish }) {
  const badges: string[] = [];
  if (dish.category === 'main') {
    if (dish.protein) badges.push(PROTEIN_LABELS[dish.protein]);
    if (dish.standalone) badges.push('без гарнира');
  }
  if (dish.category === 'prep' && dish.prepType) badges.push(PREP_TYPE_LABELS[dish.prepType]);

  return (
    <button
      type="button"
      onClick={() => openRoute(`#/dishes/${dish.id}`)}
      className="block w-full px-4 py-3 text-left active:bg-stone-50"
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{dish.name}</span>
        {badges.map((b) => (
          <Badge key={b}>{b}</Badge>
        ))}
      </span>
      {dish.ingredients.length > 0 && (
        <span className="mt-0.5 block truncate text-sm text-stone-500">{dish.ingredients.join(', ')}</span>
      )}
    </button>
  );
}
