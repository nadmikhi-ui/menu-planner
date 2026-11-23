"""Parse tesseract TSV (psm 11) of a recipe slide into a structured recipe."""
import csv, io, json, re, sys, glob, os, statistics

LETTER = re.compile(r'[А-Яа-яЁёA-Za-z]')


def load_words(path):
    rows = list(csv.DictReader(open(path, encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE))
    W = H = 0
    words = []
    for r in rows:
        if r['level'] == '1':
            W, H = int(r['width']), int(r['height'])
        if r['level'] != '5':
            continue
        t = (r.get('text') or '').strip()
        if not t:
            continue
        words.append({'t': t, 'x': int(r['left']), 'y': int(r['top']), 'w': int(r['width']), 'h': int(r['height']),
                      'c': float(r['conf'])})
    return words, W, H


def lines_of(words):
    """Group words into lines by vertical overlap, each line sorted left to right."""
    ws = sorted(words, key=lambda w: w['y'] + w['h'] / 2)
    lines = []
    for w in ws:
        cy = w['y'] + w['h'] / 2
        if lines:
            L = lines[-1]
            lcy = statistics.median(v['y'] + v['h'] / 2 for v in L)
            lh = statistics.median(v['h'] for v in L)
            if abs(cy - lcy) < max(lh, w['h']) * 0.55:
                L.append(w)
                continue
        lines.append([w])
    return [sorted(L, key=lambda v: v['x']) for L in lines]


def text_of(line):
    return ' '.join(w['t'] for w in line)


def find(words, pred):
    for w in sorted(words, key=lambda w: (w['y'], w['x'])):
        if pred(w['t']):
            return w
    return None


JUNK_LEAD = re.compile(r'^[^А-Яа-яЁёA-Za-z0-9]*$')


def strip_bullet(tokens):
    # Checkmark bullets come out as «М“», «у“», «\», «У», «м» …
    while tokens:
        t = tokens[0]
        if JUNK_LEAD.match(t) or (len(t) <= 2 and not re.match(r'^\d', t) and (not t.isalpha() or len(t) == 1 or t in ('Му', 'му', 'уу'))):
            tokens = tokens[1:]
            continue
        break
    return tokens


def clean(s):
    s = s.replace('“', '').replace('”', '').replace('„', '').replace('|', '')
    s = re.sub(r'\s+([,.;:)])', r'\1', s)
    s = re.sub(r'\(\s+', '(', s)
    s = re.sub(r'\s+', ' ', s).strip(' ‚,')
    s = re.sub(r'(\d)\s*г\b', r'\1 г', s)
    # Trailing scraps from the photo: «— 120 г =.», «(1 5" —»
    s = re.sub(r'(\s+[^\sА-Яа-яЁёA-Za-z\d()]{1,3})+$', '', s)
    return s


def num(pattern, s):
    m = re.search(pattern, s, re.I)
    return int(m.group(1)) if m else None


def parse(path):
    words, W, H = load_words(path)
    ing = find(words, lambda t: t.startswith('Ингредиент'))
    sp = find(words, lambda t: t.startswith('Способ'))
    kc = find(words, lambda t: 'ккал' in t)
    if not sp or not (ing or kc):
        return None
    if not ing:
        # «Ингредиенты» heading not recognized: start right under the КБЖУ line.
        ing = dict(kc, y=kc['y'] + kc['h'], h=int(kc['h'] * 0.5))
    title_bottom = (kc or ing)['y'] - 5
    # Title: big words above the КБЖУ line, left part of the slide (photo is on the right).
    PREP = {'с', 'и', 'в', 'на', 'по', 'со', 'из', 'к', 'у', 'о', 'от', 'до', '+', 'за', 'под', 'для', 'без', 'или'}
    tw = [w for w in words if w['y'] < title_bottom and w['x'] < W * 0.72
          and ((w['c'] > 30 and len(re.sub(r'[^А-Яа-яЁё]', '', w['t'])) > 2) or w['t'].lower().strip(',') in PREP
               or w['t'] == '+')]
    title_lines = []
    for L in lines_of(tw):
        if any(len(w['t']) > 2 and w['c'] > 60 and LETTER.search(w['t']) for w in L):
            title_lines.append(clean(text_of([w for w in L if LETTER.search(w['t']) or w['t'] in '+,'])))
    title = clean(' '.join(title_lines))
    title = re.sub(r'\s*[,+]\s*$', '', title)

    info = ' '.join(text_of(L) for L in lines_of([w for w in words if kc and abs(w['y'] - kc['y']) < kc['h'] * 1.5]))
    kcal = num(r'(\d{2,4})\s*ккал', info)
    prot = num(r'Белки[:\s]*(\d+)', info)
    fat = num(r'Жиры[:\s]*(\d+)', info)
    carb = num(r'Углеводы[:\s]*(\d+)', info)
    # Cooking time: number next to «мин» in the round badge.
    tmin = None
    for w in []:
        if w['t'].lower().startswith('мин') and w['y'] < sp['y']:
            near = [v for v in words if re.fullmatch(r'\d{1,3}', v['t']) and abs(v['x'] - w['x']) < W * 0.05 and 0 < w['y'] - v['y'] < w['h'] * 3]
            if near:
                tmin = int(near[0]['t'])
                break

    # Ingredients block.
    AMOUNT = re.compile(r'^[\d(—–\-½¼¾/~≈]|^(г|мл|шт|ч|л|ст|кг|по|вкусу)[.,)]*$')
    iw = [w for w in words if ing['y'] + ing['h'] * 0.6 < w['y'] < sp['y'] - 3 and w['x'] < W * 0.72
          and (w['c'] > 35 or AMOUNT.match(w['t']))]
    ing_lines = []
    for L in lines_of(iw):
        toks = strip_bullet([w['t'] for w in L])
        if not toks:
            continue
        s = clean(' '.join(toks))
        if not s or not LETTER.search(s):
            continue
        if ing_lines and (s[0].islower() or s[0] in '(—–-' or s[0].isdigit()):
            ing_lines[-1] = ing_lines[-1].rstrip(',') + (', ' if not ing_lines[-1].endswith(',') else ' ') + s if False else ing_lines[-1] + ' ' + s
        else:
            ing_lines.append(s)

    # Steps: below «Способ приготовления» on the left; the right column may start higher,
    # right under the ingredients, so it is located by its step numbers.
    below_ing = [w for w in words if w['y'] > ing['y'] + ing['h'] and not w['t'].startswith('приготовлен') and w is not sp]
    nums = [w for w in below_ing if re.match(r'^\d{1,2}[.)]', w['t']) and w['x'] > W * 0.35]
    split = None
    if nums:
        split = min(w['x'] for w in nums) - W * 0.022
        right_top = min(w['y'] for w in nums) - 5
    else:
        lw = [w for w in below_ing if w['y'] > sp['y']]
        occupied = [0] * 100
        for w in lw:
            for k in range(int(w['x'] / W * 100), min(100, int((w['x'] + w['w']) / W * 100) + 1)):
                occupied[k] += 1
        gaps = [k for k in range(35, 70) if occupied[k] == 0]
        if gaps:
            split = gaps[len(gaps) // 2] / 100 * W
            right_top = sp['y']
    if split is None:
        cols = [[w for w in below_ing if w['y'] > sp['y']]]
    else:
        cols = [[w for w in below_ing if w['y'] > sp['y'] + sp['h'] * 0.5 and w['x'] < split],
                [w for w in below_ing if w['y'] >= right_top and w['x'] >= split]]
    def ok(w):
        letters = len(re.findall(r'[А-Яа-яЁё]', w['t']))
        if w['c'] >= 50:
            return True
        if letters >= 3 and w['c'] >= 25:
            return True
        return bool(re.fullmatch(r'[\d\-–—.,°%()]+[А-Яа-я]*', w['t'])) and w['c'] >= 30
    cols = [[w for w in c if ok(w)] for c in cols]
    text = ''
    for c in cols:
        for L in lines_of(c):
            s = clean(text_of(L))
            if s and LETTER.search(s):
                text += ' ' + s
    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r'\bР\.\s*[$S5Б]\.?\s*', ' Совет: ', text)
    tips = None
    # Tips («Вариации:», «Совет:») may sit in the left column before steps of the right one:
    # a tip runs until the next numbered step.
    tip_parts = []
    while True:
        m = re.search(r'(Вариаци[ия]|Совет|Важно|Подача|Лайфхак|Замен[аы])\s*[:.]\s*', text)
        if not m:
            break
        rest = text[m.end():]
        n = re.search(r'(?:(?<=\s)|^)\d{1,2}\s*[.)]\s*(?=[А-ЯЁA-Z])', rest)
        end = n.start() if n else len(rest)
        tip_parts.append(clean(m.group(1) + ': ' + rest[:end]))
        text = text[:m.start()] + ' ' + rest[end:]
    tips = ' '.join(tip_parts) or None
    parts = re.split(r'(?:(?<=\s)|^)([\dЗТIl|\]\[]{1,2})\s*[.,)]{1,2}\s*(?=[А-ЯЁA-Z])', ' ' + text)
    steps = []
    # parts: [pre, n1, s1, n2, s2, ...]
    pre = parts[0].strip()
    if pre and LETTER.search(pre) and len(parts) > 1:
        steps.append(clean(pre))
    for k in range(1, len(parts) - 1, 2):
        s = clean(parts[k + 1])
        if s:
            steps.append(s)
    if not steps and pre:
        steps = [clean(pre)]
    return {'title': title, 'kcal': kcal, 'proteins': prot, 'fats': fat, 'carbs': carb, 'timeMin': tmin,
            'ingredients': ing_lines, 'steps': steps, 'tips': tips, 'page': os.path.basename(path)}


if __name__ == '__main__':
    out = []
    for p in sorted(glob.glob(sys.argv[1])):
        r = parse(p)
        if r:
            out.append(r)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
