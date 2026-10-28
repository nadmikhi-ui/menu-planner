import { cancelCarryOver, setHaveIngredients } from '../../db/carryover';
import { formatDay, formatWeekRange } from '../../logic/dates';
import { SKIP_REASON_LABELS, type Week } from '../../types';
import type { WeekData } from './WeekView';

/** «Перенос на следующую неделю»: skipped dishes waiting for (or placed in) a draft (SPEC §5). */
export function CarryOverPanel({ data, viewing }: { data: WeekData; viewing: Week }) {
  const weeksById = new Map(data.weeks.map((w) => [w.id, w]));
  const items = [...data.openCarryOvers].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const waitingHere = viewing.status === 'draft' && data.queue.length > 0;

  return (
    <section className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
      <h3 className="font-semibold text-sky-950">
        {viewing.status === 'draft' ? 'Перенесено с прошлой недели' : 'Перенос на следующую неделю'} · {items.length}
      </h3>
      {waitingHere && (
        <p className="mt-1 text-sm text-sky-900">
          «Заполнить только пустые» или «Пересобрать всё» поставят их в начало недели; можно и выбрать вручную в нужном слоте.
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {items.map((c) => {
          const placedIn = c.placedWeekId === undefined ? undefined : weeksById.get(c.placedWeekId);
          const date = data.slotDates.get(c.fromSlotId);
          return (
            <li key={c.id} className="rounded-xl bg-white p-3 ring-1 ring-sky-100">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{data.dishesById.get(c.dishId)?.name ?? 'Блюдо удалено'}</p>
                  <p className="text-xs text-stone-500">
                    {date ? `${formatDay(date)} · ` : ''}
                    {SKIP_REASON_LABELS[c.skipped.reason]}
                    {c.skipped.comment ? ` — ${c.skipped.comment}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-sky-800">
                    {placedIn ? `В неделе ${formatWeekRange(placedIn.startDate)}` : 'Ждёт сборки следующей недели'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Отменить перенос этого блюда?')) void cancelCarryOver(c.id!);
                  }}
                  className="min-h-11 shrink-0 px-1 text-sm text-stone-500"
                >
                  Отменить
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-stone-600">Продукты ещё есть?</span>
                {([true, false] as const).map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    aria-pressed={c.haveIngredients === value}
                    onClick={() => void setHaveIngredients(c.id!, c.haveIngredients === value ? undefined : value)}
                    className={`min-h-11 min-w-11 rounded-full px-3 font-medium ${
                      c.haveIngredients === value ? 'bg-stone-800 text-white' : 'ring-1 ring-stone-300'
                    }`}
                  >
                    {value ? 'Да' : 'Нет'}
                  </button>
                ))}
              </div>
              {c.haveIngredients && (
                <p className="mt-1 text-xs text-stone-500">Продукты для этого блюда не попадут в список покупок.</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
