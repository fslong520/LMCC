# -*- coding: utf-8 -*-
"""第七轮：专攻「像橙子的非橙子」难例（吸取 r6 教训，不放橙色杂物）"""
import json, os, sys, time, urllib.parse, urllib.request, hashlib

HERE = "/home/fslong/Documents/blog/uploads/statics/lesson/LMCC/竞赛/通用人工智能挑战赛-中小学组/课程-赛项2-Python/05-备赛准备"
OUT = os.path.join(HERE, "..", "测试素材", "_新增候选_r7")
UA = {"User-Agent": "LingyiOJ-Lesson/1.0 (teaching)"}

QUERIES = {
    "notor_r7": [
        "ponkan citrus fruit", "dekopon citrus", "harumi citrus fruit",
        "shiranui mandarin", "unshiu mikan orange", "satsuma mandarin fruit",
        "kishu mandarin", "mandarin orange closeup peel",
        "tangerine whole fruit skin", "clementine whole fruit peeled",
        "bitter orange fruit", "sweet lime citrus", "kaffir lime fruit",
        "meyer lemon whole", "eureka lemon fruit", "yuzu whole fruit",
        "yuzu citrus tree", "citron buddha hand", "kumquat whole fruit",
        "kumquat branch fruit", "calamansi citrus", "tangelo minneola",
        "ugli fruit citrus", "tangelo fruit whole",
        "persimmon whole fruit ripe", "persimmon fuyu fruit",
        "loquat fruit ripe yellow", "apricot fruit closeup",
        "nectarine fruit closeup", "yellow peach fruit whole",
    ],
    "orange_r7": [
        "navel orange whole fruit", "orange fruit peel closeup",
        "orange fruit cut cross section", "valencia orange whole",
        "blood orange cut fruit", "orange fruit single white background",
        "orange fruit three whole", "clementine vs orange",
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
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for tag, queries in QUERIES.items():
        if only and only not in tag: continue
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
                    fn = os.path.join(d, f"r7_{tag}_{h}.jpg")
                    if os.path.exists(fn): continue
                    try:
                        req = urllib.request.Request(u, headers=UA)
                        with urllib.request.urlopen(req, timeout=25) as r:
                            data = r.read()
                        if len(data) < MIN_KB * 1024: continue
                        open(fn, "wb").write(data); got += 1
                    except Exception:
                        pass
                time.sleep(0.5)
            print(f"  [{tag}] {q} → {got}", flush=True)
        print(f"{tag}: {len(os.listdir(d))} 张")

main()
