import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { EmptyState, Screen } from '../components/Screen';
import { Notice } from '../components/ui';
import { db, getSettings } from '../db/db';
import { addPrepTask, finishFreezerItem, restoreFreezerItem } from '../db/freezer';
import { formatDate, formatWeekRange, today } from '../logic/dates';
import { formatAge, freezerStock, prepIdeas } from '../logic/freezer';
import { openRoute, type ScreenProps } from '../navigation';
import { PREP_SOURCE_LABELS, PREP_TYPE_LABELS, type Dish, type PrepTask, type Week } from '../types';
import { FreezerItemSheet, PlanWeekSheet, UsePartSheet } from './freezer/FreezerSheets';
import { CompletePrepSheet, PrepTaskList } from './freezer/PrepTasks';

function useFreezerData() {
  return useLiveQuery(async () => {
    const [items, dishes, weeks, tasks, settings] = await Promise.all([
      db.freezer.toArray(),
      db.dishes.toArray(),
      db.weeks.toArray(),
      db.prepTasks.toArray(),
      getSettings(),
    ]);
    const openWeeks = weeks.filter((w) => w.status !== 'done').sort((a, b) => a.startDate.localeCompare(b.startDate));
    const openIds = new Set(openWeeks.map((w) => w.id));
    return {
      items,
      dishes,
      dishesById: new Map(dishes.map((d) => [d.id!, d])),
      openWeeks,
      weeksById: new Map(weeks.map((w) => [w.id!, w])),
      openTasks: tasks.filter((t) => openIds.has(t.weekId)),
      maxMonths: settings.freezerMaxAgeMonths,
    };
  });
}

type FreezerData = NonNullable<ReturnType<typeof useFreezerData>>;

/**
 * «Морозилка» (SPEC §6): `#/freezer` — what is frozen now, `#/freezer/ideas` — prep ideas.
 * Sheets: `new`, `item/<id>`, `use/<id>`, `done/<taskId>`, `plan/<dishId>`.
 */
