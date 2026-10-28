import { useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { inputClass } from '../../components/ui';
import { chooseCarryOver, chooseDish, rerollDish } from '../../db/weeks';
import { usageCounts } from '../../logic/assemble';
import { formatDay } from '../../logic/dates';
import { matchesSearch, sortByName } from '../../logic/dish';
import { ITEM_WARNING_LABELS } from '../../logic/repeats';
import { ROLE_CATEGORY, ROLE_LABELS } from '../../logic/week';
import { closeRoute } from '../../navigation';
import { CATEGORY_LABELS, MEAL_LABELS, type Slot, type Week } from '../../types';
import type { WeekData } from './WeekView';

interface Props {
  week: Week;
  slot: Slot;
  itemIndex: number;
  data: WeekData;
}

/** Manual choice for one position: search within the right category, with repeat hints (SPEC §3–4). */
export function DishPicker({ week, slot, itemIndex, data }: Props) {
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const item = slot.items[itemIndex]!;
  const category = ROLE_CATEGORY[item.role];
  const strict = data.settings.repeatPolicy[category] !== 'relaxed';
  const close = () => closeRoute(`#/week/${week.id}`);

  // Usage elsewhere in the week, not counting this position.
  const used = useMemo(
    () =>
      usageCounts(
        data.slots.map((s) => (s.id === slot.id ? { ...s, items: s.items.filter((_, j) => j !== itemIndex) } : s)),
      ),
    [data.slots, slot.id, itemIndex],
  );

  const dishes = sortByName(
    data.dishes.filter((d) => !d.archived && d.category === category && matchesSearch(d, query)),
  );

  // Skipped dishes waiting in the queue that fit this position.
  const carried = data.queue.filter((c) => data.dishesById.get(c.dishId)?.category === category);

  const chooseCarried = async (carryOverId: number) => {
    await chooseCarryOver(week.id!, slot.id!, itemIndex, carryOverId);
    close();
  };

  const choose = async (dishId: number | null) => {
    await chooseDish(week.id!, slot.id!, itemIndex, dishId);
    close();
  };

  const random = async () => {
    if (await rerollDish(week.id!, slot.id!, itemIndex)) close();
    else setMessage('Других блюд в этом разделе нет');
  };

  return (
    <Sheet title={ROLE_LABELS[item.role]} onCancel={close}>
      <p className="mb-3 text-sm text-stone-500">
        {MEAL_LABELS[slot.meal]}, {formatDay(slot.date).toLowerCase()} · раздел «{CATEGORY_LABELS[category]}»
      </p>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={random}
          className="min-h-11 flex-1 rounded-xl bg-stone-200 px-3 text-sm font-medium text-stone-800 active:bg-stone-300"
        >
          ↻ Заменить на другое случайное
        </button>
        {item.dishId !== null && (
          <button
            type="button"
            onClick={() => choose(null)}
            className="min-h-11 rounded-xl px-3 text-sm text-stone-600 ring-1 ring-stone-300"
          >
            Очистить
          </button>
        )}
      </div>
      {message && <p className="mb-3 text-sm text-stone-600">{message}</p>}
      {carried.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-800">Из очереди переноса</h2>
          <ul className="divide-y divide-sky-100 overflow-hidden rounded-2xl bg-sky-50 ring-1 ring-sky-200">
            {carried.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => chooseCarried(c.id!)}
                  className="flex min-h-12 w-full items-center px-4 py-2.5 text-left active:bg-sky-100"
                >
                  {data.dishesById.get(c.dishId)?.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск"
        aria-label="Поиск блюда"
        className={inputClass}
      />
      {dishes.length === 0 ? (
        <div className="py-10 text-center text-sm text-stone-500">
          <p>{query ? 'Ничего не найдено' : 'В этом разделе пока нет блюд'}</p>
          <a href="#/dishes/new" className="mt-2 inline-block font-medium text-brand-700">
            Добавить блюдо
          </a>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
          {dishes.map((d) => {
            const hints = strict
              ? [
                  ...(used.has(d.id!) ? [ITEM_WARNING_LABELS.duplicate] : []),
                  ...(data.lastWeek.has(d.id!) ? [ITEM_WARNING_LABELS.lastWeek] : []),
                ]
              : [];
            const current = d.id === item.dishId;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => choose(d.id!)}
                  aria-current={current}
                  className={`flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-stone-50 ${
                    current ? 'bg-brand-50' : ''
                  }`}
                >
                  <span className="flex-1">
                    <span className="block">{d.name}</span>
                    {hints.map((h) => (
                      <span key={h} className="block text-xs font-medium text-amber-800">
                        ⚠ {h}
                      </span>
                    ))}
                  </span>
                  {current && <span className="text-brand-700">✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
