import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Notice, inputClass } from '../../components/ui';
import { setHaveIngredients } from '../../db/carryover';
import { db, getSettings } from '../../db/db';
import { addManualItem, setItemFlags, shoppingInput } from '../../db/shopping';
import { formatWeekRange } from '../../logic/dates';
import { buildShoppingList, groupByPlace, isDone, shareText, type ShoppingLine } from '../../logic/shopping';
import { normalizeProductName } from '../../logic/text';
import { openRoute } from '../../navigation';
import type { CarryOver, Dish, Week } from '../../types';
import { ProductSheet } from './ProductSheet';
import { SetupSheet } from './SetupSheet';

function useShoppingData(weekId: number) {
  return useLiveQuery(async () => {
    const [input, settings] = await Promise.all([shoppingInput(weekId), getSettings()]);
    return { input, settings, list: buildShoppingList(input) };
  }, [weekId]);
}

export type ShoppingData = NonNullable<ReturnType<typeof useShoppingData>>;

/** «Борщ, Пюре ×2» — which dishes need the product. */
export function sourcesText(line: ShoppingLine, dishesById: Map<number, Dish>): string {
  if (line.sources.length === 0) return 'добавлено вручную';
  return line.sources
    .map((s) => `${s.prep ? 'заготовка: ' : ''}${dishesById.get(s.dishId)?.name ?? 'блюдо удалено'}${s.count > 1 ? ` ×${s.count}` : ''}`)
    .join(', ');
}

