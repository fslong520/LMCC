# -*- coding: utf-8 -*-
"""
Wikimedia Commons 批量拉图（教学用，CC 授权）
按分类拉取：橙子正样本 + 难例负样本（橘子/杏/柿子/南瓜等）
产出：../测试素材/_新增候选/orange_new/、notor_new/（待人工质检后再并入训练集）
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
    "orange_new": [
        "Category:Oranges",
        "Category:Orange (fruit)",
        "Category:Orange fruit on the tree",
        "Category:Peeled oranges",
    ],
    "notor_new": [
        "Category:Tangerines",
        "Category:Mandarins (fruit)",
        "Category:Apricots",
        "Category:Persimmons",
        "Category:Pumpkins",
    ],
}
PER_CAT = 45          # 每个分类最多取多少张（含已去重）
MIN_KB = 8            # 太小的图多半是图标/缩略图

def api(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def cat_files(cat, limit=60):
    """返回 [(title, url, thumburl)]"""
    url = ("https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers"
           f"&gcmtitle={urllib.parse.quote(cat)}&gcmtype=file&gcmlimit={limit}"
           "&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=400&format=json")
    data = api(url)
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
        got = 0
        seen = set()
        for cat in cats:
            if got >= PER_CAT:
                break
            try:
                items = cat_files(cat)
            except Exception as e:
                print(f"[跳过] {cat}: {e}")
                continue
            for title, url, thumb in items:
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
                    time.sleep(0.3)   # 礼貌限速
                except Exception as e:
                    print(f"[失败] {title}: {e}")
            print(f"{cat}: 累计 {got}")
        print(f"== {group}: 共 {got} 张\n")
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f"清单：{os.path.join(OUT, 'manifest.json')}（含来源文件名，版权可溯）")

if __name__ == "__main__":
    main()
