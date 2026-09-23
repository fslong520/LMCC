# -*- coding: utf-8 -*-
"""
Openverse 扩数据（2026-09-18）：真实照片风格，贴近比赛测试分布
  orange_ov = 橙子（多查询词）
  notor_ov  = 非橙子（橘子/柑/柚/柠檬/苹果/南瓜/橙色物体/日常背景）
产出：../测试素材/_新增候选/{orange_ov,notor_ov}/
"""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "测试素材", "_新增候选")
UA = {"User-Agent": "LingyiOJ-Lesson/1.0 (teaching)"}

QUERIES = {
    "orange_ov": ["navel orange", "blood orange fruit", "orange slice",
                  "orange tree fruit", "oranges pile", "orange peel",
                  "orange fruit white background", "cut orange"],
    "notor_ov": ["tangerine", "mandarin orange", "pomelo", "grapefruit",
                 "lemon fruit", "lime fruit", "red apple", "pumpkin",
                 "persimmon", "apricot", "basketball", "traffic cone",
                 "orange ball", "wooden table", "human hand palm"],
}
PER_Q = 14
MIN_KB = 8

def search(q, page=1, size=20):
    url = ("https://api.openverse.org/v1/images/?q=" + urllib.parse.quote(q) +
           f"&page_size={size}&page={page}&license_type=all")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode())

def download(url, path):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
        f.write(r.read())

def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    manifest = []
    for group, queries in QUERIES.items():
        outdir = os.path.join(OUT, group)
        os.makedirs(outdir, exist_ok=True)
        got = 0
        for q in queries:
            n0 = got
            try:
                data = search(q)
            except Exception as e:
                print(f"[跳过] {q}: {e}", flush=True); time.sleep(3); continue
            for item in data.get("results", []):
                if got - n0 >= PER_Q:
                    break
                url = item.get("url")
                if not url:
                    continue
                safe = f"{group}_{got:03d}.jpg"
                path = os.path.join(outdir, safe)
                try:
                    download(url, path)
                    if os.path.getsize(path) < MIN_KB * 1024:
                        os.remove(path); continue
                    manifest.append({"group": group, "file": safe, "query": q,
                                     "source": item.get("foreign_landing_url"),
                                     "license": item.get("license")})
                    got += 1
                    time.sleep(0.3)
                except Exception:
                    pass
            print(f"{q}: +{got-n0} (累计 {got})", flush=True)
            time.sleep(1.5)
        print(f"== {group}: {got} 张", flush=True)
    with open(os.path.join(OUT, "manifest_openverse.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print("DONE")

if __name__ == "__main__":
    main()
