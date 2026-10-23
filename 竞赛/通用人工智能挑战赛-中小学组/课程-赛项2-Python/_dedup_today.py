#!/usr/bin/env python3
"""全池重复图清洗（既证法 114d437c：aHash 10×10 汉明≤3 + md5；分流不硬删）
- md5 完全同图：跨类保橙删非橙（平台拒跨类重复铁律），同类保首个
- 近重复（aHash 汉明≤3）：同类保首个；跨类同规则保橙
- 落败图移入 BASE/重复回收_20260922/（池外，可回溯），出 回收清单.tsv
用法: python3 dedup_pool.py [--dry]
"""
import os, sys, json, hashlib, shutil
import numpy as np
from PIL import Image, ImageOps

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, '重复回收_20260925')
DRY = '--dry' in sys.argv
IMG_EXT = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')
SORT = ('橙子', '非橙子', '垃圾')
pools = [l.strip() for l in open(os.path.join(BASE, '池目录.txt')) if l.strip()]

def label(rel):
    s = rel.lower()
    if 'not' in s: return '非橙'
    if 'orange' in s: return '橙'
    return '?'

files = []  # (rel, abs, pool_idx, label)
for pi, p in enumerate(pools):
    root = os.path.join(BASE, p)
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SORT and not d.startswith('.')]
        for fn in sorted(filenames):
            if fn.lower().endswith(IMG_EXT):
                fp = os.path.abspath(os.path.join(dirpath, fn))
                rel = os.path.relpath(fp, BASE)
                files.append((rel, fp, pi, label(rel)))
print(f'入池 {len(files)} 张', flush=True)

manifest = []   # (new_rel, orig_rel, reason, kept_rel)
def recycle(idx, reason, kept_rel):
    rel, fp, pi, lb = files[idx]
    if DRY:
        manifest.append(('(dry)', rel, reason, kept_rel)); return True
    pool_tag = pools[pi].replace('/', '__')
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, f'{pool_tag}__{os.path.basename(rel)}')
    k = 1
    while os.path.exists(dst):
        b, e = os.path.splitext(os.path.basename(rel))
        dst = os.path.join(OUT, f'{pool_tag}__{b}_{k}{e}'); k += 1
    shutil.move(fp, dst)
    manifest.append((os.path.relpath(dst, BASE), rel, reason, kept_rel))
    return True

# ---- 1) md5 完全同图 ----
by_md5 = {}
for i, (rel, fp, pi, lb) in enumerate(files):
    h = hashlib.md5(open(fp, 'rb').read()).hexdigest()
    by_md5.setdefault(h, []).append(i)
n_exact = n_cross = 0
for h, idxs in by_md5.items():
    if len(idxs) < 2: continue
    n_exact += len(idxs) - 1
    labels = {files[i][3] for i in idxs}
    if len(labels - {'?'}) > 1: n_cross += 1
    oranges = [i for i in idxs if files[i][3] == '橙']
    keep = oranges[0] if oranges else idxs[0]
    for i in idxs:
        if i == keep: continue
        cross = (files[i][3] != files[keep][3])
        recycle(i, 'md5跨类保橙' if cross else 'md5同类保首', files[keep][0])
surv = [i for i in range(len(files))
        if os.path.exists(files[i][1])]
print(f'md5 完全同图: 移走 {n_exact} 张（跨类冲突组 {n_cross}）', flush=True)

# ---- 2) aHash 10×10 汉明≤3 近重复 ----
def ahash(fp):
    im = ImageOps.exif_transpose(Image.open(fp)).convert('L').resize((10, 10))
    a = np.asarray(im, dtype=np.float32)
    return (a > a.mean()).ravel()
H = {}
for i in surv:
    try:
        H[i] = ahash(files[i][1])
    except Exception:
        pass
kept = []       # idx 列表（保留在池内）
n_near = n_near_cross = 0
for i in surv:
    if i not in H:
        kept.append(i); continue
    if not kept:
        kept.append(i); continue
    Hk = np.stack([H[k] for k in kept])
    d = (Hk != H[i]).sum(axis=1)
    m = np.where(d <= 3)[0]
    if len(m) == 0:
        kept.append(i); continue
    m_橙 = [kept[j] for j in m if files[kept[j]][3] == '橙']
    if m_橙:                       # 已有橙同图在池，落败方出局
        cross = files[i][3] != '橙'
        if cross: n_near_cross += 1
        recycle(i, 'aHash跨类保橙' if cross else 'aHash同类保首', files[m_橙[0]][0])
        n_near += 1
    elif files[i][3] == '橙':      # 本图是橙、匹配者全非橙 → 撤非橙保橙
        for j in m:
            k = kept[j]
            recycle(k, 'aHash跨类保橙', files[i][0])
            kept.remove(k)
            n_near += 1; n_near_cross += 1
        kept.append(i)
    else:
        recycle(i, 'aHash同类保首', files[kept[m[0]]][0])
        n_near += 1
print(f'aHash 近重复(≤3): 移走 {n_near} 张（其中跨类 {n_near_cross}）', flush=True)

# ---- 出账 ----
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, '回收清单.tsv'), 'w') as f:
    f.write('回收位置\t原路径\t原因\t保留图\n')
    for r in manifest:
        f.write('\t'.join(r) + '\n')
remain = sum(1 for _, fp, _, _ in files if os.path.exists(fp))
print(f'合计移走 {len(manifest)} 张 → {OUT}')
print(f'池内剩余 {remain} 张')
from collections import Counter
print(dict(Counter(r[2] for r in manifest)))
