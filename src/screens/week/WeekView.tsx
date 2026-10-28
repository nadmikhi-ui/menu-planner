import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Notice } from '../../components/ui';
import { db, getSettings } from '../../db/db';
import {
  addLunchSalad,
  assembleAndSave,
  type AssembleMode,
  changeLunchVariant,
  deleteDraft,
  removeItem,
  rerollDish,
  setWeekStatus,
  weekSlots,
} from '../../db/weeks';
import { formatDay, formatWeekRange, isWeekend } from '../../logic/dates';
import { queueFor } from '../../logic/carryover';
import { historyContext } from '../../logic/history';
import { analyzeWeek, warningText, type ItemWarning } from '../../logic/repeats';
import { ROLE_LABELS, lunchVariant, weekDates } from '../../logic/week';
import { openRoute } from '../../navigation';
import {
  CATEGORY_LABELS,
  MEAL_LABELS,
  SKIP_REASON_LABELS,
  WEEK_STATUS_LABELS,
  type CarryOver,
  type Dish,
  type ISODate,
  type PrepTask,
  type Settings,
  type Slot,
  type Week,
} from '../../types';
import { CompletePrepSheet, PrepIdeaPicker, PrepTaskList } from '../freezer/PrepTasks';
import { CarryOverPanel } from './CarryOverPanel';
import { DishPicker } from './DishPicker';
import { SkipSheet } from './SkipSheet';

export interface WeekData {
  slots: Slot[];
  dishes: Dish[];
  dishesById: Map<number, Dish>;
  lastWeek: Set<number>;
  settings: Settings;
  weeks: Week[];
  /** Pending carry-overs this week can take (SPEC §5). */
  queue: CarryOver[];
  /** Carry-overs to show in the queue panel: pending or placed in a draft. */
  openCarryOvers: CarryOver[];
  slotDates: Map<number, ISODate>;
  /** «Заморозить на этой неделе» (SPEC §6). */
  prepTasks: PrepTask[];
}

/** Everything the week view needs, kept live across all tables it depends on. */
function useWeekData(week: Week): WeekData | undefined {
  return useLiveQuery(async () => {
    const [slots, dishes, weeks, allSlots, settings, carryOvers, prepTasks] = await Promise.all([
      weekSlots(week.id!),
      db.dishes.toArray(),
      db.weeks.toArray(),
      db.slots.toArray(),
      getSettings(),
      db.carryOver.toArray(),
      db.prepTasks.where('weekId').equals(week.id!).toArray(),
    ]);
    const { lastWeek } = historyContext(weeks, allSlots, week);
    const draftIds = new Set(weeks.filter((w) => w.status === 'draft').map((w) => w.id));
    return {
      slots,
      dishes,
      dishesById: new Map(dishes.map((d) => [d.id!, d])),
      lastWeek,
      settings,
      weeks,
      queue: queueFor(carryOvers, weeks, week),
      openCarryOvers: carryOvers.filter(
        (c) => c.status === 'pending' || (c.status === 'placed' && draftIds.has(c.placedWeekId)),
      ),
      slotDates: new Map(allSlots.map((s) => [s.id!, s.date])),
      prepTasks,
    };
  }, [week.id, week.startDate, week.status]);
}

