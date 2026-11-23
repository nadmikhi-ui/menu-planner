import { useMemo, useState, type KeyboardEvent } from 'react';
import { inputClass } from '../../components/ui';
import { matchProducts } from '../../logic/products';
import { parseIngredients, uniqueProducts } from '../../logic/text';

/**
 * Ingredient list of a dish (SPEC §1): chips of chosen products, a text field with suggestions
 * from the product dictionary while typing, and «Выбрать из имеющихся» — the whole dictionary
 * with search, tap to add or remove.
 */
export function IngredientInput({
  value,
  onChange,
  pending,
  onPendingChange,
  products,
}: {
  value: string[];
  onChange: (ingredients: string[]) => void;
  /** Text typed but not yet added; the form saves it too. */
  pending: string;
  onPendingChange: (text: string) => void;
  /** Normalized names from the product dictionary. */
  products: string[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');

  const add = (names: string[]) => {
    if (names.length) onChange(uniqueProducts([...value, ...names]));
  };
  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((i) => i !== name) : uniqueProducts([...value, name]));

  const onTextChange = (text: string) => {
    // Typing a comma adds what was before it.
    const lastSeparator = Math.max(text.lastIndexOf(','), text.lastIndexOf(';'));
    if (lastSeparator >= 0) {
      add(parseIngredients(text.slice(0, lastSeparator)));
      onPendingChange(text.slice(lastSeparator + 1).trimStart());
    } else {
      onPendingChange(text);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add(parseIngredients(pending));
      onPendingChange('');
    }
  };

  const suggestions = useMemo(
    () => (pending.trim() ? matchProducts(products, pending, value).slice(0, 8) : []),
    [products, pending, value],
  );
  const pickerList = useMemo(
    () => (pickerOpen ? matchProducts(products, pickerQuery, []) : []),
    [products, pickerQuery, pickerOpen],
  );

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {value.map((name) => (
            <li key={name} className="flex items-center rounded-full bg-white pl-3 text-sm ring-1 ring-stone-300">
              {name}
              <button
                type="button"
                onClick={() => onChange(value.filter((i) => i !== name))}
                aria-label={`Убрать «${name}»`}
                className="flex h-11 w-11 items-center justify-center text-lg text-stone-400 active:text-stone-700"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          id="dish-ingredient"
          value={pending}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="Продукт, без количества"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => {
            add(parseIngredients(pending));
            onPendingChange('');
          }}
          disabled={!pending.trim()}
          className="min-h-12 shrink-0 rounded-xl bg-stone-200 px-4 font-medium text-stone-800 active:bg-stone-300 disabled:opacity-40"
        >
          Добавить
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2">
          <p className="mb-1.5 text-xs text-stone-500">Есть в списке продуктов — нажмите, чтобы добавить:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  add([name]);
                  onPendingChange('');
                }}
                className="min-h-11 rounded-full bg-brand-50 px-3.5 text-sm font-medium text-brand-800 ring-1 ring-brand-100 active:bg-brand-100"
              >
                + {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">Можно перечислить через запятую.</p>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="min-h-11 shrink-0 px-1 text-sm font-medium text-brand-700"
        >
          {pickerOpen ? 'Скрыть список' : `Выбрать из имеющихся (${products.length})`}
        </button>
      </div>

      {pickerOpen && (
        <div className="mt-2 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
          <input
            type="search"
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            placeholder="Найти продукт"
            aria-label="Поиск по продуктам"
            className={inputClass}
          />
          <div className="mt-3 max-h-72 overflow-y-auto">
            {pickerList.length === 0 ? (
              <p className="py-6 text-center text-sm text-stone-500">
                {products.length === 0 ? 'Список продуктов пока пуст' : 'Ничего не найдено'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pickerList.map((name) => {
                  const selected = value.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggle(name)}
                      className={`min-h-11 rounded-full px-3.5 text-sm font-medium ${
                        selected
                          ? 'bg-brand-700 text-white'
                          : 'bg-white text-stone-700 ring-1 ring-stone-300 active:bg-stone-100'
                      }`}
                    >
                      {selected ? '✓ ' : ''}
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-stone-500">Нажмите на продукт, чтобы добавить или убрать его.</p>
        </div>
      )}
    </div>
  );
}
