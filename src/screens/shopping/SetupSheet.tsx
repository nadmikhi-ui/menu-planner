import { useState, type FormEvent } from 'react';
import { Sheet } from '../../components/Sheet';
import { Notice, inputClass } from '../../components/ui';
import { OTHER_PLACE_ID } from '../../db/seed';
import { changePlaceName, createPlace, deletePlace, reorderPlace, setStaple } from '../../db/shopping';
import { normalizeProductName } from '../../logic/text';
import { closeRoute } from '../../navigation';
import type { Product, Settings, ShopPlace } from '../../types';

/** Editing shop places and «Постоянные запасы» (SPEC §7). */
export function SetupSheet({ weekId, settings, products }: { weekId: number; settings: Settings; products: Product[] }) {
  const close = () => closeRoute(`#/shopping/${weekId}`);
  return (
    <Sheet title="Места и запасы" onCancel={close} action={<button type="button" onClick={close} className="min-h-11 px-2 font-semibold text-brand-700">Готово</button>}>
      <PlacesAndStaples settings={settings} products={products} />
    </Sheet>
  );
}

/** Shared with the settings screen (SPEC §8). */
export function PlacesAndStaples({ settings, products }: { settings: Settings; products: Product[] }) {
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    try {
      setError(null);
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  const staples = products.filter((p) => p.isStaple).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const places = settings.places;

  return (
    <div className="space-y-8">
      {error && <Notice tone="warning">{error}</Notice>}

      <section>
        <h2 className="mb-1 font-semibold">Места покупки</h2>
        <p className="mb-3 text-sm text-stone-500">В этом порядке идут группы в списке. Новые продукты попадают в «Другое».</p>
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
          {places.map((place, i) => (
            <PlaceRow
              key={place.id}
              place={place}
              canMoveUp={i > 0 && place.id !== OTHER_PLACE_ID}
              canMoveDown={i < places.length - 1 && places[i + 1]!.id !== OTHER_PLACE_ID && place.id !== OTHER_PLACE_ID}
              run={run}
            />
          ))}
        </ul>
        <AddForm placeholder="Новое место" label="Добавить место" onAdd={(name) => run(() => createPlace(name))} />
      </section>

      <section>
        <h2 className="mb-1 font-semibold">Постоянные запасы</h2>
        <p className="mb-3 text-sm text-stone-500">
          Эти продукты обычно есть дома, поэтому не попадают в список покупок. При необходимости их можно добавить в
          список вручную.
        </p>
        {staples.length > 0 && (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            {staples.map((p) => (
              <li key={p.id} className="flex min-h-12 items-center px-4">
                <span className="flex-1">{p.name}</span>
                <button
                  type="button"
                  onClick={() => void run(() => setStaple(p.name, false))}
                  className="min-h-11 px-1 text-sm text-stone-500"
                >
                  Убрать
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddForm
          placeholder="Например, мука"
          label="Добавить запас"
          onAdd={(name) => run(() => setStaple(normalizeProductName(name), true))}
        />
      </section>
    </div>
  );
}

function PlaceRow({
  place,
  canMoveUp,
  canMoveDown,
  run,
}: {
  place: ShopPlace;
  canMoveUp: boolean;
  canMoveDown: boolean;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState(place.name);
  const isOther = place.id === OTHER_PLACE_ID;

  const rename = async () => {
    if (name === place.name) return;
    if (!(await run(() => changePlaceName(place.id, name)))) setName(place.name);
  };

  const remove = () => {
    if (window.confirm(`Удалить место «${place.name}»? Его продукты перейдут в «Другое».`)) {
      void run(() => deletePlace(place.id));
    }
  };

  const arrow = 'flex h-11 w-11 shrink-0 items-center justify-center text-stone-500 disabled:text-stone-200';
  return (
    <li className="flex items-center gap-1 pl-2 pr-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void rename()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        aria-label="Название места"
        className="min-h-12 min-w-0 flex-1 rounded-lg px-2 focus:bg-stone-50 focus:outline-none"
      />
      <button type="button" aria-label="Выше" disabled={!canMoveUp} onClick={() => void run(() => reorderPlace(place.id, -1))} className={arrow}>
        ↑
      </button>
      <button type="button" aria-label="Ниже" disabled={!canMoveDown} onClick={() => void run(() => reorderPlace(place.id, 1))} className={arrow}>
        ↓
      </button>
      {isOther ? (
        <span className="w-16" />
      ) : (
        <button type="button" onClick={remove} className="min-h-11 w-16 shrink-0 text-sm text-red-700">
          Удалить
        </button>
      )}
    </li>
  );
}

function AddForm({ placeholder, label, onAdd }: { placeholder: string; label: string; onAdd: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && (await onAdd(name))) setName('');
  };
  return (
    <form onSubmit={submit} className="mt-3 flex gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label={label} className={inputClass} />
      <button
        type="submit"
        disabled={!name.trim()}
        className="min-h-12 shrink-0 rounded-xl px-4 font-medium text-brand-700 ring-1 ring-brand-600 disabled:text-stone-400 disabled:ring-stone-300"
      >
        Добавить
      </button>
    </form>
  );
}
