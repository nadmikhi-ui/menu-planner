import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { EmptyState, Screen } from '../components/Screen';
import { inputClass } from '../components/ui';
import { db, getSettings } from '../db/db';
import { createWeek } from '../db/weeks';
import { defaultNewWeekStart, formatWeekRange, today, weekdayOf } from '../logic/dates';
import { defaultWeek } from '../logic/week';
import type { ScreenProps } from '../navigation';
import { WEEK_STATUS_LABELS, WEEKDAY_LABELS, type Week } from '../types';
import { WeekView } from './week/WeekView';

export function WeekScreen({ path }: ScreenProps) {
  const weeks = useLiveQuery(() => db.weeks.toArray());
  const [creating, setCreating] = useState(false);

  if (!weeks) return <Screen title="Неделя">{null}</Screen>;

  const open = weeks.filter((w) => w.status !== 'done').sort((a, b) => a.startDate.localeCompare(b.startDate));
  const requested = path[0] ? open.find((w) => w.id === Number(path[0])) : undefined;
  const selected = requested ?? defaultWeek(open, today());
  const hasDraft = open.some((w) => w.status === 'draft');

  const select = (week: Week) => window.location.replace(`#/week/${week.id}`);

  return (
    <Screen title="Неделя">
      {(open.length > 1 || (selected && !hasDraft)) && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {open.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => select(w)}
              aria-pressed={w.id === selected?.id}
              className={`min-h-11 shrink-0 rounded-xl px-3 text-left text-sm ${
                w.id === selected?.id ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-stone-300'
              }`}
            >
              <span className="block font-medium">{formatWeekRange(w.startDate)}</span>
              <span className="block text-xs opacity-75">{WEEK_STATUS_LABELS[w.status]}</span>
            </button>
          ))}
          {!hasDraft && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="min-h-11 shrink-0 rounded-xl border border-dashed border-brand-600 px-3 text-sm font-medium text-brand-700"
            >
              + Новая неделя
            </button>
          )}
        </div>
      )}

      {(creating || !selected) && (
        <NewWeekCard
          existingStarts={weeks.map((w) => w.startDate)}
          isFirst={!selected}
          onCreated={(id) => {
            setCreating(false);
            window.location.replace(`#/week/${id}`);
          }}
          onCancel={selected ? () => setCreating(false) : undefined}
        />
      )}

      {selected && !creating && <WeekView key={selected.id} week={selected} path={requested ? path.slice(1) : []} />}
    </Screen>
  );
}

function NewWeekCard({
  existingStarts,
  isFirst,
  onCreated,
  onCancel,
}: {
  existingStarts: string[];
  isFirst: boolean;
  onCreated: (id: number) => void;
  onCancel?: () => void;
}) {
  const settings = useLiveQuery(() => getSettings());
  const [start, setStart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!settings) return null;
  const startDate = start ?? defaultNewWeekStart(today(), settings.weekStartDay, existingStarts);
  const offDay = weekdayOf(startDate) !== settings.weekStartDay;

  const create = async () => {
    try {
      onCreated(await createWeek(startDate));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      {isFirst && (
        <EmptyState
          title="Меню ещё не составлено"
          text="Создайте неделю, затем соберите её автоматически и поправьте, что нужно."
        />
      )}
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-stone-600">Неделя начинается</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStart(e.target.value || null);
              setError(null);
            }}
            className={inputClass}
          />
        </label>
        <p className="text-sm text-stone-500">
          {formatWeekRange(startDate)}
          {offDay && ` · в настройках неделя начинается: ${WEEKDAY_LABELS[settings.weekStartDay].toLowerCase()}`}
        </p>
        {error && <p className="text-sm text-amber-800">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={create}
            className="min-h-12 flex-1 rounded-xl bg-brand-700 font-semibold text-white active:bg-brand-800"
          >
            Создать неделю
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="min-h-12 rounded-xl px-4 text-stone-600 ring-1 ring-stone-300">
              Отмена
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
