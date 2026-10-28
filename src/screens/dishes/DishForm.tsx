import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Sheet } from '../../components/Sheet';
import { Chip, FieldLabel, Notice, inputClass } from '../../components/ui';
import { db } from '../../db/db';
import { saveDish, setDishArchived } from '../../db/dishes';
import { learnedRule, suggestCategory, suggestProtein, type CategorySuggestion } from '../../logic/autosort';
import { dishToDraft, emptyDraft, findDuplicate, validateDraft, type DishDraft } from '../../logic/dish';
import { parseIngredients, uniqueProducts } from '../../logic/text';
import { closeRoute } from '../../navigation';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PREP_SOURCE_LABELS,
  PREP_TYPE_LABELS,
  PROTEIN_LABELS,
  type Dish,
  type DishCategory,
  type PrepSource,
  type PrepType,
  type ProteinType,
} from '../../types';

const close = () => closeRoute('#/dishes');

/**
 * Loads the dish for `#/dishes/<id>` (or starts a new one for `#/dishes/new`, with a chosen
 * category for `#/dishes/new/<category>`) and shows the form.
 */
export function DishEditor({ idParam, preset }: { idParam: string; preset?: string }) {
  const id = idParam === 'new' ? undefined : Number(idParam);
  const dish = useLiveQuery(async () => (id === undefined ? null : ((await db.dishes.get(id)) ?? null)), [id]);

  if (id === undefined) {
    const category = CATEGORIES.find((c) => c === preset);
    return <DishForm presetCategory={category} />;
  }
  if (Number.isNaN(id) || dish === null) {
    return (
      <Sheet title="Блюдо" onCancel={close}>
        <p className="py-10 text-center text-stone-500">Блюдо не найдено</p>
      </Sheet>
    );
  }
  if (dish === undefined) return <Sheet title="Блюдо" onCancel={close} />;
  return <DishForm dish={dish} />;
}

/** Fields the auto-sorter fills in until the user sets them by hand. */
interface Touched {
  category: boolean;
  standalone: boolean;
  protein: boolean;
}

