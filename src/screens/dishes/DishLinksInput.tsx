import { useMemo, useState } from 'react';
import { inputClass } from '../../components/ui';
import { normalizeText } from '../../logic/text';
import { CATEGORY_LABELS, type Dish } from '../../types';

const collator = new Intl.Collator('ru');

/**
 * Dishes a prep is for (SPEC §6.1): chosen ones as chips, «Выбрать блюда» opens the
 * library with search. Stored by name, so links survive export/import.
 */
export function DishLinksInput({
  value,
  onChange,
  dishes,
}: {
  value: string[];
  onChange: (names: string[]) => void;
  dishes: Dish[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const chosen = new Set(value.map(normalizeText));

  const list = useMemo(() => {
    if (!open) return [];
    const q = normalizeText(query);
    return dishes
      .filter((d) => d.category !== 'prep' && !d.archived && (!q || normalizeText(d.name).includes(q)))
      .sort((a, b) => Number(!chosen.has(normalizeText(a.name))) - Number(!chosen.has(normalizeText(b.name))) || collator.compare(a.name, b.name))
      .slice(0, 80);
    // `chosen` follows `value`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishes, query, open, value]);

  const toggle = (name: string) =>
    onChange(chosen.has(normalizeText(name)) ? value.filter((n) => normalizeText(n) !== normalizeText(name)) : [...value, name]);

  return (
    <div>
      {value.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {value.map((name) => (
            <li key={name} className="flex items-center rounded-full bg-white pl-3 text-sm ring-1 ring-stone-300">
              {name}
              <button
                type="button"
                onClick={() => toggle(name)}
                aria-label={`Убрать «${name}»`}
                className="flex h-11 w-11 items-center justify-center text-lg text-stone-400 active:text-stone-700"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-1 text-sm text-stone-500">
          Не выбраны — подойдут блюда с теми же продуктами, что у заготовки.
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-11 px-1 text-sm font-medium text-brand-700"
      >
        {open ? 'Скрыть список' : 'Выбрать блюда'}
      </button>
      {open && (
        <div className="mt-1 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти блюдо"
            aria-label="Поиск по блюдам"
            className={inputClass}
          />
          <ul className="mt-2 max-h-72 divide-y divide-stone-100 overflow-y-auto">
            {list.map((d) => {
              const on = chosen.has(normalizeText(d.name));
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(d.name)}
                    className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm ${
                        on ? 'bg-brand-700 text-white' : 'ring-1 ring-stone-300'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block">{d.name}</span>
                      <span className="block text-xs text-stone-500">{CATEGORY_LABELS[d.category]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="py-6 text-center text-sm text-stone-500">Ничего не найдено</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
