"""Build recipes.json from OCR TSV of the three books: sections, autocorrect, categories."""
import glob, json, os, re, sys, collections
sys.path.insert(0, os.path.dirname(__file__))
from parse import load_words, lines_of, text_of, parse
from common import BOOKS, protein_of

SRC = sys.argv[1]  # tsv dir
OUT = sys.argv[2]

# Section keywords → (section name, protein hint)
SECTIONS = {
    'l': [
        (('курица', 'индейка'), 'Курица и индейка', 'poultry'),
        (('говядина', 'телятина'), 'Говядина и телятина', 'meat'),
        (('рыба', 'морепродукты'), 'Рыба и морепродукты', 'fish'),
        (('wok',), 'Wok-обеды', None),
        (('вегетарианские',), 'Вегетарианские белковые', 'other'),
        (('бобовые', 'зерновые'), 'Бобовые и зерновые', 'other'),
        (('салаты-боулы', 'боулы'), 'Салаты-боулы', None),
        (('замены',), 'Замены продуктов', None),
        (('белковые супы',), 'Белковые супы', None),
        (('крем-супы', 'крем'), 'Крем-супы', None),
        (('средиземноморские', 'кафешные'), 'Средиземноморские и «кафешные»', None),
        (('запеканки',), 'Овощные запеканки с белком', None),
        (('паста', 'лапша'), 'Паста и лапша с белком', None),
        (('запечённые', 'запеченные', 'сытные'), 'Сытные запечённые обеды', None),
    ],
    'd': [
        (('рыбы',), 'Блюда из рыбы', 'fish'),
        (('птицы',), 'Белковые ужины из птицы', 'poultry'),
        (('красного', 'мяса'), 'Блюда из красного мяса', 'meat'),
        (('вегетарианские',), 'Вегетарианские ужины', 'other'),
        (('бобовые',), 'Бобовые блюда', 'other'),
        (('яичные', 'творожные'), 'Яичные и творожные ужины', 'other'),
        (('полноценная', 'тарелка'), 'Полноценная тарелка', None),
        (('сочетаниях',), 'Ужины в разных сочетаниях', None),
        (('легкие', 'лёгкие', 'овощами'), 'Лёгкие ужины с овощами', None),
        (('котлетки', 'фрикадельки'), 'Котлетки и фрикадельки', None),
        (('супы', 'рагу'), 'Супы и рагу', None),
        (('важная', 'информация'), 'Очень важная информация', None),
    ],
    'b': [
        (('яиц',), 'Завтраки из яиц', None),
        (('сытные', 'зерновые'), 'Сытные зерновые', None),
        (('хлебные',), 'Хлебные завтраки', None),
        (('street',), 'Street-style', None),
        (('быстрые', 'простые'), 'Быстрые и простые', None),
        (('здоровые',), 'Здоровые боулы', None),
        (('классические',), 'Классические сладкие', None),
        (('сладкие', 'боулы'), 'Сладкие боулы', None),
        (('десертные',), 'Десертные', None),
        (('банке',), 'Завтрак в банке', None),
        (('разных', 'мира'), 'Завтраки разных стран', None),
        (('секретные', 'советы'), 'Секретные советы', None),
    ],
}

def page_words_text(path):
    w, W, H = load_words(path)
    return w, W, H


# ---------- vocabulary autocorrect ----------
vocab = collections.Counter()
pages = sorted(glob.glob(os.path.join(SRC, '*.tsv')))
for p in pages:
    w, _, _ = load_words(p)
    for x in w:
        if x['c'] > 85:
            for tok in re.findall(r'[А-Яа-яЁё]+', x['t']):
                vocab[tok.lower()] += 1


def fix_word(tok):
    low = tok.lower()
    if len(low) < 4 or vocab[low] >= 20:
        return tok
    cands = []
    # и ↔ й confusion
    for i, ch in enumerate(low):
        if ch == 'и':
            c = low[:i] + 'й' + low[i + 1:]
            cands.append((vocab[c], c))
        if ch == 'й':
            c = low[:i] + 'и' + low[i + 1:]
            cands.append((vocab[c], c))
    # glued preposition: «ссыром» → «с сыром»
    for pre in ('со', 'с', 'и', 'в', 'на'):
        if low.startswith(pre) and vocab[low[len(pre):]] >= 3 and len(low) - len(pre) >= 3:
            cands.append((vocab[low[len(pre):]], pre + ' ' + low[len(pre):]))
    cands = [c for c in cands if c[0] >= 3 and c[0] > vocab[low] * 4]
    if not cands:
        return tok
    best = max(cands)[1]
    if tok[0].isupper():
        best = best[0].upper() + best[1:]
    return best


def fix_range(m):
    a, sep, b = m.group(1), m.group(2), m.group(3)
    if a.startswith('5') and int(a) > int(b):
        a2 = '3' + a[1:]
        if int(a2) <= int(b):
            return a2 + '–' + b
    return a + '–' + b


