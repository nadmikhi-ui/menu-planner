import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { EmptyState, Screen } from '../../components/Screen';
import { Sheet } from '../../components/Sheet';
import { Badge, FieldLabel, Notice, inputClass } from '../../components/ui';
import { db, getSettings } from '../../db/db';
import { repeatAsDraft } from '../../db/weeks';
import { defaultNewWeekStart, formatWeekRange, today } from '../../logic/dates';
import { historyList } from '../../logic/history';
import { closeRoute, openRoute } from '../../navigation';
import { WEEK_STATUS_LABELS, type Slot, type Week } from '../../types';
import { WeekView } from '../week/WeekView';

const BACK = { href: '#/more', label: 'Ещё' };

/** «История недель» (SPEC §8). Open weeks link to the «Неделя» tab; finished ones open here, read-only. */
export function HistoryPage({ path }: { path: string[] }) {
  const data = useLiveQuery(async () => {
    const [weeks, slots] = await Promise.all([db.weeks.toArray(), db.slots.toArray()]);
    return { weeks, slots };
  });
  if (!data) return <Screen title="История недель" back={BACK}>{null}</Screen>;

  const selected = path[0] ? data.weeks.find((w) => w.id === Number(path[0])) : undefined;
  if (selected) return <HistoryWeek week={selected} weeks={data.weeks} repeating={path[1] === 'repeat'} />;

  const weeks = historyList(data.weeks);
  return (
    <Screen title="История недель" back={BACK}>
      {weeks.length === 0 ? (
        <EmptyState title="Недель пока нет" text="Здесь появятся все недели меню — и текущие, и прошлые." />
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
          {weeks.map((w) => (
            <li key={w.id}>
              <a
                href={w.status === 'done' ? `#/more/history/${w.id}` : `#/week/${w.id}`}
                className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-stone-50"
              >
                <span className="flex-1">
                  <span className="block font-medium">{formatWeekRange(w.startDate)}</span>
                  <span className="block text-xs text-stone-500">{weekSummary(w, data.slots)}</span>
                </span>
                <Badge>{WEEK_STATUS_LABELS[w.status]}</Badge>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}

/** «18 блюд · 2 пропущено» */
function weekSummary(week: Week, slots: Slot[]): string {
  const items = slots.filter((s) => s.weekId === week.id).flatMap((s) => s.items.filter((i) => i.dishId !== null));
  const skipped = items.filter((i) => i.skipped).length;
  return [`блюд: ${items.length}`, skipped ? `пропущено: ${skipped}` : ''].filter(Boolean).join(' · ');
}

function HistoryWeek({ week, weeks, repeating }: { week: Week; weeks: Week[]; repeating: boolean }) {
  return (
    <Screen title="История недель" back={{ href: '#/more/history', label: 'История' }}>
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => openRoute(`#/more/history/${week.id}/repeat`)}
          className="min-h-12 w-full rounded-xl bg-brand-700 font-semibold text-white active:bg-brand-800"
        >
          Повторить как черновик
        </button>
        <WeekView key={week.id} week={week} path={[]} />
      </div>
      {repeating && <RepeatSheet week={week} weeks={weeks} />}
    </Screen>
  );
}

function RepeatSheet({ week, weeks }: { week: Week; weeks: Week[] }) {
  const settings = useLiveQuery(() => getSettings());
  const [start, setStart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => closeRoute(`#/more/history/${week.id}`);
  const draft = weeks.find((w) => w.status === 'draft');

  if (!settings) return null;
  const startDate = start ?? defaultNewWeekStart(today(), settings.weekStartDay, weeks.map((w) => w.startDate));

  const create = async () => {
    try {
      const id = await repeatAsDraft(week.id!, startDate);
      window.location.replace(`#/week/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Sheet title="Повторить неделю" onCancel={close}>
      <div className="space-y-5">
        <p className="text-stone-600">
          Блюда недели {formatWeekRange(week.startDate)} встанут на те же дни новой недели. Отметки «Пропущено» не
          переносятся, блюда из архива останутся пустыми позициями.
        </p>
        {draft ? (
          <Notice tone="warning">
            Уже есть черновик на {formatWeekRange(draft.startDate)}. Утвердите или удалите его, затем повторите.
          </Notice>
        ) : (
          <>
            <div>
              <FieldLabel htmlFor="repeat-start">Новая неделя начинается</FieldLabel>
              <input
                id="repeat-start"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStart(e.target.value || null);
                  setError(null);
                }}
                className={inputClass}
              />
              <p className="mt-1.5 text-sm text-stone-500">{formatWeekRange(startDate)}</p>
            </div>
            {error && <Notice tone="warning">{error}</Notice>}
            <button
              type="button"
              onClick={() => void create()}
              className="min-h-12 w-full rounded-xl bg-brand-700 font-semibold text-white active:bg-brand-800"
            >
              Создать черновик
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
