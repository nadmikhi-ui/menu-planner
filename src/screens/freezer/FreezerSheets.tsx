import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { FieldLabel, Notice, inputClass } from '../../components/ui';
import { addFreezerItem, addPrepTask, finishFreezerItem, updateFreezerItem, useFreezerPart } from '../../db/freezer';
import { formatWeekRange, today } from '../../logic/dates';
import { validateFreezerDraft, type FreezerDraft } from '../../logic/freezer';
import { closeRoute } from '../../navigation';
import type { Dish, FreezerItem, Week } from '../../types';

const close = () => closeRoute('#/freezer');

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Adding a record to «Сейчас в морозилке» by hand, or editing one. */
export function FreezerItemSheet({ item }: { item?: FreezerItem }) {
  const [draft, setDraft] = useState<FreezerDraft>(
    item ? { name: item.name, frozenAt: item.frozenAt, quantity: item.quantity } : { name: '', frozenAt: today(), quantity: '' },
  );
  const [error, setError] = useState<string | null>(null);
  const canSave = validateFreezerDraft(draft, today()).length === 0;
  const update = (patch: Partial<FreezerDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = async () => {
    try {
      if (item) await updateFreezerItem(item.id!, draft);
      else await addFreezerItem(draft);
      close();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const finish = async () => {
    if (!item || !window.confirm(`«${item.name}» закончилось?`)) return;
    await finishFreezerItem(item.id!);
    close();
  };

  const action = (
    <button type="button" onClick={() => void save()} disabled={!canSave} className="min-h-11 px-2 font-semibold text-brand-700 disabled:text-stone-300">
      Сохранить
    </button>
  );

  return (
    <Sheet title={item ? 'Заготовка' : 'В морозилку'} onCancel={close} action={action}>
      <div className="space-y-5">
        <div>
          <FieldLabel htmlFor="freezer-name">Название</FieldLabel>
          <input
            id="freezer-name"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Например, фарш говяжий"
            autoFocus={!item}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel htmlFor="freezer-date">Дата заморозки</FieldLabel>
          <input
            id="freezer-date"
            type="date"
            value={draft.frozenAt}
            max={today()}
            onChange={(e) => update({ frozenAt: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel htmlFor="freezer-quantity">Количество</FieldLabel>
          <input
            id="freezer-quantity"
            value={draft.quantity}
            onChange={(e) => update({ quantity: e.target.value })}
            placeholder="Например, 3 пакета"
            className={inputClass}
          />
        </div>
        {error && <Notice tone="warning">{error}</Notice>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          className="min-h-12 w-full rounded-xl bg-brand-700 font-semibold text-white active:bg-brand-800 disabled:bg-stone-300"
        >
          Сохранить
        </button>
        {item && (
          <button
            type="button"
            onClick={() => void finish()}
            className="min-h-12 w-full rounded-xl font-medium text-stone-700 ring-1 ring-stone-300 active:bg-stone-100"
          >
            Закончилось
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** «Использовала часть»: how much is left. */
export function UsePartSheet({ item }: { item: FreezerItem }) {
  const [quantity, setQuantity] = useState(item.quantity);

  const save = async () => {
    await useFreezerPart(item.id!, quantity);
    close();
  };

  return (
    <Sheet title="Использовала часть" onCancel={close}>
      <div className="space-y-5">
        <p className="text-lg font-medium">{item.name}</p>
        <div>
          <FieldLabel htmlFor="freezer-left">Сколько осталось?</FieldLabel>
          <input
            id="freezer-left"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Например, 1 пакет"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            className={inputClass}
          />
        </div>
        <button
          type="button"
          onClick={() => void save()}
          className="min-h-12 w-full rounded-xl bg-brand-700 font-semibold text-white active:bg-brand-800"
        >
          Сохранить
        </button>
      </div>
    </Sheet>
  );
}

/** «В план недели» when there is more than one open week. */
export function PlanWeekSheet({ dish, weeks, planned }: { dish: Dish; weeks: Week[]; planned: Set<number> }) {
  const [error, setError] = useState<string | null>(null);
  const close = () => closeRoute('#/freezer/ideas');
  const choose = async (weekId: number) => {
    try {
      await addPrepTask(weekId, dish.id!);
      close();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Sheet title="В план недели" onCancel={close}>
      <p className="mb-3 text-lg font-medium">{dish.name}</p>
      <p className="mb-3 text-sm text-stone-500">На какой неделе заморозить? Ингредиенты попадут в список покупок.</p>
      {error && <div className="mb-3"><Notice tone="warning">{error}</Notice></div>}
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {weeks.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              disabled={planned.has(w.id!)}
              onClick={() => void choose(w.id!)}
              className="flex min-h-12 w-full items-center px-4 py-2.5 text-left active:bg-stone-50 disabled:text-stone-400"
            >
              <span className="flex-1">{formatWeekRange(w.startDate)}</span>
              {planned.has(w.id!) && <span className="text-xs">уже в плане</span>}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