export function ShoppingView({ week, path }: { week: Week; path: string[] }) {
  const weekId = week.id!;
  const data = useShoppingData(weekId);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  const groups = useMemo(() => data && groupByPlace(data.list.lines, data.settings.places), [data]);
  if (!data || !groups) return null;

  const { list, input, settings } = data;
  const left = list.lines.filter((l) => !isDone(l)).length;

  const share = async () => {
    const text = shareText(week.startDate, groups);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Список покупок', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setMessage('Список скопирован');
    } catch (e) {
      // The user closed the share dialog.
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setMessage('Не получилось поделиться списком');
    }
  };

  const productRoute = path[0] === 'product' && path[1] ? decodeURIComponent(path[1]) : undefined;
  const productLine = productRoute
    ? [...list.lines, ...list.staples].find((l) => l.productName === productRoute)
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{formatWeekRange(week.startDate)}</h2>
        <span className="text-sm text-stone-500">
          {list.lines.length === 0 ? 'Список пуст' : left === 0 ? 'Всё куплено' : `Осталось купить: ${left}`}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={share}
          disabled={left === 0}
          className="min-h-11 flex-1 rounded-xl bg-brand-700 px-3 font-semibold text-white active:bg-brand-800 disabled:bg-stone-300"
        >
          Поделиться списком
        </button>
        <button
          type="button"
          onClick={() => openRoute(`#/shopping/${weekId}/setup`)}
          className="min-h-11 rounded-xl px-3 text-sm font-medium text-stone-700 ring-1 ring-stone-300 active:bg-stone-100"
        >
          Места и запасы
        </button>
      </div>

      {message && <Notice tone="neutral">{message}</Notice>}

      <CarriedDishes data={data} />

      <AddProduct weekId={weekId} lines={list.lines} onMessage={setMessage} />

      {groups.map(({ place, lines }) => (
        <section key={place.id}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            {place.name} · {lines.filter((l) => !isDone(l)).length}
          </h3>
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            {lines.map((line) => (
              <ProductRow key={line.productName} weekId={weekId} line={line} dishesById={input.dishesById} />
            ))}
          </ul>
        </section>
      ))}

      {list.staples.length > 0 && (
        <details className="rounded-2xl bg-white ring-1 ring-stone-200">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-medium text-stone-700">
            Постоянные запасы · {list.staples.length}
            <span className="ml-auto text-xs font-normal text-stone-500">не входят в список</span>
          </summary>
          <ul className="divide-y divide-stone-100 border-t border-stone-100">
            {list.staples.map((line) => (
              <li key={line.productName} className="flex min-h-12 items-center gap-3 px-4 py-2">
                <span className="flex-1">
                  <span className="block">{line.productName}</span>
                  <span className="block text-xs text-stone-500">{sourcesText(line, input.dishesById)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void addManualItem(weekId, line.productName)}
                  className="min-h-9 shrink-0 rounded-full px-3 text-sm font-medium text-brand-700 ring-1 ring-brand-600"
                >
                  + В список
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {path[0] === 'setup' && <SetupSheet weekId={weekId} settings={settings} products={input.products} />}
      {productLine && <ProductSheet weekId={weekId} line={productLine} data={data} />}
    </div>
  );
}

function ProductRow({ weekId, line, dishesById }: { weekId: number; line: ShoppingLine; dishesById: Map<number, Dish> }) {
  const done = isDone(line);
  return (
    <li className="flex min-h-14 items-center">
      <button
        type="button"
        role="checkbox"
        aria-checked={line.bought}
        aria-label={`Куплено: ${line.productName}`}
        onClick={() => void setItemFlags(weekId, line.productName, { bought: !line.bought })}
        className="flex h-14 w-12 shrink-0 items-center justify-center"
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
            line.bought ? 'bg-brand-700 text-white' : 'ring-2 ring-stone-300'
          }`}
        >
          {line.bought && '✓'}
        </span>
      </button>
      <button
        type="button"
        onClick={() => openRoute(`#/shopping/${weekId}/product/${encodeURIComponent(line.productName)}`)}
        className="min-w-0 flex-1 py-2 text-left"
      >
        <span className={`block ${line.bought ? 'text-stone-400 line-through' : done ? 'text-stone-400' : ''}`}>
          {line.productName}
          {line.uses > 1 && <span className="ml-1.5 text-sm text-stone-500">×{line.uses}</span>}
        </span>
        <span className="block truncate text-xs text-stone-500">{sourcesText(line, dishesById)}</span>
      </button>
      <button
        type="button"
        aria-pressed={line.haveAtHome}
        onClick={() => void setItemFlags(weekId, line.productName, { haveAtHome: !line.haveAtHome })}
        className="flex h-14 shrink-0 items-center px-3"
      >
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            line.haveAtHome ? 'bg-stone-700 text-white' : 'text-stone-500 ring-1 ring-stone-300'
          }`}
        >
          {line.haveAtHome ? 'Есть дома' : 'Дома?'}
        </span>
      </button>
    </li>
  );
}

function AddProduct({
  weekId,
  lines,
  onMessage,
}: {
  weekId: number;
  lines: ShoppingLine[];
  onMessage: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const products = useLiveQuery(() => db.products.orderBy('name').keys(), []);

  const add = async () => {
    const normalized = normalizeProductName(name);
    if (!normalized) return;
    if (lines.some((l) => l.productName === normalized)) {
      onMessage(`«${normalized}» уже в списке`);
    } else {
      await addManualItem(weekId, normalized);
    }
    setName('');
  };

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Добавить продукт"
        aria-label="Добавить продукт"
        list="shopping-products"
        enterKeyHint="done"
        className={inputClass}
      />
      <datalist id="shopping-products">
        {products?.map((p) => <option key={String(p)} value={String(p)} />)}
      </datalist>
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

/** Carried-over dishes of this week with the «Продукты ещё есть?» answer (SPEC §5, §7). */
function CarriedDishes({ data }: { data: ShoppingData }) {
  const { input } = data;
  const carryOversById = new Map(input.carryOvers.map((c) => [c.id!, c]));
  const carried: CarryOver[] = [];
  for (const slot of input.slots) {
    for (const item of slot.items) {
      const c = item.carryOverId === undefined ? undefined : carryOversById.get(item.carryOverId);
      if (c && !carried.includes(c)) carried.push(c);
    }
  }
  if (carried.length === 0) return null;

  return (
    <section className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
      <h3 className="font-semibold text-sky-950">Перенесённые блюда</h3>
      <p className="mt-0.5 text-sm text-sky-900">Если продукты ещё есть, они не попадут в список.</p>
      <ul className="mt-3 space-y-2">
        {carried.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-sky-100">
            <span className="flex-1 font-medium">{input.dishesById.get(c.dishId)?.name ?? 'Блюдо удалено'}</span>
            <span className="text-stone-600">Продукты есть?</span>
            {([true, false] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={c.haveIngredients === value}
                onClick={() => void setHaveIngredients(c.id!, c.haveIngredients === value ? undefined : value)}
                className={`min-h-9 rounded-full px-3 font-medium ${
                  c.haveIngredients === value ? 'bg-stone-800 text-white' : 'ring-1 ring-stone-300'
                }`}
              >
                {value ? 'Да' : 'Нет'}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
