import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Notice } from '../../components/ui';
import { db, getSettings } from '../../db/db';
import { addPrepTask } from '../../db/freezer';
import {
  assembleAndSave,
  type AssembleMode,
  changeLunchVariant,
  deleteWeek,
  rerollDish,
  setWeekStatus,
  weekSlots,
} from '../../db/weeks';
import type { PrepSupply } from '../../logic/assemble';
import { formatDay, formatWeekRange, isWeekend } from '../../logic/dates';
import { queueFor } from '../../logic/carryover';
import { historyContext } from '../../logic/history';
import { availableSupplies, prepSuggestions, prepsForDish, type PrepSuggestion } from '../../logic/preps';
import { analyzeWeek, warningText, type ItemWarning } from '../../logic/repeats';
import { lunchVariant, weekDates } from '../../logic/week';
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
import { RecipeSheet } from './RecipeSheet';
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
  /** Preps this week builds on: frozen or planned in earlier weeks (SPEC §6.1). */
  supplies: PrepSupply[];
  /** «Заготовить впрок» for the next weeks (SPEC §6.1). */
  suggestions: PrepSuggestion[];
}

/** Everything the week view needs, kept live across all tables it depends on. */
function useWeekData(week: Week): WeekData | undefined {
  return useLiveQuery(async () => {
    const [slots, dishes, weeks, allSlots, settings, carryOvers, allTasks, freezer] = await Promise.all([
      weekSlots(week.id!),
      db.dishes.toArray(),
      db.weeks.toArray(),
      db.slots.toArray(),
      getSettings(),
      db.carryOver.toArray(),
      db.prepTasks.toArray(),
      db.freezer.toArray(),
    ]);
    const prepTasks = allTasks.filter((t) => t.weekId === week.id);
    const { lastWeek } = historyContext(weeks, allSlots, week);
    const supplies = availableSupplies(week, dishes, freezer, allTasks, weeks);
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
      supplies,
      suggestions: prepSuggestions(dishes, supplies, prepTasks, lastWeek),
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
    const question =
      week.status === 'draft'
        ? 'Удалить черновик недели?'
        : 'Удалить неделю целиком? Меню, список покупок и заготовки недели удалятся, отметки «Пропущено» — тоже. То, что уже в морозилке, останется.';
    if (window.confirm(question)) {
      void run(async () => {
        await deleteWeek(weekId);
        window.location.replace(window.location.hash.startsWith('#/more/history') ? '#/more/history' : '#/week');
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
                onRecipe={(dishId) => openRoute(`#/week/${weekId}/recipe/${dishId}`)}
                onReroll={(itemIndex) => reroll(slot.id!, itemIndex)}
                onLunchVariant={(variant) => run(() => changeLunchVariant(weekId, slot.id!, variant))}
                supplies={week.status === 'done' ? [] : data.supplies}
              />
            ))}
        </section>
      ))}

      {(week.status !== 'done' || data.prepTasks.length > 0) && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Заготовки недели</h3>
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

      {week.status !== 'done' && (
        <PrepPlanning
          supplies={data.supplies}
          suggestions={data.suggestions}
          busy={busy}
          onAdd={(prepId) => void run(() => addPrepTask(weekId, prepId))}
        />
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
        <button type="button" onClick={remove} disabled={busy} className="min-h-11 w-full text-sm text-red-700">
          {isDraft ? 'Удалить черновик' : 'Удалить неделю'}
        </button>
      </div>

      {isDraft && path[0] === 'pick' && routeSlot?.items[routeItem] && (
        <DishPicker week={week} slot={routeSlot} itemIndex={routeItem} data={data} />
      )}
      {isApproved && path[0] === 'skip' && routeSlot?.items[routeItem] && (
        <SkipSheet week={week} slot={routeSlot} itemIndex={routeItem} dishesById={data.dishesById} />
      )}
      {path[0] === 'recipe' && data.dishesById.get(Number(path[1])) && (
        <RecipeSheet dish={data.dishesById.get(Number(path[1]))!} fallback={`#/week/${weekId}`} />
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
  /** Opens the recipe of a dish that has one. */
  onRecipe: (dishId: number) => void;
  onReroll: (itemIndex: number) => void;
  onLunchVariant: (variant: 'soup' | 'main') => void;
  /** Available preps: a dish that uses one gets the «❄» mark (SPEC §6.1). */
  supplies: PrepSupply[];
}

function MealBlock({
  slot,
  warnings,
  dishesById,
  editable,
  skippable,
  onPick,
  onSkip,
  onRecipe,
  onReroll,
  onLunchVariant,
  supplies,
}: MealBlockProps) {
  const isLunch = slot.meal === 'lunch';
  const variant = lunchVariant(slot.items);

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
                className={`min-h-11 rounded-full px-2.5 font-medium ${
                  variant === v ? 'bg-stone-800 text-white' : 'text-stone-600 ring-1 ring-stone-300'
                }`}
              >
                {v === 'soup' ? 'Обед / суп' : 'Основное'}
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
          const preps = dish && !item.skipped ? prepsForDish(supplies, dish.id!) : [];
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
                <span className={!dish ? 'text-stone-400' : item.skipped ? 'text-stone-400 line-through' : ''}>
                  {dish ? dish.name : editable ? 'Выбрать…' : 'Не выбрано'}
                </span>
                {item.carryOverId !== undefined && !item.skipped && (
                  <span className="ml-2 rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-800">перенос</span>
                )}
                {preps.length > 0 && (
                  <span className="mt-0.5 block text-xs font-medium text-sky-800">❄ из морозилки: {preps.join(', ')}</span>
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
              {!editable && dish?.recipe && (
                <button
                  type="button"
                  onClick={() => onRecipe(dish.id!)}
                  aria-label={`Рецепт: ${dish.name}`}
                  className="min-h-11 shrink-0 px-2 text-sm font-medium text-brand-700"
                >
                  Рецепт
                </button>
              )}
              {editable && (
                <button
                  type="button"
                  onClick={() => onReroll(i)}
                  aria-label="Заменить на другое случайное"
                  title="Заменить на другое случайное"
                  className="flex w-11 shrink-0 items-center justify-center text-xl text-stone-400 active:text-brand-700"
                >
                  ↻
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * SPEC §6.1: what the week builds on (frozen or planned earlier) and «Заготовить впрок» —
 * preps to make now for the dishes of the next weeks.
 */
function PrepPlanning({
  supplies,
  suggestions,
  busy,
  onAdd,
}: {
  supplies: PrepSupply[];
  suggestions: PrepSuggestion[];
  busy: boolean;
  onAdd: (prepId: number) => void;
}) {
  if (!supplies.length && !suggestions.length) return null;
  return (
    <section className="space-y-3">
      {supplies.length > 0 && (
        <div className="rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-100">
          <p className="font-semibold">❄ Уже есть заготовки</p>
          <p className="mt-0.5">
            {supplies.map((s) => s.name).join(', ')}. При сборке недели блюда под них ставятся в первую очередь.
          </p>
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Заготовить впрок</h3>
            <p className="text-sm text-stone-500">
              На следующие недели: пока заготовка в морозилке, блюда с ней будут попадать в меню.
            </p>
          </div>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            {suggestions.map(({ prep, dishes }) => (
              <li key={prep.id} className="flex items-center gap-2 py-2.5 pr-2 pl-4">
                <span className="min-w-0 flex-1">
                  <span className="block">{prep.name}</span>
                  <span className="line-clamp-2 text-xs text-stone-500">
                    Для {dishes.length} {plural(dishes.length)}: {dishes.slice(0, 2).map((d) => d.name).join('; ')}
                    {dishes.length > 2 ? '…' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAdd(prep.id!)}
                  aria-label={`Добавить «${prep.name}» в план недели`}
                  className="min-h-11 shrink-0 rounded-full px-3 text-sm font-medium text-brand-700 ring-1 ring-brand-600 disabled:opacity-50"
                >
                  В план
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function plural(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'блюда';
  return 'блюд';
}
