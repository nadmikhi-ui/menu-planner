import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { FieldLabel, Notice, inputClass } from '../../components/ui';
import { addPrepTask, completePrepTask, removePrepTask, undoPrepTask } from '../../db/freezer';
import { formatWeekRange, today } from '../../logic/dates';
import { prepIdeas } from '../../logic/freezer';
import { closeRoute, openRoute } from '../../navigation';
import { PREP_SOURCE_LABELS, PREP_TYPE_LABELS, type Dish, type PrepTask, type Week } from '../../types';

/** «Заморозить на этой неделе» tasks with «Сделано» (SPEC §6). Shared by the week and freezer screens. */
export function PrepTaskList({
  tasks,
  dishesById,
  weeksById,
  doneRoute,
  editable,
}: {
  tasks: PrepTask[];
  dishesById: Map<number, Dish>;
  /** Shows the week of each task (freezer screen). */
  weeksById?: Map<number, Week>;
  doneRoute: (task: PrepTask) => string;
  editable: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<unknown>) => {
    setError(null);
    action().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.id ?? 0) - (b.id ?? 0));

  return (
    <>
      {error && <Notice tone="warning">{error}</Notice>}
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {sorted.map((task) => {
          const dish = dishesById.get(task.dishId);
          const week = weeksById?.get(task.weekId);
          return (
            <li key={task.id} className="flex min-h-14 items-center gap-2 py-2 pr-2 pl-4">
              <span className="min-w-0 flex-1">
                <span className={`block ${task.done ? 'text-stone-400' : ''}`}>
                  {task.done && <span className="mr-1 text-brand-700">✓</span>}
                  {dish?.name ?? 'Блюдо удалено'}
                </span>
                <span className="block text-xs text-stone-500">
                  {[week && formatWeekRange(week.startDate), task.done ? 'в морозилке' : dish?.prepSource && PREP_SOURCE_LABELS[dish.prepSource]]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {editable &&
                (task.done ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Снять отметку «Сделано»? Запись уберётся из «Сейчас в морозилке».')) {
                        run(() => undoPrepTask(task.id!));
                      }
                    }}
                    className="min-h-11 shrink-0 px-2 text-sm text-stone-500"
                  >
                    Отменить
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openRoute(doneRoute(task))}
                      className="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium text-brand-700 ring-1 ring-brand-600"
                    >
                      Сделано
                    </button>
                    <button
                      type="button"
                      aria-label={`Убрать «${dish?.name ?? ''}» из плана`}
                      onClick={() => run(() => removePrepTask(task.id!))}
                      className="flex h-11 w-9 shrink-0 items-center justify-center text-xl text-stone-400"
                    >
                      ×
                    </button>
                  </>
                ))}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** «Сделано»: when it was frozen and how much, then it appears in «Сейчас в морозилке». */
export function CompletePrepSheet({ task, dish, fallback }: { task: PrepTask; dish?: Dish; fallback: string }) {
  const [frozenAt, setFrozenAt] = useState(today());
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = () => closeRoute(fallback);

  const save = async () => {
    try {
      await completePrepTask(task.id!, { frozenAt, quantity });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Sheet title="Сделано" onCancel={close}>
      <div className="space-y-5">
        <p className="text-lg font-medium">{dish?.name ?? 'Заготовка'}</p>
        <div>
          <FieldLabel htmlFor="prep-date">Дата заморозки</FieldLabel>
          <input id="prep-date" type="date" value={frozenAt} max={today()} onChange={(e) => setFrozenAt(e.target.value)} className={inputClass} />
        </div>
        <div>
          <FieldLabel htmlFor="prep-quantity">Количество</FieldLabel>
          <input
            id="prep-quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Например, 3 пакета"
            className={inputClass}
          />
        </div>
        {error && <Notice tone="warning">{error}</Notice>}
        <button
          type="button"
          onClick={() => void save()}
          className="min-h-12 w-full rounded-xl bg-brand-700 font-semibold text-white active:bg-brand-800"
        >
          В морозилку
        </button>
      </div>
    </Sheet>
  );
}

/** Choosing a prep idea for the week. */
export function PrepIdeaPicker({ week, dishes, tasks, fallback }: { week: Week; dishes: Dish[]; tasks: PrepTask[]; fallback: string }) {
  const [error, setError] = useState<string | null>(null);
  const close = () => closeRoute(fallback);
  const planned = new Set(tasks.filter((t) => t.weekId === week.id).map((t) => t.dishId));
  const groups = prepIdeas(dishes);

  const choose = async (dishId: number) => {
    try {
      await addPrepTask(week.id!, dishId);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Sheet title="Заготовка" onCancel={close}>
      <p className="mb-3 text-sm text-stone-500">
        Заморозить на неделе {formatWeekRange(week.startDate)}. Ингредиенты попадут в список покупок.
      </p>
      {error && <div className="mb-3"><Notice tone="warning">{error}</Notice></div>}
      {groups.length === 0 && <p className="py-6 text-center text-sm text-stone-500">Идей заготовок пока нет</p>}
      <div className="space-y-4">
        {groups.map((g) => (
          <section key={g.type}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{PREP_TYPE_LABELS[g.type]}</h2>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
              {g.dishes.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    disabled={planned.has(d.id!)}
                    onClick={() => void choose(d.id!)}
                    className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-stone-50 disabled:text-stone-400"
                  >
                    <span className="flex-1">{d.name}</span>
                    {planned.has(d.id!) && <span className="text-xs">уже в плане</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <a href="#/dishes/new/prep" className="mt-4 block py-3 text-center font-medium text-brand-700">
        + Новая идея заготовки
      </a>
    </Sheet>
  );
}
