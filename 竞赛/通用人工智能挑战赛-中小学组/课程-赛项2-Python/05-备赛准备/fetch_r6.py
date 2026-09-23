# -*- coding: utf-8 -*-
"""第六轮扩数据：侧重真实生活场景 + 更多易混物"""
import json, os, sys, time, urllib.parse, urllib.request, hashlib

HERE = "/home/fslong/Documents/blog/uploads/statics/lesson/LMCC/竞赛/通用人工智能挑战赛-中小学组/课程-赛项2-Python/05-备赛准备"
OUT = os.path.join(HERE, "..", "测试素材", "_新增候选_r6")
UA = {"User-Agent": "LingyiOJ-Lesson/1.0 (teaching)"}

QUERIES = {
    "orange_r6": [
        "oranges grocery store shelf", "orange fruit kitchen counter",
        "orange slices dessert plate", "orange marmalade jar",
        "candied orange peel", "orange blossom flower",
        "orange fruit hand holding", "orange fruit paper bag",
        "oranges crate farm", "orange fruit macro texture",
        "orange fruit shadow sunlight", "orange juice glass breakfast",
        "orange fruit cut half seeds", "orange citrus tree leaves",
        "orange fruit still life", "satsuma orange whole",
        "tangelo fruit", "cara cara orange",
    ],
    "notor_r6": [
        "kumquat jar preserve", "yuzu citrus fruit", "sudachi citrus",
        "finger lime citrus", "buddha hand citron", "tangerine peel dried",
        "grapefruit halved", "pomelo peeled segments",
        "apricot dried fruit", "nectarine fruit whole", "peach slices bowl",
        "persimmon dried hoshigaki", "loquat fruit", "quince fruit",
        "yellow apple fruit", "golden apple fruit",
        "orange soda can", "orange plastic bucket",
        "orange tshirt clothing", "orange autumn leaves",
        "orange sunset sky", "orange fire flame",
        "cardboard box empty", "gray concrete wall",
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
                    fn = os.path.join(d, f"r6_{tag}_{h}.jpg")
                    if os.path.exists(fn): continue
                    try:
                        req = urllib.request.Request(u, headers=UA)
                        with urllib.request.urlopen(req, timeout=25) as r:
                            data = r.read()
                        if len(data) < MIN_KB * 1024: continue
                        open(fn, "wb").write(data); got += 1
                    except Exception:
                        pass
                time.sleep(0.6)
            print(f"  [{tag}] {q} → {got}", flush=True)
        print(f"{tag}: {len(os.listdir(d))} 张")

main()
