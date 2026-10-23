#!/usr/bin/env python3
"""本地训练 v4：5 折交叉验证确认最优配方（防选到过拟合验证集的假最优）
验证 3 个候选：
  C1 = O100-random + N200-spread
  C2 = O80-random  + N160-spread
  C3 = O60-random  + N60-spread   （均衡型）
每折用不同分层，8 seed 训练。
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
    if mode == 'random':
        idx = g.permutation(len(items))[:n]
        return [items[i] for i in sorted(idx)]
    if mode == 'spread':
        s = sorted(items, key=lambda x: x[2])
        idx = np.linspace(0, len(s) - 1, n).astype(int)
        return [s[i] for i in sorted(set(idx.tolist()))]
    if mode == 'p_desc':
        return sorted(items, key=lambda x: -x[2])[:n]
    raise ValueError(mode)

CANDS = [
    ('C1', 100, 'random', 200, 'spread'),
    ('C2', 80, 'random', 160, 'spread'),
    ('C3', 60, 'random', 60, 'spread'),
    ('C4', 100, 'random', 100, 'spread'),
    ('C5', 40, 'random', 80, 'spread'),
]

FOLDS = 5
summary = {c[0]: [] for c in CANDS}
t0 = time.time()
for fi in range(FOLDS):
    rng = np.random.default_rng(1000 + fi)
    def split(items, frac=0.2):
        idx = rng.permutation(len(items))
        k = int(len(items) * frac)
        vi = set(idx[:k].tolist())
        return ([items[i] for i in range(len(items)) if i not in vi],
                [items[i] for i in sorted(vi)])
    trO, VOt = split(allO); trN, VNt = split(allN)
    XV = np.concatenate([np.array([x[1] for x in VOt]), np.array([x[1] for x in VNt])])
    yV = np.array([0] * len(VOt) + [1] * len(VNt))
    for tag, no, mo, nn, mn in CANDS:
        oL = pick(trO, no, mo, seed=fi); nL = pick(trN, nn, mn, seed=fi)
        X = np.concatenate([np.array([x[1] for x in oL]), np.array([x[1] for x in nL])])
        y = np.array([0] * len(oL) + [1] * len(nL))
        accs, aos, ans = [], [], []
        for s in range(8):
            W = train(X, y, seed=s, eps=10, bs=8, lr=0.001, h=100)
            d = logitdiff(W, XV)
            pred = (d < 0).astype(int)
            accs.append(float((pred == yV).mean()))
            aos.append(float((pred[:len(VOt)] == 0).mean()))
            ans.append(float((pred[len(VOt):] == 1).mean()))
        summary[tag].append((float(np.mean(accs)), float(np.mean(aos)), float(np.mean(ans))))
    print(f'  折 {fi+1}/{FOLDS} 完成 ({time.time()-t0:.0f}s)', flush=True)

print('\n=== 5 折交叉验证汇总（均值±标准差）===')
out = []
for tag, _, _, _, _ in CANDS:
    a = np.array(summary[tag])
    m = a.mean(axis=0); sd = a.std(axis=0)
    out.append({'tag': tag, 'acc': float(m[0]), 'acc_sd': float(sd[0]),
                'orange': float(m[1]), 'orange_sd': float(sd[1]),
                'not': float(m[2]), 'not_sd': float(sd[2]),
                'balanced': float(min(m[1], m[2]))})
    print(f'  {tag}: acc={m[0]:.4f}±{sd[0]:.4f}  橙={m[1]:.4f}±{sd[1]:.4f}  非橙={m[2]:.4f}±{sd[2]:.4f}')
out.sort(key=lambda r: -r['acc'])
print(f"\n最优（按 acc）: {out[0]['tag']}  acc={out[0]['acc']:.4f}")
out.sort(key=lambda r: -r['balanced'])
print(f"最优（按均衡）: {out[0]['tag']}  橙={out[0]['orange']:.4f} 非橙={out[0]['not']:.4f}")
json.dump(out, open('cv_results.json', 'w'), ensure_ascii=False, indent=1)
