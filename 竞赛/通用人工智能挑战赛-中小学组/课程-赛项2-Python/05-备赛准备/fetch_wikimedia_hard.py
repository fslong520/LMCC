# -*- coding: utf-8 -*-
"""
Wikimedia Commons 批量拉图（教学用，CC 授权）— 难例补充版
针对识物工坊「橙子/非橙子」二分类：补橘子、柑、椪柑、柚子、葡萄柚等橙色调近物。
产出：../测试素材/_新增候选/{tangerine,pomelo,mandarin}_new/（待视觉质检后并入）
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "测试素材", "_新增候选")
UA = {"User-Agent": "LingyiOJ-Lesson/1.0 (teaching; contact: fslong@lesson)"}

CATS = {
    "tangerine_new": [
        "Category:Tangerines",
        "Category:Mandarins (fruit)",
        "Category:Citrus reticulata",
        "Category:Clementines",
        "Category:Satsuma",
    ],
    "pomelo_new": [
        "Category:Pomelos",
        "Category:Citrus maxima",
        "Category:Grapefruits",
        "Category:Citrus paradisi",
        "Category:Yuzu",
    ],
    "mandarin_new": [
        "Category:Kumquats",
        "Category:Citrus unshiu",
        "Category:Citrus fruits",
        "Category:Bitter oranges",
    ],
}
PER_CAT = 30
MIN_KB = 8

def api(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def cat_files(cat, limit=60):
    url = ("https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers"
           f"&gcmtitle={urllib.parse.quote(cat)}&gcmtype=file&gcmlimit={limit}"
           "&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=400&format=json")
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
    manifest_path = os.path.join(OUT, "manifest2.json")
    manifest = []
    for group, cats in CATS.items():
        outdir = os.path.join(OUT, group)
        os.makedirs(outdir, exist_ok=True)
        got = 0
        seen = set()
        for cat in cats:
            if got >= PER_CAT:
                break
            for title, url, thumb in cat_files(cat):
                if got >= PER_CAT:
                    break
                if title in seen:
                    continue
                seen.add(title)
                safe = f"{group}_{got:03d}.jpg"
                path = os.path.join(outdir, safe)
                try:
                    download(thumb or url, path)
                    if os.path.getsize(path) < MIN_KB * 1024:
                        os.remove(path)
                        continue
                    manifest.append({"group": group, "file": safe, "source": title,
                                     "license_note": "Wikimedia Commons, 见原文件页"})
                    got += 1
                    time.sleep(0.25)
                except Exception as e:
                    print(f"[失败] {title}: {e}")
            print(f"{cat}: 累计 {got}")
        print(f"== {group}: 共 {got} 张\n")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f"清单：{manifest_path}")

if __name__ == "__main__":
    main()