export function FreezerScreen({ path }: ScreenProps) {
  const data = useFreezerData();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!data) return <Screen title="Морозилка">{null}</Screen>;

  const ideasTab = path[0] === 'ideas' || path[0] === 'plan';
  const stockCount = data.items.filter((i) => i.status === 'in_stock').length;
  const ideaCount = data.dishes.filter((d) => d.category === 'prep' && !d.archived).length;
  const routeId = Number(path[1]);
  const routeItem = data.items.find((i) => i.id === routeId);
  const routeTask = data.openTasks.find((t) => t.id === routeId);
  const routeDish = data.dishesById.get(routeId);

  return (
    <>
      <Screen title="Морозилка">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-stone-200/70 p-1">
          {[
            { label: `В морозилке · ${stockCount}`, hash: '#/freezer', active: !ideasTab },
            { label: `Идеи · ${ideaCount}`, hash: '#/freezer/ideas', active: ideasTab },
          ].map((tab) => (
            <button
              key={tab.hash}
              type="button"
              aria-pressed={tab.active}
              onClick={() => window.location.replace(tab.hash)}
              className={`min-h-10 rounded-lg text-sm font-medium ${tab.active ? 'bg-white shadow-sm' : 'text-stone-600'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {message && <div className="mb-4"><Notice tone="neutral">{message}</Notice></div>}
        {ideasTab ? <IdeasTab data={data} onMessage={setMessage} /> : <StockTab data={data} />}
      </Screen>

      {!ideasTab && (
        <button
          type="button"
          onClick={() => openRoute('#/freezer/new')}
          aria-label="Добавить в морозилку"
          className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-3xl leading-none text-white shadow-lg active:bg-brand-800"
        >
          +
        </button>
      )}

      {path[0] === 'new' && <FreezerItemSheet />}
      {path[0] === 'item' && routeItem && <FreezerItemSheet key={routeItem.id} item={routeItem} />}
      {path[0] === 'use' && routeItem && <UsePartSheet key={routeItem.id} item={routeItem} />}
      {path[0] === 'done' && routeTask && !routeTask.done && (
        <CompletePrepSheet task={routeTask} dish={data.dishesById.get(routeTask.dishId)} fallback="#/freezer" />
      )}
      {path[0] === 'plan' && routeDish && (
        <PlanWeekSheet
          dish={routeDish}
          weeks={data.openWeeks}
          planned={new Set(data.openTasks.filter((t) => t.dishId === routeDish.id).map((t) => t.weekId))}
        />
      )}
    </>
  );
}

function StockTab({ data }: { data: FreezerData }) {
  const now = today();
  const stock = freezerStock(data.items, now, data.maxMonths);
  const oldCount = stock.filter((s) => s.old).length;
  const finished = data.items
    .filter((i) => i.status === 'finished')
    .sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
    .slice(0, 20);

  return (
    <div className="space-y-4">
      {data.openTasks.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Заморозить на этой неделе</h2>
          <PrepTaskList
            tasks={data.openTasks}
            dishesById={data.dishesById}
            weeksById={data.openWeeks.length > 1 ? data.weeksById : undefined}
            doneRoute={(t) => `#/freezer/done/${t.id}`}
            editable
          />
        </section>
      )}

      {stock.length === 0 ? (
        <EmptyState
          title="В морозилке пока ничего нет"
          text="Добавьте то, что уже заморожено, кнопкой «+». Заготовки из плана недели попадут сюда после отметки «Сделано»."
        />
      ) : (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Сейчас в морозилке</h2>
          {oldCount > 0 && (
            <div className="mb-3">
              <Notice tone="warning">
                Лежит {data.maxMonths} мес. и дольше: {oldCount}. Используйте в первую очередь или проверьте.
              </Notice>
            </div>
          )}
          <ul className="space-y-2">
            {stock.map(({ item, months, old }) => (
              <li key={item.id} className={`rounded-2xl bg-white p-3 ring-1 ${old ? 'ring-amber-300' : 'ring-stone-200'}`}>
                <button
                  type="button"
                  onClick={() => openRoute(`#/freezer/item/${item.id}`)}
                  className="block w-full text-left"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="flex-1 font-medium">{item.name}</span>
                    {item.quantity && <span className="text-sm text-stone-600">{item.quantity}</span>}
                  </span>
                  <span className={`block text-xs ${old ? 'font-medium text-amber-800' : 'text-stone-500'}`}>
                    {old && '⚠ '}заморожено {formatDate(item.frozenAt, now)} · {formatAge(months)}
                  </span>
                </button>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openRoute(`#/freezer/use/${item.id}`)}
                    className="min-h-10 flex-1 rounded-xl text-sm font-medium text-stone-700 ring-1 ring-stone-300 active:bg-stone-100"
                  >
                    Использовала часть
                  </button>
                  <button
                    type="button"
                    onClick={() => void finishFreezerItem(item.id!)}
                    className="min-h-10 flex-1 rounded-xl text-sm font-medium text-stone-700 ring-1 ring-stone-300 active:bg-stone-100"
                  >
                    Закончилось
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {finished.length > 0 && (
        <details className="rounded-2xl bg-white ring-1 ring-stone-200">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-medium text-stone-700">
            Закончилось недавно · {finished.length}
          </summary>
          <ul className="divide-y divide-stone-100 border-t border-stone-100">
            {finished.map((item) => (
              <li key={item.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                <span className="flex-1">
                  <span className="block text-stone-600">{item.name}</span>
                  <span className="block text-xs text-stone-500">заморожено {formatDate(item.frozenAt, now)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void restoreFreezerItem(item.id!)}
                  className="min-h-9 shrink-0 px-1 text-sm font-medium text-brand-700"
                >
                  Вернуть
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="h-16" />
    </div>
  );
}

function IdeasTab({ data, onMessage }: { data: FreezerData; onMessage: (message: string) => void }) {
  const groups = prepIdeas(data.dishes);

  const plan = async (dish: Dish) => {
    if (data.openWeeks.length === 0) {
      onMessage('Сначала создайте неделю на экране «Неделя»');
      return;
    }
    if (data.openWeeks.length > 1) {
      openRoute(`#/freezer/plan/${dish.id}`);
      return;
    }
    const week = data.openWeeks[0]!;
    try {
      await addPrepTask(week.id!, dish.id!);
      onMessage(`«${dish.name}» — в плане на ${formatWeekRange(week.startDate)}`);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => openRoute('#/dishes/new/prep')}
        className="min-h-11 w-full rounded-xl border border-dashed border-brand-600 text-sm font-medium text-brand-700"
      >
        + Новая идея заготовки
      </button>
      {groups.length === 0 && (
        <EmptyState
          title="Идей заготовок пока нет"
          text="Например: смородина для компота, зажарка для борща, рубленая зелень. Их можно добавить в план недели."
        />
      )}
      {groups.map((g) => (
        <section key={g.type}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{PREP_TYPE_LABELS[g.type]}</h2>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            {g.dishes.map((dish) => (
              <IdeaRow key={dish.id} dish={dish} tasks={data.openTasks} weeksById={data.weeksById} onPlan={() => void plan(dish)} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function IdeaRow({
  dish,
  tasks,
  weeksById,
  onPlan,
}: {
  dish: Dish;
  tasks: PrepTask[];
  weeksById: Map<number, Week>;
  onPlan: () => void;
}) {
  const plannedIn = tasks
    .filter((t) => t.dishId === dish.id)
    .map((t) => weeksById.get(t.weekId))
    .filter((w): w is Week => !!w);
  const details = [dish.prepSource && PREP_SOURCE_LABELS[dish.prepSource], dish.ingredients.join(', ')].filter(Boolean).join(' · ');

  return (
    <li className="flex min-h-14 items-center gap-2 py-2 pr-2 pl-4">
      <button type="button" onClick={() => openRoute(`#/dishes/${dish.id}`)} className="min-w-0 flex-1 text-left">
        <span className="block">{dish.name}</span>
        {details && <span className="block truncate text-xs text-stone-500">{details}</span>}
        {plannedIn.length > 0 && (
          <span className="block text-xs font-medium text-brand-700">
            В плане: {plannedIn.map((w) => formatWeekRange(w.startDate)).join(', ')}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onPlan}
        className="min-h-10 shrink-0 rounded-full px-3 text-sm font-medium text-brand-700 ring-1 ring-brand-600"
      >
        В план
      </button>
    </li>
  );
}
