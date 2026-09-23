#!/usr/bin/env python3
"""r14 Bing 图片抓取"""
import subprocess, os, sys, time, hashlib, urllib.parse, io, json, re
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = f'{BASE}/r14_fetch'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

def bing_urls(q, pages=2):
    urls = []
    for p in range(pages):
        first = p*35 + 1
        url = (f'https://www.bing.com/images/search?q={urllib.parse.quote(q)}'
               f'&form=HDRSC2&first={first}&count=35')
        r = subprocess.run(['curl', '-s', '--max-time', '30', '-A', UA, url],
                           capture_output=True, text=True, timeout=40)
        html = r.stdout
        for m in re.finditer(r'mediaurl=(https?%3a%2f%2f[^&"]+)', html):
            u = urllib.parse.unquote(m.group(1))
            if u not in urls:
                urls.append(u)
        time.sleep(0.5)
    return urls

def download_valid(url, path):
    try:
        subprocess.run(['curl', '-sL', '--max-time', '25', '-A', UA, '-o', path, url],
                       capture_output=True, timeout=35)
        if not os.path.exists(path) or os.path.getsize(path) < 8000:
            if os.path.exists(path): os.remove(path)
            return False
        im = Image.open(path).convert('RGB')
        if im.width < 200 or im.height < 200:
            os.remove(path); return False
        # 统一转 jpg 覆盖
        im.save(path, 'JPEG', quality=85)
        return True
    except Exception:
        if os.path.exists(path): os.remove(path)
        return False

def fetch(terms, outdir, max_total):
    os.makedirs(outdir, exist_ok=True)
    files = []
    for q in terms:
        if len(files) >= max_total: break
        got = 0
        for u in bing_urls(q):
            if len(files) >= max_total or got >= 12: break
            if not u.lower().endswith(('.jpg', '.jpeg')): continue
            fn = hashlib.md5(u.encode()).hexdigest()[:8] + '.jpg'
            fp = os.path.join(outdir, fn)
            if os.path.exists(fp): continue
            if download_valid(u, fp):
                files.append(fn); got += 1
            time.sleep(0.2)
        print(f'  {q!r} 累计 {len(files)}/{max_total}', flush=True)
    print(f'  TOTAL {len(files)} → {outdir}', flush=True)
    return files

if __name__ == '__main__':
    no_terms = ['mandarin orange fruit', 'clementine fruit', 'kumquat fruit',
                'persimmon fruit', 'pomelo fruit', 'apricot fruit', 'tangerine fruit']
    o_terms = ['navel orange fruit', 'blood orange fruit', 'oranges fruit']
    no = fetch(no_terms, f'{OUT}/not_orange_r14', 70)
    ob = fetch(o_terms, f'{OUT}/orange_r14', 45)
    json.dump({'not_orange_r14': no, 'orange_r14': ob,
               'counts': {'not': len(no), 'orange': len(ob)}},
              open(f'{OUT}/summary.json', 'w'))
    print('DONE not=%d orange=%d' % (len(no), len(ob)))
