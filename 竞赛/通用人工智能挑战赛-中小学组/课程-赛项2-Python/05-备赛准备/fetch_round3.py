# -*- coding: utf-8 -*-
"""
第三轮扩数据（2026-09-18）：贴近真实测试分布
  orange3 = 橙子更多场景/状态
  notor3  = 橙色物体 + 日常背景 + 其他橙色调水果（真实测试集最易出现）
"""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "测试素材", "_新增候选")
UA = {"User-Agent": "LingyiOJ-Lesson/1.0 (teaching; contact: fslong@lesson)"}

CATS = {
    "orange3": [
        "Category:Orange juice glasses", "Category:Oranges on plates",
        "Category:Orange peel", "Category:Citrus fruit sections",
        "Category:Orange farms", "Category:Orange picking",
        "Category:Orange crates", "Category:Candied orange",
        "Category:Orange marmalade", "Category:Oranges in markets",
    ],
    "notor3": [
        "Category:Kitchen tables", "Category:Wooden tables",
        "Category:Grass", "Category:Orange bowls", "Category:Orange cups",
        "Category:Rubber balls", "Category:Peaches", "Category:Nectarines",
        "Category:Red apples", "Category:Bell peppers", "Category:Cheese",
        "Category:Bread", "Category:Orange signs", "Category:Orange cars",
        "Category:Orange houses", "Category:Orange sky",
    ],
}
PER_CAT = 14
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
        print(f"[跳过] {cat}: {e}", flush=True)
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
                except Exception:
                    pass
            print(f"{cat}: +{got-n0} (累计 {got})", flush=True)
        print(f"== {group}: {got} 张", flush=True)
    with open(os.path.join(OUT, "manifest_round3.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print("DONE")

if __name__ == "__main__":
    main()
