import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { Chip, FieldLabel, Notice, inputClass } from '../../components/ui';
import { skipDishes, unskipDish } from '../../db/carryover';
import { formatDay } from '../../logic/dates';
import { ROLE_LABELS } from '../../logic/week';
import { closeRoute } from '../../navigation';
import { MEAL_LABELS, SKIP_REASON_LABELS, type Dish, type SkipReason, type Slot, type Week } from '../../types';

interface Props {
  week: Week;
  slot: Slot;
  itemIndex: number;
  dishesById: Map<number, Dish>;
}

/** «Пропущено» for one dish or the whole meal of an approved week (SPEC §5). */
export function SkipSheet({ week, slot, itemIndex, dishesById }: Props) {
  const item = slot.items[itemIndex]!;
  const close = () => closeRoute(`#/week/${week.id}`);
  const title = `${MEAL_LABELS[slot.meal]}, ${formatDay(slot.date).toLowerCase()}`;
  const nameOf = (dishId: number | null) => (dishId === null ? '' : (dishesById.get(dishId)?.name ?? 'Блюдо удалено'));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (item.skipped) {
    return (
      <Sheet title="Пропущено" onCancel={close}>
        <p className="text-sm text-stone-500">{title}</p>
        <p className="mt-3 text-lg font-medium">{nameOf(item.dishId)}</p>
        <p className="mt-1 text-stone-600">
          {SKIP_REASON_LABELS[item.skipped.reason]}
          {item.skipped.comment ? ` — ${item.skipped.comment}` : ''}
        </p>
        {error && <div className="mt-4"><Notice tone="warning">{error}</Notice></div>}
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => unskipDish(week.id!, slot.id!, itemIndex))}
          className="mt-6 min-h-12 w-full rounded-xl font-medium text-stone-700 ring-1 ring-stone-300 active:bg-stone-100"
        >
          Снять отметку «Пропущено»
        </button>
        <p className="mt-2 text-sm text-stone-500">Блюдо снова будет считаться приготовленным и уйдёт из очереди переноса.</p>
      </Sheet>
    );
  }

  return <SkipForm title={title} week={week} slot={slot} itemIndex={itemIndex} nameOf={nameOf} run={run} busy={busy} error={error} />;
}

function SkipForm({
  title,
  week,
  slot,
  itemIndex,
  nameOf,
  run,
  busy,
  error,
}: {
  title: string;
  week: Week;
  slot: Slot;
  itemIndex: number;
  nameOf: (dishId: number | null) => string;
  run: (action: () => Promise<void>) => void;
  busy: boolean;
  error: string | null;
}) {
  const choices = slot.items.map((item, index) => ({ item, index })).filter(({ item }) => item.dishId !== null && !item.skipped);
  const [selected, setSelected] = useState<number[]>([itemIndex]);
  const [reason, setReason] = useState<SkipReason | null>(null);
  const [comment, setComment] = useState('');

  const toggle = (index: number) =>
    setSelected((s) => (s.includes(index) ? s.filter((i) => i !== index) : [...s, index].sort()));
  const canSave = selected.length > 0 && reason !== null && !busy;
  const close = () => closeRoute(`#/week/${week.id}`);

  return (
    <Sheet title="Отметить «Пропущено»" onCancel={close}>
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm text-stone-500">{title}</p>
          {choices.length > 1 && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelected(choices.map((c) => c.index))}
                className="min-h-9 px-2 text-sm font-medium text-brand-700"
              >
                Весь приём пищи
              </button>
            </div>
          )}
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            {choices.map(({ item, index }) => (
              <li key={index}>
                <label className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.includes(index)}
                    onChange={() => toggle(index)}
                    className="h-5 w-5 shrink-0 accent-brand-700"
                  />
                  <span className="flex-1">
                    {choices.length > 1 && <span className="mr-2 text-xs text-stone-400">{ROLE_LABELS[item.role]}</span>}
                    {nameOf(item.dishId)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <FieldLabel>Причина</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SKIP_REASON_LABELS) as SkipReason[]).map((r) => (
              <Chip key={r} selected={reason === r} onClick={() => setReason(r)}>
                {SKIP_REASON_LABELS[r]}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="skip-comment">Комментарий</FieldLabel>
          <textarea
            id="skip-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={reason === 'other' ? 'Что случилось?' : 'Необязательно'}
            className={inputClass}
          />
        </div>

        <p className="text-sm text-stone-500">
          Пропущенные блюда не считаются приготовленными и попадут в очередь «Перенос на следующую неделю».
        </p>
        {error && <Notice tone="warning">{error}</Notice>}

        <button
          type="button"
          disabled={!canSave}
          onClick={() => run(() => skipDishes(week.id!, slot.id!, selected, { reason: reason!, comment }))}
          className="min-h-12 w-full rounded-xl bg-brand-700 font-semibold text-white active:bg-brand-800 disabled:bg-stone-300"
        >
          Отметить «Пропущено»
        </button>
      </div>
    </Sheet>
  );
}
