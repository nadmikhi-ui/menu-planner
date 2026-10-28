// Text helpers shared by auto-sorting, product dictionary and search.

/** Lower-case, `ё` → `е`, punctuation and hyphens → spaces, collapsed whitespace. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function splitWords(s: string): string[] {
  const n = normalizeText(s);
  return n ? n.split(' ') : [];
}

/** Keywords of 1–2 letters («щи») must match a whole word, longer ones match a word prefix («рис» → «рисом»). */
function wordMatches(word: string, keyword: string): boolean {
  return keyword.length <= 2 ? word === keyword : word.startsWith(keyword);
}

/**
 * True if `keyword` (one or more words) occurs in `words` as consecutive words,
 * each keyword word matching the start of a text word.
 */
export function containsKeyword(words: string[], keyword: string): boolean {
  const kw = splitWords(keyword);
  if (kw.length === 0) return false;
  for (let i = 0; i + kw.length <= words.length; i++) {
    if (kw.every((k, j) => wordMatches(words[i + j]!, k))) return true;
  }
  return false;
}

/** Product name as stored in the dictionary: lower-case, `ё` → `е`, single spaces. Keeps hyphens. */
export function normalizeProductName(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** «Курица, рис; морковь» → ['курица', 'рис', 'морковь'] (normalized, without duplicates). */
export function parseIngredients(input: string): string[] {
  return uniqueProducts(input.split(/[,;\n]/));
}

export function uniqueProducts(names: string[]): string[] {
  const result: string[] = [];
  for (const raw of names) {
    const name = normalizeProductName(raw);
    if (name && !result.includes(name)) result.push(name);
  }
  return result;
}

/** Display name: trimmed, single spaces, case kept. */
export function cleanName(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
