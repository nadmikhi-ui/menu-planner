import { Sheet } from '../../components/Sheet';
import { closeRoute, openRoute } from '../../navigation';
import type { Dish } from '../../types';
import { RecipeCard } from '../dishes/RecipeSection';

/** Recipe of a dish from the week, read-only (SPEC §1): what to cook today without leaving the menu. */
export function RecipeSheet({ dish, fallback }: { dish: Dish; fallback: string }) {
  const close = () => closeRoute(fallback);
  return (
    <Sheet
      title="Рецепт"
      onCancel={close}
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
      <h2 className="mb-1 text-xl font-semibold leading-tight">{dish.name}</h2>
      {dish.source && <p className="mb-4 text-sm text-stone-500">{dish.source}</p>}
      {dish.recipe ? (
        <RecipeCard recipe={dish.recipe} />
      ) : (
        <p className="py-6 text-center text-stone-500">У этого блюда пока нет рецепта.</p>
      )}
      {dish.ingredients.length > 0 && (
        <p className="mt-4 text-sm text-stone-500">Продукты для покупок: {dish.ingredients.join(', ')}</p>
      )}
    </Sheet>
  );
}
