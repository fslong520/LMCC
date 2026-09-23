# -*- coding: utf-8 -*-
"""第五轮扩数据：广撒网找新场景（2026-09-18）
目标：为「域覆盖」补新素材——不同场景/光照/品种/地点
"""
import json, os, sys, time, urllib.parse, urllib.request, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "测试素材", "_新增候选_r5")
UA = {"User-Agent": "LingyiOJ-Lesson/1.0 (teaching)"}

QUERIES = {
    "orange_r5": [
        "blood orange fruit", "valencia orange", "orange tree ripe fruit",
        "oranges market stall", "orange fruit closeup peel", "organic oranges box",
        "orange fruit wooden table", "oranges sunlight", "orange fruit green leaves",
        "orange citrus fruit whole", "orange fruit knife cut", "orange peel texture",
        "orange juice fresh squeezed", "orange fruit top view", "oranges hanging branch",
        "citrus orange fruit ripe",
    ],
    "notor_r5": [
        "mandarin orange peeled", "tangerine whole fruit", "clementine fruit skin",
        "pomelo whole fruit", "grapefruit whole", "yuzu fruit", "bergamot fruit",
        "citron fruit", "kumquat tree fruit", "calamondin fruit",
        "persimmon ripe fruit", "apricot fruit whole", "peach fruit whole",
        "mango fruit whole", "papaya fruit", "orange bell pepper vegetable",
        "orange basketball ball", "orange pumpkin whole", "orange traffic cone street",
        "orange ceramic bowl empty", "orange fabric cloth", "orange wall painted",
        "wooden table surface", "empty white plate", "green leaves branch",
    ],
}
PER_Q = 10
PAGES = 2
MIN_KB = 6

def search(q, page=1, size=20):
    url = ("https://api.openverse.org/v1/images/?q=" + urllib.parse.quote(q) +
           f"&page_size={size}&page={page}&license_type=all")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def main():
    os.makedirs(OUT, exist_ok=True)
    seen = set()
    for tag, queries in QUERIES.items():
        d = os.path.join(OUT, tag); os.makedirs(d, exist_ok=True)
        got = 0
        for q in queries:
            for pg in range(1, PAGES + 1):
                try:
                    js = search(q, pg)
                except Exception as e:
                    print(f"  [{tag}] {q} p{pg} 失败 {e}"); time.sleep(2); continue
                for it in js.get("results", [])[:PER_Q]:
                    u = it.get("url"); 
                    if not u: continue
                    h = hashlib.md5(u.encode()).hexdigest()[:10]
                    if h in seen: continue
                    seen.add(h)
                    fn = os.path.join(d, f"r5_{tag}_{h}.jpg")
                    if os.path.exists(fn): continue
                    try:
                        req = urllib.request.Request(u, headers=UA)
                        with urllib.request.urlopen(req, timeout=25) as r:
                            data = r.read()
                        if len(data) < MIN_KB * 1024: continue
                        open(fn, "wb").write(data); got += 1
                    except Exception:
                        pass
                time.sleep(0.7)
            print(f"  [{tag}] {q} → 累计 {got}", flush=True)
    print("完成")
    for tag in QUERIES:
        p = os.path.join(OUT, tag)
        print(f"  {tag}: {len(os.listdir(p))} 张")

main()
