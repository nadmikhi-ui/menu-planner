import { useState } from 'react';
import { FieldLabel, inputClass } from '../../components/ui';
import { linesFromText } from '../../logic/dish';
import type { Recipe } from '../../types';

/**
 * Recipe of a dish (SPEC §1): read view with products, steps and КБЖУ;
 * «Изменить рецепт» switches to two text fields, one line per product / step.
 */
export function RecipeSection({
  recipe,
  onChange,
  onUseProducts,
}: {
  recipe: Recipe | undefined;
  onChange: (recipe: Recipe | undefined) => void;
  /** Offered when the recipe has products: fills the shopping ingredients from them. */
  onUseProducts?: () => void;
}) {
  const [editing, setEditing] = useState(!recipe);
  const [ingredientsText, setIngredientsText] = useState(() => recipe?.ingredients.join('\n') ?? '');
  const [stepsText, setStepsText] = useState(() =>
    (recipe?.steps ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n'),
  );
  const [tipsText, setTipsText] = useState(() => recipe?.tips ?? '');

  const commit = (ing: string, steps: string, tips: string) => {
    const next: Recipe = {
      ...(recipe ?? { ingredients: [], steps: [] }),
      ingredients: linesFromText(ing),
      steps: linesFromText(steps),
    };
    if (tips.trim()) next.tips = tips;
    else delete next.tips;
    onChange(next.ingredients.length || next.steps.length || next.tips ? next : undefined);
  };

  if (!editing && recipe) {
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium text-stone-600">Рецепт</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-11 px-1 text-sm font-medium text-brand-700"
          >
            Изменить рецепт
          </button>
        </div>
        <RecipeCard recipe={recipe} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-stone-600">Рецепт</span>
        {recipe && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="min-h-11 px-1 text-sm font-medium text-brand-700"
          >
            Готово
          </button>
        )}
      </div>
      <div>
        <FieldLabel htmlFor="recipe-ingredients">Продукты с количеством</FieldLabel>
        <textarea
          id="recipe-ingredients"
          value={ingredientsText}
          onChange={(e) => {
            setIngredientsText(e.target.value);
            commit(e.target.value, stepsText, tipsText);
          }}
          rows={4}
          placeholder={'Каждый продукт с новой строки:\nКурица — 150 г\nГречка — 60 г'}
          className={inputClass}
        />
        {onUseProducts && recipe && recipe.ingredients.length > 0 && (
          <button
            type="button"
            onClick={onUseProducts}
            className="mt-1 min-h-11 px-1 text-sm font-medium text-brand-700"
          >
            Добавить эти продукты в список для покупок
          </button>
        )}
      </div>
      <div>
        <FieldLabel htmlFor="recipe-steps">Приготовление</FieldLabel>
        <textarea
          id="recipe-steps"
          value={stepsText}
          onChange={(e) => {
            setStepsText(e.target.value);
            commit(ingredientsText, e.target.value, tipsText);
          }}
          rows={5}
          placeholder={'Каждый шаг с новой строки'}
          className={inputClass}
        />
      </div>
      <div>
        <FieldLabel htmlFor="recipe-tips">Советы и вариации</FieldLabel>
        <textarea
          id="recipe-tips"
          value={tipsText}
          onChange={(e) => {
            setTipsText(e.target.value);
            commit(ingredientsText, stepsText, e.target.value);
          }}
          rows={2}
          placeholder="Например: вместо фета — козий сыр"
          className={inputClass}
        />
      </div>
    </div>
  );
}

function Facts({ recipe }: { recipe: Recipe }) {
  const facts: string[] = [];
  if (recipe.kcal) facts.push(`${recipe.kcal} ккал`);
  if (recipe.proteins !== undefined) facts.push(`Б ${recipe.proteins}`);
  if (recipe.fats !== undefined) facts.push(`Ж ${recipe.fats}`);
  if (recipe.carbs !== undefined) facts.push(`У ${recipe.carbs}`);
  if (recipe.timeMin) facts.push(`⏱ ${recipe.timeMin} мин`);
  if (!facts.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {facts.map((f) => (
        <span key={f} className="rounded-lg bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800">
          {f}
        </span>
      ))}
    </div>
  );
}

/** Read-only recipe: КБЖУ, products with amounts, numbered steps, tips. */
export function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <Facts recipe={recipe} />
      {recipe.ingredients.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">Продукты</h3>
          <ul className="space-y-1 text-[15px] leading-snug">
            {recipe.ingredients.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-brand-700">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {recipe.steps.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">Приготовление</h3>
          <ol className="space-y-2 text-[15px] leading-snug">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="w-5 shrink-0 text-right font-semibold text-brand-700">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {recipe.tips && <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-600">{recipe.tips}</p>}
    </div>
  );
}
