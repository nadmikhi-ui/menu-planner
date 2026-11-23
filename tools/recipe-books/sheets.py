import sys, subprocess, json, os
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
from parse import load_words
import re
PDFS = {'b': 'Книга_Завтраков_от_Диетолога_Андрея_Маковецкого.pdf', 'l': 'Книга_Рецепты_Обедов_от_Диетолога.pdf', 'd': 'Книга_Рецепты_Ужинов_А_Маковецкий.pdf'}
keys = sys.argv[2].split(',')
src = sys.argv[1]; prefix = sys.argv[3]
crops = []
for key in keys:
    w, W, H = load_words(f'{src}/{key}.tsv')
    ys = [x['y'] for x in w if re.match(r'(ккал|Белки|Жиры|Углевод|порци|Ингредиент)', x['t'])]
    bottom = (min(ys) if ys else H * 0.35) - 8
    tag, n = key.split('-')
    out = f'/tmp/claude-0/crops/{key}'
    subprocess.run(['pdftoppm', '-r', '50', '-singlefile', '-png', '-f', str(int(n)), '-l', str(int(n)), '-x', '0', '-y', '0',
                    '-W', str(int(W * 0.75 / 6)), '-H', str(int(bottom / 6)), '/mnt/user-data/uploads/' + PDFS[tag], out])
    im = Image.open(out + '.png'); d = ImageDraw.Draw(im); d.rectangle([0, 0, 52, 16], fill='yellow'); d.text((2, 2), key, fill='black')
    crops.append(im)
per = 14
for s in range(0, len(crops), per):
    group = crops[s:s + per]
    cw = max(i.width for i in group); ch = max(i.height for i in group)
    sheet = Image.new('RGB', (cw * 2, ch * ((len(group) + 1) // 2)), 'white')
    for k, im in enumerate(group):
        sheet.paste(im, ((k % 2) * cw, (k // 2) * ch))
    sheet.save(f'/tmp/claude-0/crops/{prefix}{s // per}.png')
    print(f'/tmp/claude-0/crops/{prefix}{s // per}.png', sheet.size)
