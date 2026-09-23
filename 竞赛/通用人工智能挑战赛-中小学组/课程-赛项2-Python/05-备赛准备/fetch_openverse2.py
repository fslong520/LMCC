# -*- coding: utf-8 -*-
"""
第四轮扩数据（2026-09-18）：针对短板
  短板 = 非橙子召回仅 60%（像橙子的非橙子被判成橙子）
  notor_ov2 = 重点补柑橘类近物 + 橙色物体（每词多页）
  orange_ov2 = 补橙子多样性（每词多页）
产出：../测试素材/_新增候选/{orange_ov2,notor_ov2}/
"""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "测试素材", "_新增候选")
UA = {"User-Agent": "LingyiOJ-Lesson/1.0 (teaching)"}

QUERIES = {
    "orange_ov2": ["orange fruit", "navel orange fruit", "orange slices plate",
                   "oranges basket", "orange orchard fruit", "orange harvest crate"],
    "notor_ov2": ["tangerine fruit", "mandarin orange fruit", "clementine fruit",
                  "satsuma orange", "kumquat fruit", "pomelo fruit",
                  "grapefruit slice", "lemon slice", "lime fruit",
                  "persimmon fruit", "apricot fruit", "pumpkin orange",
                  "butternut squash", "sweet potato", "orange bell pepper",
                  "orange ball toy", "orange traffic cone", "orange shirt",
                  "wooden table top", "human hand palm"],
}
PER_Q = 12
PAGES = 2
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
            for pg in range(1, PAGES + 1):
                if got - n0 >= PER_Q:
                    break
                try:
                    data = search(q, page=pg)
                except Exception as e:
                    print(f"[跳过] {q} p{pg}: {e}", flush=True); time.sleep(3); continue
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
                time.sleep(1.2)
            print(f"{q}: +{got-n0} (累计 {got})", flush=True)
        print(f"== {group}: {got} 张", flush=True)
    with open(os.path.join(OUT, "manifest_ov2.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print("DONE")

if __name__ == "__main__":
    main()
