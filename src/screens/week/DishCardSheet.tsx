import { Sheet } from '../../components/Sheet';
import { Badge } from '../../components/ui';
import { formatDay } from '../../logic/dates';
import { openRoute } from '../../navigation';
import { CATEGORY_LABELS, MEAL_LABELS, PROTEIN_LABELS, SKIP_REASON_LABELS, type Dish, type Slot, type Week } from '../../types';
import { RecipeCard } from '../dishes/RecipeSection';

/**
 * Card of a dish from the week (SPEC §3): composition, recipe and note, read-only.
 * From here: «Изменить» opens the dish in the library; in a draft — «Выбрать другое блюдо»,
 * in an approved week — «Пропущено».
 */
export function DishCardSheet({
  week,
  slot,
  itemIndex,
  dish,
  freezerPreps,
  onClose,
}: {
  week: Week;
  slot: Slot;
  itemIndex: number;
  dish: Dish;
  /** Available preps this dish uses (SPEC §6.1). */
  freezerPreps: string[];
  onClose: () => void;
}) {
  const item = slot.items[itemIndex]!;
  // Replace, not push: closing the picker or the skip panel returns to the week, not to this card.
  const go = (hash: string) => window.location.replace(hash);

  return (
    <Sheet
      title="Блюдо"
      onCancel={onClose}
      action={
        <button
          type="button"
          onClick={() => openRoute(`#/dishes/${dish.id}`)}
          className="min-h-11 px-2 font-medium text-brand-700"
        >
          Изменить
        </button>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-1 text-sm text-stone-500">
            {MEAL_LABELS[slot.meal]}, {formatDay(slot.date).toLowerCase()}
          </p>
          <h2 className="text-xl font-semibold leading-tight">{dish.name}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{CATEGORY_LABELS[dish.category]}</Badge>
            {dish.category === 'main' && dish.protein && <Badge>{PROTEIN_LABELS[dish.protein]}</Badge>}
          </div>
          {dish.source && <p className="mt-2 text-sm text-stone-500">{dish.source}</p>}
          {freezerPreps.length > 0 && (
            <p className="mt-2 text-sm font-medium text-sky-800">❄ из морозилки: {freezerPreps.join(', ')}</p>
          )}
          {item.skipped && (
            <p className="mt-2 text-sm text-stone-500">
              Пропущено · {SKIP_REASON_LABELS[item.skipped.reason]}
              {item.skipped.comment ? ` — ${item.skipped.comment}` : ''}
            </p>
          )}
        </div>

        <section>
          <h3 className="mb-1.5 text-sm font-medium text-stone-600">Состав</h3>
          {dish.ingredients.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {dish.ingredients.map((name) => (
                <li key={name} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-stone-300">
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">Продукты не указаны.</p>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 text-sm font-medium text-stone-600">Рецепт</h3>
          {dish.recipe ? (
            <RecipeCard recipe={dish.recipe} />
          ) : (
            <p className="text-sm text-stone-500">Рецепта пока нет — его можно добавить кнопкой «Изменить».</p>
          )}
        </section>

        {dish.note && (
          <section>
            <h3 className="mb-1.5 text-sm font-medium text-stone-600">Заметка</h3>
            <p className="whitespace-pre-line text-[15px]">{dish.note}</p>
          </section>
        )}

        {week.status === 'draft' && (
          <button
            type="button"
            onClick={() => go(`#/week/${week.id}/pick/${slot.id}/${itemIndex}`)}
            className="min-h-12 w-full rounded-xl font-medium text-stone-700 ring-1 ring-stone-300 active:bg-stone-100"
          >
            Выбрать другое блюдо
          </button>
        )}
        {week.status === 'approved' && (
          <button
            type="button"
            onClick={() => go(`#/week/${week.id}/skip/${slot.id}/${itemIndex}`)}
            className="min-h-12 w-full rounded-xl font-medium text-stone-700 ring-1 ring-stone-300 active:bg-stone-100"
          >
            {item.skipped ? 'Пропущено — изменить' : 'Отметить «Пропущено»'}
          </button>
        )}
      </div>
    </Sheet>
  );
}
