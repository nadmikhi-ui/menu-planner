"""recipes+products JSON → menu-planner src/data/books.json (dishes + freezer prep ideas)."""
import json, re, sys, os, collections
sys.path.insert(0, os.path.dirname(__file__))
from common import BOOKS, protein_of  # noqa: E402

REC = sys.argv[1]
OUT = sys.argv[2]
FIXES = json.load(open(os.path.join(os.path.dirname(__file__), 'fixes.json'), encoding='utf-8'))
PREPS = json.load(open(os.path.join(os.path.dirname(__file__), 'preps.json'), encoding='utf-8'))

recipes = json.load(open(REC, encoding='utf-8'))

CANON = FIXES['products']          # raw product → canonical ('' = drop)
TITLES = FIXES['titles']           # page → corrected title ('' = skip recipe)
STAPLES = FIXES['staples']


def canon_product(p):
    p = re.sub(r'^[<>«»"\s]+', '', p)
    p = re.sub(r'\s*(ежга|ехга|extra).*$', '', p)
    p = re.sub(r'^(щепотка|щепоть)\s+', '', p)
    p = re.sub(r'\s+', ' ', p).strip(' -—–)(.,')
    if p.startswith('вода'):
        return ''
    return CANON.get(p, p)


def soup(name):
    return re.search(r'(?<![А-Яа-яЁё])(суп(?!ер)|крем-суп|борщ|щи|солянк|уха|бульон|гаспачо|рассольник|похлебк|минестроне|том-ям|том ям)', name.lower())


dishes, seen = [], collections.Counter()
for r in recipes:
    key = r['page'].replace('.tsv', '')
    title = TITLES.get(key, r['title'])
    if not title:
        continue
    products = [x for x in (canon_product(p) for p in r['products']) if x]
    products = list(dict.fromkeys(products))
    if not products or not r['steps']:
        print('skip (no products/steps):', key, title, file=sys.stderr)
        continue
    book = r['book']
    d = {'name': title, 'source': BOOKS[book], 'ingredients': products}
    recipe = {'ingredients': r['ingredients'], 'steps': r['steps']}
    for k in ('kcal', 'proteins', 'fats', 'carbs'):
        if r.get(k) is not None and (k != 'kcal' or 80 <= r[k] <= 1500):
            recipe[k] = r[k]
    if r.get('tips'):
        recipe['tips'] = r['tips']
    d['recipe'] = recipe
    if book == 'b':
        d['category'] = 'breakfast'
    elif book == 'l':
        d['category'] = 'lunch'
    else:
        if soup(title):
            d['category'] = 'lunch'
        else:
            d['category'] = 'main'
            d['standalone'] = True
            p = protein_of(title)
            if p == 'other':
                p = r.get('hint') or protein_of(' '.join(products[:4]))
            d['protein'] = p
    if r.get('section'):
        d['note'] = f"Раздел книги: {r['section']}"
    n = re.sub(r'[^а-яa-z0-9]+', ' ', title.lower().replace('ё', 'е')).strip()
    seen[n] += 1
    if seen[n] > 1:
        d['name'] = f"{title} (вариант {seen[n]})"
    dishes.append(d)

for p in PREPS:
    p = dict(p)
    pat = re.compile(p.pop('match'), re.I)
    uses = [d['name'] for d in dishes if pat.search(d['name'] + ' ' + ' '.join(d['ingredients']))]
    if uses:
        shown = ', '.join(uses[:6]) + (f' и ещё {len(uses) - 6}' if len(uses) > 6 else '')
        p['note'] = p['note'] + f'\n\nПригодится в блюдах из книг ({len(uses)}): {shown}.'
    if not p['recipe'].get('ingredients'):
        p['recipe'] = {k: v for k, v in p['recipe'].items() if k != 'ingredients'} | {'ingredients': []}
    dishes.append({**p, 'category': 'prep'})

lib = {'version': 1, 'staples': STAPLES, 'dishes': dishes}
json.dump(lib, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
c = collections.Counter(d['category'] for d in dishes)
print(dict(c), 'products:', len({p for d in dishes for p in d['ingredients']}))
