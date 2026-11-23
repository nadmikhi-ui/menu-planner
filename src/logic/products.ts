// Product dictionary search for the dish form (SPEC §1).
import { normalizeText } from './text';

const collator = new Intl.Collator('ru');

/**
 * Products whose name contains the query (ignoring case and `ё`), except those already chosen.
 * Names that start with the query, or have a word starting with it, come first; then alphabetical.
 * An empty query returns every product alphabetically.
 */
export function matchProducts(products: string[], query: string, exclude: string[]): string[] {
  const q = normalizeText(query);
  const skip = new Set(exclude);
  const rank = (name: string): number => {
    const n = normalizeText(name);
    if (!q) return 0;
    if (n.startsWith(q)) return 0;
    if (n.split(' ').some((w) => w.startsWith(q))) return 1;
    return n.includes(q) ? 2 : -1;
  };
  return products
    .filter((p) => !skip.has(p))
    .map((p) => ({ p, r: rank(p) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || collator.compare(a.p, b.p))
    .map((x) => x.p);
}
