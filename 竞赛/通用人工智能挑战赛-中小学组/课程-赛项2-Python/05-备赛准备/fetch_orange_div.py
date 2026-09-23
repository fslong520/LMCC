# -*- coding: utf-8 -*-
"""
Wikimedia Commons 拉取「多样化橙子」正样本（教学用，CC 授权）
目标：补足角度/场景/形态多样性，而非再堆同质"橙子堆"。
分类偏重：单果、切面、树上、果汁、果皮、不同品种、不同光照。
产出：../测试素材/_新增候选/orange_div/
"""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "测试素材", "_新增候选")
UA = {"User-Agent": "LingyiOJ-Lesson/1.0 (teaching; contact: fslong@lesson)"}

CATS = [
    "Category:Orange juice",
    "Category:Orange peels",
    "Category:Oranges on white background",
    "Category:Citrus sinensis",
    "Category:Blood oranges",
    "Category:Navel oranges",
    "Category:Valencia oranges",
    "Category:Orange trees",
    "Category:Cut oranges",
    "Category:Orange slices",
    "Category:Oranges in art",
    "Category:Orange (fruit) in containers",
]
PER_CAT = 22
MIN_KB = 8
GROUP = "orange_div"

def api(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def cat_files(cat, limit=50):
    url = ("https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers"
           f"&gcmtitle={urllib.parse.quote(cat)}&gcmtype=file&gcmlimit={limit}"
           "&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=420&format=json")
    try:
        data = api(url)
    except Exception as e:
        print(f"[跳过] {cat}: {e}")
        return []
    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    for p in pages.values():
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("mime") not in ("image/jpeg", "image/png"):
            continue
        if info.get("width", 0) < 300 or info.get("height", 0) < 300:
            continue
        out.append((p["title"], info.get("url"), info.get("thumburl")))
    return out

def download(url, path):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
        f.write(r.read())

def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    outdir = os.path.join(OUT, GROUP)
    os.makedirs(outdir, exist_ok=True)
    manifest, seen, got = [], set(), 0
    for cat in CATS:
        n_before = got
        for title, url, thumb in cat_files(cat):
            if got - n_before >= PER_CAT:
                break
            if title in seen:
                continue
            seen.add(title)
            safe = f"{GROUP}_{got:03d}.jpg"
            path = os.path.join(outdir, safe)
            try:
                download(thumb or url, path)
                if os.path.getsize(path) < MIN_KB * 1024:
                    os.remove(path); continue
                manifest.append({"group": GROUP, "file": safe, "source": title,
                                 "cat": cat, "license_note": "Wikimedia Commons"})
                got += 1
                time.sleep(0.25)
            except Exception as e:
                print(f"[失败] {title}: {e}")
        print(f"{cat}: +{got - n_before} (累计 {got})")
    with open(os.path.join(OUT, "manifest_orange_div.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f"== 共 {got} 张 → {outdir}")

if __name__ == "__main__":
    main()
