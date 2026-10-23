#!/usr/bin/env python3
"""导出最优配方素材到提交目录（平台上传用）
用法: export_recipe.py <橙N> <橙mode> <非橙M> <非橙mode> [--out 目录名]
"""
import os, sys, json, zipfile, shutil
import numpy as np

BASE = '/home/fslong/Documents/blog/uploads/statics/lesson/LMCC/竞赛/通用人工智能挑战赛-中小学组/课程-赛项2-Python'
os.chdir(BASE)
F3 = os.path.join(BASE, 'feat3')

def load(tag):
    d = np.load(f'{F3}/{tag}.npz', allow_pickle=True)
    return list(zip(d['names'].tolist(), d['F']))

def unit(F):
    return F / np.maximum(np.linalg.norm(F, axis=1, keepdims=True), 1e-8)

def dedup(items, thr=0.95):
    items = sorted(items, key=lambda x: x[0])
    if not items:
        return []
    F = np.array([it[1] for it in items]); Fu = unit(F); sim = Fu @ Fu.T
    keep, dead = [], set()
    for i in range(len(items)):
        if i in dead:
            continue
        keep.append(items[i])
        for j in np.where(sim[i] > thr)[0]:
            if j > i:
                dead.add(j)
    return keep

z = zipfile.ZipFile('赛项2定版_r7_真实86/识物模型_r7B_平台90_真实86.zip')
mj = json.loads(z.read('model.json')); off = 0; Ps = {}
for w in mj['weightsManifest'][0]['weights']:
    n = int(np.prod(w['shape']))
    Ps[w['name']] = np.frombuffer(z.read('weights.bin'), dtype='<f4', count=n, offset=off).reshape(w['shape'])
    off += n * 4
W1 = [v for k, v in Ps.items() if k.endswith('kernel') and v.shape[0] == 1280][0]
b1 = [v for k, v in Ps.items() if k.endswith('bias') and v.shape[0] == 100][0]
W2 = [v for k, v in Ps.items() if k.endswith('kernel') and v.shape[0] == 100][0]
b2 = [v for k, v in Ps.items() if k.endswith('bias') and v.shape[0] == 2][0]

def r7b_p(F):
    h = np.maximum(F @ W1 + b1, 0); lg = h @ W2 + b2
    e = np.exp(lg - lg.max(axis=1, keepdims=True))
    return float((e / e.sum(axis=1, keepdims=True))[0, 0])

allO, allN = [], []
for f in sorted(os.listdir(F3)):
    if not f.endswith('.npz'):
        continue
    tgt = allO if f.endswith('__橙子.npz') else allN
    for nm, F in load(f[:-4]):
        tgt.append((nm, F))
allO = [(nm, F, r7b_p(F[None])) for nm, F in dedup(allO)]
allN = [(nm, F, r7b_p(F[None])) for nm, F in dedup(allN)]

def pick(items, n, mode, seed=7):
    if n >= len(items):
        return list(items)
    g = np.random.default_rng(seed)
    s_by_p = sorted(items, key=lambda x: x[2])
    if mode == 'random':
        idx = g.permutation(len(items))[:n]
        return [items[i] for i in sorted(idx)]
    if mode == 'spread':
        idx = np.linspace(0, len(s_by_p) - 1, n).astype(int)
        return [s_by_p[i] for i in sorted(set(idx.tolist()))]
    if mode == 'p_desc':
        return sorted(items, key=lambda x: -x[2])[:n]
    if mode == 'p_mid':
        m = len(s_by_p); lo = int(m * 0.15); hi = int(m * 0.95)
        mid = s_by_p[lo:hi]
        idx = np.linspace(0, len(mid) - 1, min(n, len(mid))).astype(int)
        return [mid[i] for i in sorted(set(idx.tolist()))]
    if mode == 'hi_spread':
        hi = s_by_p[int(len(s_by_p) * 0.4):]
        idx = np.linspace(0, len(hi) - 1, min(n, len(hi))).astype(int)
        return [hi[i] for i in sorted(set(idx.tolist()))]
    if mode == 'diverse':
        F = np.array([x[1] for x in items]); Fu = unit(F)
        sel = [int(np.argmax(np.array([x[2] for x in items])))]
        for _ in range(min(n, len(items)) - 1):
            sim = Fu @ Fu[sel].T
            score = 1 - sim.max(axis=1); score[sel] = -1
            sel.append(int(np.argmax(score)))
        return [items[i] for i in sel]
    raise ValueError(mode)

if __name__ == '__main__':
    no, mo, nn, mn = int(sys.argv[1]), sys.argv[2], int(sys.argv[3]), sys.argv[4]
    out = sys.argv[sys.argv.index('--out')+1] if '--out' in sys.argv else f'提交配方_O{no}_N{nn}'
    oL = pick(allO, no, mo); nL = pick(allN, nn, mn)
    os.makedirs(f'{out}/orange', exist_ok=True)
    os.makedirs(f'{out}/not_orange', exist_ok=True)
    for nm, F, p in oL:
        ext = os.path.splitext(nm)[1]
        shutil.copy2(nm, f'{out}/orange/{os.path.basename(nm)}')
    for nm, F, p in nL:
        shutil.copy2(nm, f'{out}/not_orange/{os.path.basename(nm)}')
    json.dump({'orange': [x[0] for x in oL], 'not_orange': [x[0] for x in nL],
               'orange_p_range': [min(x[2] for x in oL), max(x[2] for x in oL)],
               'not_p_range': [min(x[2] for x in nL), max(x[2] for x in nL)]},
              open(f'{out}/manifest.json', 'w'), ensure_ascii=False, indent=1)
    print(f'导出 橙 {len(oL)} + 非橙 {len(nL)} -> {out}/')
    print(f'  橙 p 范围 {min(x[2] for x in oL):.3f}~{max(x[2] for x in oL):.3f}')
    print(f'  非橙 p 范围 {min(x[2] for x in nL):.3f}~{max(x[2] for x in nL):.3f}')