export function WeekView({ week, path }: { week: Week; path: string[] }) {
  const data = useWeekData(week);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const analysis = useMemo(
    () => data && analyzeWeek(data.slots, data.dishes, data.lastWeek, data.settings.repeatPolicy),
    [data],
  );

  if (!data || !analysis) return null;

  const isDraft = week.status === 'draft';
  const weekId = week.id!;
  const filled = data.slots.some((s) => s.items.some((i) => i.dishId !== null));

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const assemble = (mode: AssembleMode) => {
    if (mode === 'all' && filled && !window.confirm('Пересобрать всю неделю? Все выбранные блюда будут заменены.')) {
      return;
    }
    void run(() => assembleAndSave(weekId, undefined, undefined, mode));
  };

  const approve = () => {
    if (analysis.emptyCount > 0 && !window.confirm(`Не заполнено позиций: ${analysis.emptyCount}. Всё равно утвердить?`)) {
      return;
    }
    void run(() => setWeekStatus(weekId, 'approved'));
  };

  const finish = () => {
    if (window.confirm('Завершить неделю? Она уйдёт в историю.')) void run(() => setWeekStatus(weekId, 'done'));
  };

  const remove = () => {
    if (window.confirm('Удалить черновик недели?')) {
      void run(async () => {
        await deleteDraft(weekId);
        window.location.replace('#/week');
      });
    }
  };

  const reroll = (slotId: number, itemIndex: number) =>
    run(async () => {
      if (!(await rerollDish(weekId, slotId, itemIndex))) setMessage('Других блюд в этом разделе нет');
    });

  const routeSlot = data.slots.find((s) => s.id === Number(path[1]));
  const routeItem = Number(path[2]);
  const isApproved = week.status === 'approved';
  const routePrepTask = path[0] === 'prep' ? data.prepTasks.find((t) => t.id === Number(path[1])) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{formatWeekRange(week.startDate)}</h2>
        <Badge>{WEEK_STATUS_LABELS[week.status]}</Badge>
      </div>

      {isDraft && !filled && (
        <button
          type="button"
          onClick={() => assemble('all')}
          disabled={busy}
          className="min-h-12 w-full rounded-xl bg-brand-700 font-semibold text-white active:bg-brand-800 disabled:opacity-60"
        >
          Собрать неделю автоматически
        </button>
      )}
      {isDraft && filled && (
        <div className="flex flex-col gap-2">
          {analysis.emptyCount > 0 && (
            <button
              type="button"
              onClick={() => assemble('empty')}
              disabled={busy}
              className="min-h-12 rounded-xl bg-brand-700 px-3 font-semibold text-white active:bg-brand-800 disabled:opacity-60"
            >
              Заполнить только пустые
            </button>
          )}
          <button
            type="button"
            onClick={() => assemble('all')}
            disabled={busy}
            className={`min-h-12 rounded-xl px-3 font-medium disabled:opacity-60 ${
              analysis.emptyCount > 0
                ? 'text-stone-700 ring-1 ring-stone-300 active:bg-stone-100'
                : 'bg-brand-700 font-semibold text-white active:bg-brand-800'
            }`}
          >
            Пересобрать всё
          </button>
        </div>
      )}

      {message && <Notice tone="neutral">{message}</Notice>}

      {filled && week.status !== 'done' && (analysis.warningCount > 0 || analysis.shortages.length > 0 || analysis.emptyCount > 0) && (
        <Notice tone="warning">
          {analysis.warningCount > 0 && (
            <p className="font-semibold">Предупреждений: {analysis.warningCount}</p>
          )}
          {analysis.shortages.map((c) => (
            <p key={c}>В разделе «{CATEGORY_LABELS[c]}» мало блюд, добавьте ещё.</p>
          ))}
          {analysis.emptyCount > 0 && <p>Не заполнено позиций: {analysis.emptyCount}</p>}
        </Notice>
      )}

      {data.openCarryOvers.length > 0 && week.status !== 'done' && <CarryOverPanel data={data} viewing={week} />}

      {isApproved && (
        <p className="text-sm text-stone-500">Нажмите на блюдо, чтобы отметить «Пропущено».</p>
      )}

      {weekDates(week.startDate).map((date) => (
        <section key={date} className="overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
          <h3 className="flex items-center gap-2 border-b border-stone-100 px-4 py-2.5 font-semibold">
            {formatDay(date)}
            {isWeekend(date) && <span className="text-xs font-medium text-brand-700">выходной</span>}
          </h3>
          {data.slots
            .map((slot, index) => ({ slot, index }))
            .filter(({ slot }) => slot.date === date)
            .map(({ slot, index }) => (
              <MealBlock
                key={slot.id}
                slot={slot}
                warnings={analysis.items[index]!}
                dishesById={data.dishesById}
                editable={isDraft && !busy}
                skippable={isApproved && !busy}
                onPick={(itemIndex) => openRoute(`#/week/${weekId}/pick/${slot.id}/${itemIndex}`)}
                onSkip={(itemIndex) => openRoute(`#/week/${weekId}/skip/${slot.id}/${itemIndex}`)}
                onReroll={(itemIndex) => reroll(slot.id!, itemIndex)}
                onLunchVariant={(variant) => run(() => changeLunchVariant(weekId, slot.id!, variant))}
                onAddSalad={() => run(() => addLunchSalad(weekId, slot.id!))}
                onRemove={(itemIndex) => run(() => removeItem(weekId, slot.id!, itemIndex))}
              />
            ))}
        </section>
      ))}

      {(week.status !== 'done' || data.prepTasks.length > 0) && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Заморозить на этой неделе</h3>
          {data.prepTasks.length > 0 && (
            <PrepTaskList
              tasks={data.prepTasks}
              dishesById={data.dishesById}
              doneRoute={(t) => `#/week/${weekId}/prep/${t.id}`}
              editable={week.status !== 'done'}
            />
          )}
          {week.status !== 'done' && (
            <button
              type="button"
              onClick={() => openRoute(`#/week/${weekId}/prep-add`)}
              className="min-h-11 w-full rounded-xl border border-dashed border-stone-300 text-sm font-medium text-stone-600"
            >
              + Заготовка в морозилку
            </button>
          )}
        </section>
      )}

      <div className="space-y-3 pt-2 pb-4">
        {isDraft && (
          <>
            <button
              type="button"
              onClick={approve}
              disabled={busy || !filled}
              className="min-h-12 w-full rounded-xl bg-stone-800 font-semibold text-white active:bg-stone-900 disabled:opacity-40"
            >
              Утвердить неделю
            </button>
            <button type="button" onClick={remove} disabled={busy} className="min-h-11 w-full text-sm text-stone-500">
              Удалить черновик
            </button>
          </>
        )}
        {week.status === 'approved' && (
          <>
            <button
              type="button"
              onClick={finish}
              disabled={busy}
              className="min-h-12 w-full rounded-xl bg-stone-800 font-semibold text-white active:bg-stone-900"
            >
              Завершить неделю
            </button>
            <button
              type="button"
              onClick={() => void run(() => setWeekStatus(weekId, 'draft'))}
              disabled={busy}
              className="min-h-12 w-full rounded-xl font-medium text-stone-600 ring-1 ring-stone-300"
            >
              Вернуть в черновик
            </button>
          </>
        )}
      </div>

      {isDraft && path[0] === 'pick' && routeSlot?.items[routeItem] && (
        <DishPicker week={week} slot={routeSlot} itemIndex={routeItem} data={data} />
      )}
      {isApproved && path[0] === 'skip' && routeSlot?.items[routeItem] && (
        <SkipSheet week={week} slot={routeSlot} itemIndex={routeItem} dishesById={data.dishesById} />
      )}
      {path[0] === 'prep-add' && (
        <PrepIdeaPicker week={week} dishes={data.dishes} tasks={data.prepTasks} fallback={`#/week/${weekId}`} />
      )}
      {path[0] === 'prep' && routePrepTask && !routePrepTask.done && (
        <CompletePrepSheet task={routePrepTask} dish={data.dishesById.get(routePrepTask.dishId)} fallback={`#/week/${weekId}`} />
      )}
    </div>
  );
}

