"""Title of each recipe slide: crop above the КБЖУ line at 100 dpi, psm 6 (big bold font reads best small)."""
import glob, json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
from parse import load_words, find
PDFS = {'b': 'Книга_Завтраков_от_Диетолога_Андрея_Маковецкого.pdf', 'l': 'Книга_Рецепты_Обедов_от_Диетолога.pdf',
        'd': 'Книга_Рецепты_Ужинов_А_Маковецкий.pdf'}
src, out = sys.argv[1], sys.argv[2]
res = json.load(open(out)) if os.path.exists(out) else {}
for p in sorted(glob.glob(os.path.join(src, '*.tsv'))):
    key = os.path.basename(p)[:-4]
    if key in res:
        continue
    w, W, H = load_words(p)
    if not find(w, lambda t: t.startswith('Способ')):
        continue
    info = [x for x in w if re.match(r'(ккал|Белки|Жиры|Углевод|порци)', x['t'])]
    ing = find(w, lambda t: t.startswith('Ингредиент'))
    ys = [x['y'] for x in info] + ([ing['y']] if ing else [])
    if not ys:
        continue
    bottom = min(ys) - 8
    scale = 100 / 300
    tag, n = key.split('-')
    tmp = f'/tmp/claude-0/title-{key}'
    subprocess.run(['pdftoppm', '-r', '100', '-gray', '-singlefile', '-f', str(int(n)), '-l', str(int(n)),
                    '-x', '0', '-y', '0', '-W', str(int(W * 0.72 * scale)), '-H', str(int(bottom * scale)),
                    '/mnt/user-data/uploads/' + PDFS[tag], tmp])
    t = subprocess.run(['tesseract', tmp + '.pgm', '-', '-l', 'rus', '--psm', '6'], capture_output=True, text=True).stdout
    os.remove(tmp + '.pgm')
    res[key] = re.sub(r'\s+', ' ', t).strip()
    json.dump(res, open(out, 'w'), ensure_ascii=False, indent=0)
print('titles', len(res))