DIGITLIKE = str.maketrans({'О': '0', 'O': '0', 'о': '0', 'Т': '1', ']': '1', 'l': '1', 'I': '1', 'З': '3', '$': '3', 'б': '6'})


def fix_number(m):
    tok = m.group(1)
    if not re.search(r'[\d$]', tok):
        return m.group(0)
    return tok.translate(DIGITLIKE) + m.group(2)


def fix_text(s):
    if not s:
        return s
    s = re.sub(r'(?<![А-Яа-яЁё])Ти?т\.', '1 шт.', s)
    s = re.sub(r'(\d)\s*Г(?![А-Яа-яЁё])', r'\1 г', s)
    # «Т7О г» → «170 г», «$00 г» → «300 г», «1О г» → «10 г», «$ шт.» → «3 шт.»
    s = re.sub(r'(?<![А-Яа-яЁёA-Za-z\d])([\dОOоТЗ$\]lIб]{1,4})(\s*(?:г|гр|мл|шт|мин|ст\.|ч\.|см|кг|мм|°)(?![А-Яа-яЁё]))', fix_number, s)
    s = re.sub(r'(?<![\d,])(\d{1,3})\s*([—–-])\s*(\d{1,3})(?![\d,])', fix_range, s)
    return re.sub(r'[А-Яа-яЁё]+', lambda m: fix_word(m.group(0)), s)


PREP = {'с', 'и', 'в', 'на', 'по', 'со', 'из', 'к', 'у', 'о', 'от', 'до', 'за', 'под', 'для', 'без', 'или', '+', '&'}
TITLES = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'titles.json'), encoding='utf-8'))


def clean_title_tokens(t):
    out = []
    for tok in t.split():
        letters = re.sub(r'[^А-Яа-яЁёA-Za-z]', '', tok)
        if tok.lower().strip(',.') in PREP:
            out.append(tok.strip('.'))
        elif len(letters) >= 3 and len(letters) >= len(tok) * 0.6:
            out.append(tok)
        elif re.fullmatch(r'\(?\d+(%|\.\d)\)?,?', tok):
            out.append(tok)
    # drop trailing prepositions / connectors
    while out and out[-1].lower().strip(',') in PREP:
        out.pop()
    while out and out[0].lower() in PREP - {'с'}:
        out.pop(0)
    return ' '.join(out)


def tidy_title(t):
    t = fix_text(t)
    # ALL-CAPS words → lower-case («СЭНДВИЧ»), first letter upper.
    t = ' '.join(w.lower() if len(w) > 1 and w.isupper() else w for w in t.split())
    # The first line is set in caps in the lunch and dinner books: «Фасоль С Курицей» → «Фасоль с курицей».
    ws = t.split()
    for i in range(1, len(ws)):
        w, prev = ws[i], ws[i - 1]
        if re.match(r'^[А-ЯЁ][а-яё-]*[,.:]?$', w) and not re.search(r'[«(":]$', prev) and not w.startswith('«'):
            ws[i] = w[0].lower() + w[1:]
    t = ' '.join(ws)
    t = re.sub(r'\s+([,)])', r'\1', t)
    t = re.sub(r'(?<!\s)\+', ' +', t)
    t = re.sub(r'\+(?!\s)', '+ ', t)
    t = re.sub(r'\s+', ' ', t).strip(' ,+—-')
    return t[:1].upper() + t[1:]


# ---------- pages → recipes ----------
recipes = []
for tag in ('b', 'l', 'd'):
    section, hint = None, None
    for p in sorted(glob.glob(os.path.join(SRC, f'{tag}-*.tsv'))):
        w, W, H = load_words(p)
        text = ' '.join(x['t'] for x in w).lower()
        if 'нажмите' in text and ('назад' in text or 'вернуться' in text or 'меню' in text) and 'ингредиент' not in text:
            big = ' '.join(x['t'].lower() for x in w if x['h'] > H * 0.03)
            best = max(SECTIONS[tag], key=lambda s: sum(k in big for k in s[0]))
            if sum(k in big for k in best[0]):
                section, hint = best[1], best[2]
            continue
        r = parse(p)
        if not r:
            continue
        r['book'] = tag
        r['section'] = section
        r['hint'] = hint
        key = os.path.basename(p)[:-4]
        r['title'] = tidy_title(clean_title_tokens(TITLES[key]) if TITLES.get(key) else r['title'])
        r['ingredients'] = [fix_text(x) for x in r['ingredients']]
        r['steps'] = [fix_text(x) for x in r['steps']]
        r['tips'] = fix_text(r['tips'])
        recipes.append(r)

json.dump(recipes, open(OUT, 'w'), ensure_ascii=False, indent=1)
c = collections.Counter((r['book'], r['section']) for r in recipes)
for k, v in sorted(c.items(), key=lambda x: (x[0][0], str(x[0][1]))):
    print(k, v)
print('total', len(recipes))