interface MealBlockProps {
  slot: Slot;
  warnings: ItemWarning[][];
  dishesById: Map<number, Dish>;
  editable: boolean;
  /** Approved week: tapping a dish opens the «Пропущено» panel. */
  skippable: boolean;
  onPick: (itemIndex: number) => void;
  onSkip: (itemIndex: number) => void;
  onReroll: (itemIndex: number) => void;
  onLunchVariant: (variant: 'soup' | 'main') => void;
  onAddSalad: () => void;
  onRemove: (itemIndex: number) => void;
}

function MealBlock({
  slot,
  warnings,
  dishesById,
  editable,
  skippable,
  onPick,
  onSkip,
  onReroll,
  onLunchVariant,
  onAddSalad,
  onRemove,
}: MealBlockProps) {
  const isLunch = slot.meal === 'lunch';
  const variant = lunchVariant(slot.items);
  const multi = slot.items.length > 1 || (isLunch && variant === 'main');

  return (
    <div className="border-b border-stone-100 px-4 py-3 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">{MEAL_LABELS[slot.meal]}</span>
        {isLunch && editable && (
          <div className="flex gap-1 text-xs">
            {(['soup', 'main'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={variant === v}
                onClick={() => variant !== v && onLunchVariant(v)}
                className={`min-h-8 rounded-full px-2.5 font-medium ${
                  variant === v ? 'bg-stone-800 text-white' : 'text-stone-600 ring-1 ring-stone-300'
                }`}
              >
                {v === 'soup' ? 'Суп и т.п.' : 'Основное + гарнир'}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="space-y-1.5">
        {slot.items.map((item, i) => {
          const dish = item.dishId === null ? undefined : dishesById.get(item.dishId);
          // Repeat warnings don't matter once the week is approved.
          const itemWarnings = editable ? (warnings[i] ?? []) : [];
          const optionalSalad = isLunch && item.role === 'salad';
          return (
            <li
              key={`${item.role}-${i}`}
              className={`flex items-stretch gap-1 rounded-xl ${itemWarnings.length ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}
            >
              <button
                type="button"
                disabled={!editable && !(skippable && dish)}
                onClick={() => (editable ? onPick(i) : onSkip(i))}
                className="min-h-11 flex-1 px-2 py-1.5 text-left disabled:cursor-default"
              >
                {multi && <span className="mr-2 text-xs text-stone-400">{ROLE_LABELS[item.role]}</span>}
                <span className={!dish ? 'text-stone-400' : item.skipped ? 'text-stone-400 line-through' : ''}>
                  {dish ? dish.name : editable ? 'Выбрать…' : 'Не выбрано'}
                </span>
                {item.carryOverId !== undefined && !item.skipped && (
                  <span className="ml-2 rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-800">перенос</span>
                )}
                {item.skipped && (
                  <span className="mt-0.5 block text-xs text-stone-500">
                    Пропущено · {SKIP_REASON_LABELS[item.skipped.reason]}
                    {item.skipped.comment ? ` — ${item.skipped.comment}` : ''}
                  </span>
                )}
                {itemWarnings.map((w) => (
                  <span key={w.kind} className="mt-0.5 block text-xs font-medium text-amber-800">
                    ⚠ {warningText(w)}
                  </span>
                ))}
              </button>
              {editable && (
                <button
                  type="button"
                  onClick={() => (optionalSalad ? onRemove(i) : onReroll(i))}
                  aria-label={optionalSalad ? 'Убрать салат' : 'Заменить на другое случайное'}
                  title={optionalSalad ? 'Убрать салат' : 'Заменить на другое случайное'}
                  className="flex w-11 shrink-0 items-center justify-center text-xl text-stone-400 active:text-brand-700"
                >
                  {optionalSalad ? '×' : '↻'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {isLunch && editable && variant === 'main' && !slot.items.some((i) => i.role === 'salad') && (
        <button type="button" onClick={onAddSalad} className="mt-1 min-h-9 px-2 text-sm font-medium text-brand-700">
          + Салат
        </button>
      )}
    </div>
  );
}