function DishForm({ dish, presetCategory }: { dish?: Dish; presetCategory?: DishCategory }) {
  const isNew = !dish;
  const [initial] = useState<DishDraft>(() =>
    dish ? dishToDraft(dish) : { ...emptyDraft(), category: presetCategory ?? null },
  );
  const [draft, setDraft] = useState<DishDraft>(initial);
  const [touched, setTouched] = useState<Touched>({
    category: !isNew || presetCategory !== undefined,
    standalone: !isNew,
    protein: !isNew,
  });
  const [pendingIngredient, setPendingIngredient] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rules = useLiveQuery(() => db.sortRules.toArray(), []);
  const products = useLiveQuery(() => db.products.orderBy('name').keys(), []);
  const allDishes = useLiveQuery(() => db.dishes.toArray(), []);

  const suggestion = useMemo(
    () => (rules ? suggestCategory(draft.name, draft.ingredients, rules) : null),
    [draft.name, draft.ingredients, rules],
  );
  const proteinGuess = useMemo(() => suggestProtein(draft.name, draft.ingredients), [draft.name, draft.ingredients]);

  // What will actually be saved: user input plus suggestions for untouched fields.
  const effective: DishDraft = {
    ...draft,
    category: touched.category ? draft.category : (suggestion?.category ?? null),
    standalone: touched.standalone
      ? draft.standalone
      : suggestion?.category === 'main'
        ? suggestion.standalone
        : draft.standalone,
    protein: touched.protein ? draft.protein : (proteinGuess ?? undefined),
    ingredients: uniqueProducts([...draft.ingredients, ...parseIngredients(pendingIngredient)]),
  };

  const canSave = validateDraft(effective).length === 0 && !busy;
  const duplicate = allDishes ? findDuplicate(effective.name, allDishes, dish?.id) : undefined;
  const willLearn =
    effective.category && rules
      ? learnedRule(effective.name, suggestion, { category: effective.category, standalone: effective.standalone })
      : null;
  const dirty = pendingIngredient.trim() !== '' || JSON.stringify(draft) !== JSON.stringify(initial);

  const update = (patch: Partial<DishDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const addIngredients = (text: string) => {
    const parsed = parseIngredients(text);
    if (parsed.length) update({ ingredients: uniqueProducts([...draft.ingredients, ...parsed]) });
  };

  const onIngredientChange = (value: string) => {
    // Typing a comma adds what was before it.
    const lastSeparator = Math.max(value.lastIndexOf(','), value.lastIndexOf(';'));
    if (lastSeparator >= 0) {
      addIngredients(value.slice(0, lastSeparator));
      setPendingIngredient(value.slice(lastSeparator + 1).trimStart());
    } else {
      setPendingIngredient(value);
    }
  };

  const onIngredientKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addIngredients(pendingIngredient);
      setPendingIngredient('');
    }
  };

  const cancel = () => {
    if (dirty && !window.confirm('Закрыть без сохранения изменений?')) return;
    close();
  };

  const save = async () => {
    const errors = validateDraft(effective);
    if (errors.length) {
      setError(errors.join('. '));
      return;
    }
    setBusy(true);
    try {
      await saveDish(effective, dish?.id);
      close();
    } catch (e) {
      setError(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  const toggleArchived = async () => {
    if (!dish?.id) return;
    setBusy(true);
    await setDishArchived(dish.id, !dish.archived);
    close();
  };

  return (
    <Sheet
      title={isNew ? 'Новое блюдо' : 'Блюдо'}
      onCancel={cancel}
      action={
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="min-h-11 px-2 font-semibold text-brand-700 disabled:text-stone-300"
        >
          Сохранить
        </button>
      }
    >
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {dish?.archived && <Notice tone="neutral">Блюдо в архиве и не предлагается в меню.</Notice>}

        <div>
          <FieldLabel htmlFor="dish-name">Название</FieldLabel>
          <input
            id="dish-name"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            autoFocus={isNew}
            autoComplete="off"
            enterKeyHint="next"
            placeholder="Например, борщ"
            className={inputClass}
          />
          {duplicate && (
            <div className="mt-2">
              <Notice tone="warning">
                Блюдо «{duplicate.name}» уже есть в разделе «{CATEGORY_LABELS[duplicate.category]}»
                {duplicate.archived ? ' (в архиве)' : ''}.
              </Notice>
            </div>
          )}
        </div>

        <div>
          <FieldLabel>Раздел</FieldLabel>
          <SuggestionNotice
            hasName={draft.name.trim() !== '' && rules !== undefined}
            showSuggestion={isNew || !touched.category}
            touched={touched.category}
            suggestion={suggestion}
            learnCategory={willLearn && touched.category ? willLearn.category : null}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                selected={effective.category === c}
                onClick={() => {
                  update({ category: c });
                  setTouched((t) => ({ ...t, category: true }));
                }}
              >
                {CATEGORY_LABELS[c]}
              </Chip>
            ))}
          </div>
        </div>

        {effective.category === 'main' && (
          <>
            <div>
              <FieldLabel>Белок</FieldLabel>
              <OptionChips<ProteinType>
                labels={PROTEIN_LABELS}
                value={effective.protein}
                onChange={(protein) => {
                  update({ protein });
                  setTouched((t) => ({ ...t, protein: true }));
                }}
              />
            </div>
            <label className="flex min-h-12 items-center justify-between gap-4 rounded-xl bg-white px-3.5 py-2.5 ring-1 ring-stone-300">
              <span>
                <span className="block font-medium">Самостоятельное блюдо</span>
                <span className="block text-sm text-stone-500">Не нужен гарнир: плов, лазанья, рагу…</span>
              </span>
              <input
                type="checkbox"
                checked={effective.standalone}
                onChange={(e) => {
                  update({ standalone: e.target.checked });
                  setTouched((t) => ({ ...t, standalone: true }));
                }}
                className="h-6 w-6 shrink-0 accent-brand-700"
              />
            </label>
          </>
        )}

        {effective.category === 'prep' && (
          <>
            <div>
              <FieldLabel>Тип заготовки</FieldLabel>
              <OptionChips<PrepType>
                labels={PREP_TYPE_LABELS}
                value={draft.prepType}
                onChange={(prepType) => update({ prepType })}
              />
            </div>
            <div>
              <FieldLabel>Источник</FieldLabel>
              <OptionChips<PrepSource>
                labels={PREP_SOURCE_LABELS}
                value={draft.prepSource}
                onChange={(prepSource) => update({ prepSource })}
              />
            </div>
          </>
        )}

        <div>
          <FieldLabel htmlFor="dish-ingredient">Ингредиенты</FieldLabel>
          {draft.ingredients.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {draft.ingredients.map((name) => (
                <li
                  key={name}
                  className="flex items-center rounded-full bg-white pl-3 text-sm ring-1 ring-stone-300"
                >
                  {name}
                  <button
                    type="button"
                    onClick={() => update({ ingredients: draft.ingredients.filter((i) => i !== name) })}
                    aria-label={`Убрать «${name}»`}
                    className="flex h-9 w-9 items-center justify-center text-lg text-stone-400 active:text-stone-700"
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
              value={pendingIngredient}
              onChange={(e) => onIngredientChange(e.target.value)}
              onKeyDown={onIngredientKeyDown}
              list="product-names"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="Продукт, без количества"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => {
                addIngredients(pendingIngredient);
                setPendingIngredient('');
              }}
              disabled={!pendingIngredient.trim()}
              className="min-h-12 shrink-0 rounded-xl bg-stone-200 px-4 font-medium text-stone-800 active:bg-stone-300 disabled:opacity-40"
            >
              Добавить
            </button>
          </div>
          <p className="mt-1.5 text-xs text-stone-500">Можно перечислить через запятую.</p>
          <datalist id="product-names">
            {products?.map((name) => (
              <option key={String(name)} value={String(name)} />
            ))}
          </datalist>
        </div>

        <div>
          <FieldLabel htmlFor="dish-note">Заметка / рецепт</FieldLabel>
          <textarea
            id="dish-note"
            value={draft.note}
            onChange={(e) => update({ note: e.target.value })}
            rows={5}
            placeholder="Как готовить, откуда рецепт, что подать"
            className={inputClass}
          />
        </div>

        {error && <Notice tone="warning">{error}</Notice>}

        <div className="space-y-3 pb-4">
          <button
            type="submit"
            disabled={!canSave}
            className="min-h-12 w-full rounded-xl bg-brand-700 font-semibold text-white active:bg-brand-800 disabled:bg-stone-300"
          >
            Сохранить
          </button>
          {!canSave && !busy && (
            <p className="text-center text-sm text-stone-500">Укажите название и раздел</p>
          )}
          {dish && (
            <button
              type="button"
              onClick={toggleArchived}
              disabled={busy}
              className="min-h-12 w-full rounded-xl font-medium text-stone-600 ring-1 ring-stone-300 active:bg-stone-100"
            >
              {dish.archived ? 'Вернуть из архива' : 'Убрать в архив'}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

/** One message block above the category chips, so tapping a chip doesn't shift them. */
function SuggestionNotice({
  /** False while the name is empty or the user's rules are still loading. */
  hasName,
  showSuggestion,
  touched,
  suggestion,
  learnCategory,
}: {
  hasName: boolean;
  showSuggestion: boolean;
  touched: boolean;
  suggestion: CategorySuggestion | null;
  learnCategory: DishCategory | null;
}) {
  if (!hasName) return null;
  if (learnCategory) {
    return (
      <Notice tone="neutral">
        Запомню выбор: похожие блюда сразу попадут в «{CATEGORY_LABELS[learnCategory]}».
      </Notice>
    );
  }
  if (!showSuggestion) return null;
  if (!suggestion) {
    if (touched) return null;
    return <Notice tone="neutral">Не получилось определить раздел — выберите его.</Notice>;
  }
  const why =
    suggestion.source === 'user'
      ? 'как вы выбирали раньше'
      : suggestion.via === 'name'
        ? 'по названию'
        : 'по ингредиентам';
  return (
    <Notice tone="info">
      Подсказка: <b>{CATEGORY_LABELS[suggestion.category]}</b>
      {suggestion.category === 'main' && suggestion.standalone ? ', без гарнира' : ''} ({why}). Если верно — просто
      сохраните.
    </Notice>
  );
}

function OptionChips<T extends string>({
  labels,
  value,
  onChange,
}: {
  labels: Record<T, string>;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(labels) as T[]).map((key) => (
        <Chip key={key} selected={value === key} onClick={() => onChange(value === key ? undefined : key)}>
          {labels[key]}
        </Chip>
      ))}
    </div>
  );
}
