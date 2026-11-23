import sys, subprocess, os
from concurrent.futures import ThreadPoolExecutor
pdf, tag, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
n = int([l for l in subprocess.run(['pdfinfo',pdf],capture_output=True,text=True).stdout.splitlines() if l.startswith('Pages')][0].split()[1])
def page(i):
    dst=f'{out}/{tag}-{i:03d}.tsv'
    if os.path.exists(dst): return
    base=f'{out}/{tag}-{i:03d}'
    subprocess.run(['pdftoppm','-r','300','-gray','-singlefile','-f',str(i),'-l',str(i),pdf,base])
    r=subprocess.run(['tesseract',base+'.pgm','-','-l','rus','--psm','11','tsv'],capture_output=True,text=True,env={**os.environ,'OMP_THREAD_LIMIT':'1'}).stdout
    os.remove(base+'.pgm')
    open(dst+'.tmp','w').write(r); os.rename(dst+'.tmp',dst)
with ThreadPoolExecutor(2) as ex: list(ex.map(page, range(1,n+1)))
print('done',tag,n,flush=True)
