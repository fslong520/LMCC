#!/usr/bin/env python3
"""v5：按平台打分口径（(橙正确率+非橙正确率)/2）优化橙子选样
橙子 6 种策略 × 非橙 3 种，5 折交叉验证，目标 = 平衡分
"""
import os, sys, json, time, zipfile
import numpy as np

BASE = '/home/fslong/Documents/blog/uploads/statics/lesson/LMCC/竞赛/通用人工智能挑战赛-中小学组/课程-赛项2-Python'
os.chdir(BASE)
sys.path.insert(0, BASE)
from head_np import train, logitdiff

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
print(f'去重后 橙 {len(allO)} 非橙 {len(allN)}', flush=True)

def pick(items, n, mode, seed=0):
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
        # 取 p 中段（去掉最像与最不像的极端）
        m = len(s_by_p); lo = int(m * 0.15); hi = int(m * 0.95)
        mid = s_by_p[lo:hi]
        idx = np.linspace(0, len(mid) - 1, min(n, len(mid))).astype(int)
        return [mid[i] for i in sorted(set(idx.tolist()))]
    if mode == 'hi_spread':
        # 上半段（p 较高的 60%）内均匀散布——历史「前 N 名甜点区」的宽松版
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

O_MODES = ['random', 'spread', 'p_desc', 'p_mid', 'hi_spread', 'diverse']
N_MODES = ['spread', 'random', 'p_mid']
NO = 100
NN = 100
FOLDS = 5
res = {}
t0 = time.time()
for fi in range(FOLDS):
    rng = np.random.default_rng(2000 + fi)
    def split(items, frac=0.2):
        idx = rng.permutation(len(items)); k = int(len(items) * frac)
        vi = set(idx[:k].tolist())
        return ([items[i] for i in range(len(items)) if i not in vi],
                [items[i] for i in sorted(vi)])
    trO, VOt = split(allO); trN, VNt = split(allN)
    XV = np.concatenate([np.array([x[1] for x in VOt]), np.array([x[1] for x in VNt])])
    yV = np.array([0] * len(VOt) + [1] * len(VNt))
    for mo in O_MODES:
        for mn in N_MODES:
            key = f'O{NO}-{mo}|N{NN}-{mn}'
            oL = pick(trO, NO, mo, seed=fi); nL = pick(trN, NN, mn, seed=fi)
            X = np.concatenate([np.array([x[1] for x in oL]), np.array([x[1] for x in nL])])
            y = np.array([0] * len(oL) + [1] * len(nL))
            aos, ans = [], []
            for s in range(6):
                W = train(X, y, seed=s, eps=10, bs=8, lr=0.001, h=100)
                d = logitdiff(W, XV)
                pred = (d < 0).astype(int)
                aos.append(float((pred[:len(VOt)] == 0).mean()))
                ans.append(float((pred[len(VOt):] == 1).mean()))
            ao, an = float(np.mean(aos)), float(np.mean(ans))
            res.setdefault(key, []).append((ao, an, (ao + an) / 2))
    print(f'  折 {fi+1}/{FOLDS} ({time.time()-t0:.0f}s)', flush=True)

out = []
for k, v in res.items():
    a = np.array(v); m = a.mean(axis=0)
    out.append({'name': k, 'balanced': float(m[2]), 'orange': float(m[0]), 'not': float(m[1]),
                'balanced_sd': float(a[:, 2].std())})
out.sort(key=lambda r: -r['balanced'])
print('\n=== 按平台打分口径（平衡分）排序，前 10 ===')
for r in out[:10]:
    print(f'  {r["name"]:32s} 平衡={r["balanced"]:.4f}±{r["balanced_sd"]:.4f} 橙={r["orange"]:.4f} 非橙={r["not"]:.4f}')
json.dump(out, open('cv_v5.json', 'w'), ensure_ascii=False, indent=1)
