#!/usr/bin/env python3
"""r13 素材抓取：Openverse API（走代理）"""
import subprocess, json, os, time, hashlib, urllib.parse

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = f'{BASE}/r13_fetch'

def api(q, page=1, n=20):
    url = (f'https://api.openverse.org/v1/images/?q={urllib.parse.quote(q)}'
           f'&page={page}&page_size={n}&mature=false&extension=jpg')
    try:
        r = subprocess.run(['curl', '-s', '--max-time', '30', url],
                           capture_output=True, text=True, timeout=40)
        d = json.loads(r.stdout)
        return d.get('results', [])
    except Exception as e:
        print(f'  api err {q!r}: {e}', flush=True)
        return []

def download(url, path):
    try:
        subprocess.run(['curl', '-sL', '--max-time', '30', '-o', path, url],
                       capture_output=True, timeout=40)
        ok = os.path.exists(path) and os.path.getsize(path) > 8000
        if not ok and os.path.exists(path): os.remove(path)
        return ok
    except Exception:
        return False

def fetch(terms, outdir, per_term=12, max_total=80):
    os.makedirs(outdir, exist_ok=True)
    files = []
    for q in terms:
        if len(files) >= max_total: break
        got = 0
        for page in (1, 2):
            if len(files) >= max_total or got >= per_term: break
            for r in api(q, page=page):
                if len(files) >= max_total or got >= per_term: break
                thumb = r.get('thumbnail') or r.get('url', '')
                if not thumb: continue
                fn = hashlib.md5(r.get('id', thumb).encode()).hexdigest()[:8] + '.jpg'
                fp = os.path.join(outdir, fn)
                if os.path.exists(fp): continue
                if download(thumb, fp):
                    files.append(fn); got += 1
                time.sleep(0.15)
        print(f'  {q!r} 累计 {len(files)}', flush=True)
    print(f'  TOTAL {len(files)} → {outdir}', flush=True)
    return files

if __name__ == '__main__':
    no_terms = ['mandarin orange fruit', 'tangerine fruit', 'kumquat', 'persimmon fruit',
                'pomelo fruit', 'clementine fruit', 'apricot fruit', 'satsuma mandarin']
    o_terms = ['navel orange fruit', 'blood orange fruit', 'orange fruit tree', 'orange citrus whole']
    no = fetch(no_terms, f'{OUT}/not_orange_r13', per_term=10, max_total=70)
    ob = fetch(o_terms, f'{OUT}/orange_r13', per_term=12, max_total=45)
    json.dump({'not_orange_r13': no, 'orange_r13': ob,
               'counts': {'not': len(no), 'orange': len(ob)}},
              open(f'{OUT}/summary.json', 'w'))
    print('DONE not=%d orange=%d' % (len(no), len(ob)))
