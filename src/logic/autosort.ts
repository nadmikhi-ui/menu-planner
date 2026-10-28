// Local, rule-based category suggestion (SPEC §2). No AI.
import type { DishCategory, ProteinType, SortRule } from '../types';
import { containsKeyword, normalizeText, splitWords } from './text';

export interface KeywordRule {
  category: DishCategory;
  standalone?: boolean;
  /** Matched against the dish name. */
  name: string[];
  /** Matched against ingredients when nothing matched the name. */
  ingredients?: string[];
}

/** Word stems; see `containsKeyword` for how they match. */
const PROTEIN_STEMS = {
  poultry: ['курин', 'куриц', 'цыпл', 'индейк', 'индюш', 'утк', 'утин', 'гус'],
  fish: [
    'рыб', 'лосос', 'семг', 'форел', 'треск', 'минта', 'горбуш', 'скумбри', 'сибас',
    'дорадо', 'тунец', 'тунц', 'кревет', 'кальмар', 'морепрод', 'хек', 'судак',
  ],
  meat: [
    'мяс', 'свинин', 'свин', 'говядин', 'говяж', 'баранин', 'телятин', 'кролик', 'фарш',
    'бекон', 'ветчин', 'печень', 'печенк',
  ],
} satisfies Record<Exclude<ProteinType, 'other'>, string[]>;

const PROTEINS = [...PROTEIN_STEMS.poultry, ...PROTEIN_STEMS.fish, ...PROTEIN_STEMS.meat];

const SIDES = [
  'гречк', 'гречнев', 'рис', 'пюре', 'булгур', 'киноа', 'картоф', 'картош', 'кускус',
  'перлов', 'макарон', 'лапш', 'овощ на грил', 'овощ гриль', 'чечевиц',
];

const PREP = ['заморозк', 'замороз', 'заморож', 'заготовк'];

/**
 * Built-in dictionary. Order matters: the first rule matching the name wins,
 * so specific categories (soup, salad, breakfast) come before generic proteins and sides.
 */
export const BUILTIN_RULES: KeywordRule[] = [
  { category: 'prep', name: PREP, ingredients: PREP },
  {
    category: 'lunch',
    name: [
      'суп', 'борщ', 'щи', 'солянк', 'уха', 'бульон', 'рассольник', 'харчо', 'окрошк',
      'свекольник', 'лагман', 'шурп',
    ],
  },
  { category: 'salad', name: ['салат', 'винегрет', 'оливье', 'цезарь'] },
  {
    category: 'breakfast',
    name: [
      'каш', 'омлет', 'сырник', 'яичниц', 'блин', 'оладь', 'оладуш', 'гранол', 'тост',
      'мюсли', 'творожн', 'скрэмбл', 'овсянк',
    ],
    ingredients: ['гранол', 'мюсли', 'овсян хлоп'],
  },
  { category: 'snack', name: ['бутерброд', 'сэндвич', 'сендвич', 'смузи', 'хумус', 'батончик'] },
  {
    category: 'main',
    standalone: true,
    name: [
      'плов', 'лазань', 'макарон по флотск', 'рагу', 'запеканк', 'паст', 'спагетти',
      'ризотто', 'голубц', 'жарк',
    ],
  },
  {
    category: 'main',
    name: [
      ...PROTEINS, 'котлет', 'тефтел', 'фрикадел', 'стейк', 'отбивн', 'шницел', 'гуляш',
      'бефстроганов', 'шашлык', 'биточк',
    ],
    ingredients: PROTEINS,
  },
  { category: 'side', name: SIDES, ingredients: SIDES },
];

export interface CategorySuggestion {
  category: DishCategory;
  /** Only meaningful for `main`. */
  standalone: boolean;
  /** `user` = learned from the user's earlier correction. */
  source: 'user' | 'builtin';
  via: 'name' | 'ingredients';
  /** The keyword that matched (for «по слову «суп»»). */
  keyword: string;
}

/** Most specific user rule first: more words, then longer text, then newest. */
function compareUserRules(a: SortRule, b: SortRule): number {
  return (
    splitWords(b.keyword).length - splitWords(a.keyword).length ||
    b.keyword.length - a.keyword.length ||
    b.createdAt.localeCompare(a.createdAt)
  );
}

export function suggestCategory(
  name: string,
  ingredients: string[],
  userRules: SortRule[] = [],
): CategorySuggestion | null {
  const nameWords = splitWords(name);
  if (nameWords.length === 0 && ingredients.length === 0) return null;

  // User corrections beat built-in rules.
  const userRule = [...userRules].sort(compareUserRules).find((r) => containsKeyword(nameWords, r.keyword));
  if (userRule) {
    return {
      category: userRule.category,
      standalone: userRule.category === 'main' && !!userRule.standalone,
      source: 'user',
      via: 'name',
      keyword: userRule.keyword,
    };
  }

  for (const rule of BUILTIN_RULES) {
    const keyword = rule.name.find((k) => containsKeyword(nameWords, k));
    if (keyword) {
      return { category: rule.category, standalone: !!rule.standalone, source: 'builtin', via: 'name', keyword };
    }
  }

  const ingredientWords = ingredients.map(splitWords);
  for (const rule of BUILTIN_RULES) {
    const keyword = rule.ingredients?.find((k) => ingredientWords.some((w) => containsKeyword(w, k)));
    if (keyword) {
      return { category: rule.category, standalone: !!rule.standalone, source: 'builtin', via: 'ingredients', keyword };
    }
  }

  return null;
}

/** Protein type for a main dish, by name first, then ingredients. Poultry and fish win over generic «фарш»/«мясо». */
export function suggestProtein(name: string, ingredients: string[]): ProteinType | null {
  const texts = [splitWords(name), ...ingredients.map(splitWords)];
  const order: (keyof typeof PROTEIN_STEMS)[] = ['poultry', 'fish', 'meat'];
  for (const words of texts) {
    for (const type of order) {
      if (PROTEIN_STEMS[type].some((k) => containsKeyword(words, k))) return type;
    }
  }
  return null;
}

export type LearnedRule = Omit<SortRule, 'id' | 'createdAt'>;

/**
 * The rule to remember when the user's choice differs from the suggestion
 * (or there was no suggestion at all). `null` if the suggestion was accepted.
 */
export function learnedRule(
  name: string,
  suggestion: CategorySuggestion | null,
  chosen: { category: DishCategory; standalone: boolean },
): LearnedRule | null {
  const keyword = normalizeText(name);
  if (!keyword) return null;
  const isMain = chosen.category === 'main';
  if (
    suggestion &&
    suggestion.category === chosen.category &&
    (!isMain || suggestion.standalone === chosen.standalone)
  ) {
    return null;
  }
  return isMain
    ? { keyword, category: chosen.category, standalone: chosen.standalone }
    : { keyword, category: chosen.category };
}
