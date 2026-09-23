#!/usr/bin/env python3
"""Wikimedia 抓取（curl 绕代理）r12 素材"""
import subprocess, json, os, time, hashlib, urllib.parse

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = f'{BASE}/r12_fetch'

def api_search(term, limit=20, offset=0):
    q = urllib.parse.quote(f'{term} filetype:bitmap')
    url = (f'https://commons.wikimedia.org/w/api.php?action=query&generator=search'
           f'&gsrsearch={q}&gsrnamespace=6&gsrlimit={limit}'
           f'&gsroffset={offset}&prop=imageinfo&iiprop=url&iiurlwidth=300&format=json')
    try:
        r = subprocess.run(['curl', '-s', '--noproxy', '*', '--max-time', '25', url],
                           capture_output=True, text=True, timeout=35)
        data = json.loads(r.stdout)
        return [p for p in data.get('query', {}).get('pages', {}).values()]
    except Exception as e:
        print(f'  api err {term!r}: {e}', flush=True)
        return []

def download(url, path):
    try:
        subprocess.run(['curl', '-s', '--noproxy', '*', '--max-time', '30', '-L', '-o', path, url],
                       capture_output=True, timeout=40)
        return os.path.exists(path) and os.path.getsize(path) > 500
    except Exception:
        return False

def fetch(terms, outdir, max_total):
    os.makedirs(outdir, exist_ok=True)
    files = []
    for term in terms:
        if len(files) >= max_total: break
        offset = 0
        got_term = 0
        while got_term < 15 and len(files) < max_total:
            pages = api_search(term, limit=20, offset=offset)
            if not pages: break
            for p in pages:
                if len(files) >= max_total: break
                ii = p.get('imageinfo') or [{}]
                info = ii[0] if ii else {}
                thumb = info.get('thumburl', '')
                if not thumb: continue
                if not any(thumb.lower().endswith(e) for e in ('.jpg', '.jpeg', '.png', '.webp')):
                    continue
                fn = hashlib.md5(thumb.encode()).hexdigest()[:8] + '.jpg'
                fp = os.path.join(outdir, fn)
                if os.path.exists(fp) and os.path.getsize(fp) > 500:
                    files.append(fn); got_term += 1; continue
                if download(thumb, fp):
                    files.append(fn); got_term += 1
                time.sleep(0.12)
            offset += 20
            time.sleep(0.4)
        print(f'  {term!r} 累计 {len(files)}/{max_total}', flush=True)
    print(f'  TOTAL {len(files)} → {outdir}', flush=True)
    return files

if __name__ == '__main__':
    no_terms = ['tangerine fruit', 'mandarin orange', 'kumquat', 'persimmon fruit',
                'apricot fruit', 'pomelo', 'clementine']
    o_terms  = ['navel orange', 'blood orange', 'orange fruit']
    no = fetch(no_terms, f'{OUT}/not_orange_r12', 60)
    ob = fetch(o_terms, f'{OUT}/orange_r12', 40)
    json.dump({'not_orange_r12': no, 'orange_r12': ob,
               'counts': {'not_orange_r12': len(no), 'orange_r12': len(ob)}},
              open(f'{OUT}/summary.json', 'w'))
    print('DONE not=%d orange=%d' % (len(no), len(ob)))
