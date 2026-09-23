# -*- coding: utf-8 -*-
"""第九轮：专攻橙子多样性（品种/场景/光照/状态），补旧素材橙子短板"""
import json, os, sys, time, urllib.parse, urllib.request, hashlib

HERE = "/home/fslong/Documents/blog/uploads/statics/lesson/LMCC/竞赛/通用人工智能挑战赛-中小学组/课程-赛项2-Python/05-备赛准备"
OUT = os.path.join(HERE, "..", "测试素材", "_新增候选_r9")
UA = {"User-Agent": "LingyiOJ-Lesson/1.0 (teaching)"}

QUERIES = {
    "orange_r9": [
        "orange fruit supermarket display", "oranges stacked pyramid market",
        "orange fruit basket wicker", "oranges cardboard box delivery",
        "orange fruit picnic outdoor", "orange fruit window light",
        "oranges backlit sunlight", "orange fruit dark background",
        "orange fruit on plate breakfast", "orange fruit juice glass table",
        "orange fruit peeled segments", "orange fruit knife board",
        "orange fruit half cut juicy", "orange fruit peel spiral",
        "blood orange sliced plate", "cara cara orange sliced",
        "navel orange single fruit", "valencia orange juice fruit",
        "orange fruit hanging tree branch", "orange orchard harvest basket",
        "orange fruit farm crate", "orange fruit green market",
        "orange fruit stall vendor", "orange fruit close macro",
        "orange fruit whole three plate", "orange fruit bowl kitchen",
        "orange fruit hand picking", "orange fruit tree closeup",
        "orange citrus fruit assortment", "orange fruit wooden crate",
        "orange fruit white bowl", "orange fruit rustic table",
        "orange fruit peeled whole", "orange fruit slice arrangement",
        "orange fruit dessert garnish", "orange zest grater",
        "orange fruit bag mesh", "orange fruit plastic container",
        "orange fruit street vendor", "orange fruit still life painting",
    ],
}
PER_Q = 8
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
                    print(f"  [{tag}] {q} p{pg} 失败 {str(e)[:40]}"); time.sleep(2); continue
                for it in js.get("results", [])[:PER_Q]:
                    u = it.get("url")
                    if not u: continue
                    h = hashlib.md5(u.encode()).hexdigest()[:10]
                    if h in seen: continue
                    seen.add(h)
                    fn = os.path.join(d, f"r9_{tag}_{h}.jpg")
                    if os.path.exists(fn): continue
                    try:
                        req = urllib.request.Request(u, headers=UA)
                        with urllib.request.urlopen(req, timeout=25) as r:
                            data = r.read()
                        if len(data) < MIN_KB * 1024: continue
                        open(fn, "wb").write(data); got += 1
                    except Exception:
                        pass
                time.sleep(0.4)
            print(f"  [{tag}] {q} → {got}", flush=True)
        print(f"{tag}: {len(os.listdir(d))} 张")

main()
