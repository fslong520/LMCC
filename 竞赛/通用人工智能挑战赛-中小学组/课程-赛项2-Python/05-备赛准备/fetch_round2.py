# -*- coding: utf-8 -*-
"""
Wikimedia Commons 第二轮扩数据（2026-09-18）
目标：把两类样本量各推到 150+，并大幅增加多样性。
  orange2 = 橙子多品种/多场景
  notor2  = 橙色但非橙子的物体 + 其他水果 + 日常场景（贴近真实测试分布）
产出：../测试素材/_新增候选/{orange2,notor2}/
"""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "测试素材", "_新增候选")
UA = {"User-Agent": "LingyiOJ-Lesson/1.0 (teaching; contact: fslong@lesson)"}

CATS = {
    "orange2": [
        "Category:Orange cultivars", "Category:Oranges by country",
        "Category:Citrus sinensis", "Category:Cara cara oranges",
        "Category:Orange harvest", "Category:Oranges in bowls",
        "Category:Orange juice", "Category:Orange slices",
        "Category:Peeled oranges", "Category:Orange trees",
        "Category:Blood oranges", "Category:Navel oranges",
    ],
    "notor2": [
        "Category:Pumpkins", "Category:Persimmons", "Category:Apricots",
        "Category:Tangerines", "Category:Mandarins (fruit)", "Category:Grapefruits",
        "Category:Lemons", "Category:Limes (fruit)", "Category:Apples",
        "Category:Tomatoes", "Category:Carrots", "Category:Traffic cones",
        "Category:Basketballs", "Category:Orange clothing",
        "Category:Orange flowers", "Category:Tables", "Category:Hands",
    ],
}
PER_CAT = 16
MIN_KB = 8

def api(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def cat_files(cat, limit=40):
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
    manifest = []
    for group, cats in CATS.items():
        outdir = os.path.join(OUT, group)
        os.makedirs(outdir, exist_ok=True)
        got, seen = 0, set()
        for cat in cats:
            n0 = got
            for title, url, thumb in cat_files(cat):
                if got - n0 >= PER_CAT:
                    break
                if title in seen:
                    continue
                seen.add(title)
                safe = f"{group}_{got:03d}.jpg"
                path = os.path.join(outdir, safe)
                try:
                    download(thumb or url, path)
                    if os.path.getsize(path) < MIN_KB * 1024:
                        os.remove(path); continue
                    manifest.append({"group": group, "file": safe, "source": title, "cat": cat})
                    got += 1
                    time.sleep(0.2)
                except Exception as e:
                    print(f"[失败] {title}: {e}")
            print(f"{cat}: +{got-n0} (累计 {got})", flush=True)
        print(f"== {group}: {got} 张\n", flush=True)
    with open(os.path.join(OUT, "manifest_round2.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print("DONE")

if __name__ == "__main__":
    main()
