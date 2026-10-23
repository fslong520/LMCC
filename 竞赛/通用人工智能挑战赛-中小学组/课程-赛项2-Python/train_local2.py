#!/usr/bin/env python3
"""本地训练 v2：合并全池 → 按类分层留出 → 网格搜索配方
关键改进：
  1. 验证集不按池分层，而是合并后按类随机分层留出 15%（固定 seed，可比）
  2. 橙子按「像橙子程度」排序（用 r7-B 概率作代理），复现历史「前 N 名甜点区」法
  3. 非橙子按难易混合配比（历史结论：纯难例是负优化）
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

def dedup(items, thr=0.92):
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

# ---- r7-B 打分器（作「像橙子程度」代理）----
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
    return (e / e.sum(axis=1, keepdims=True))[:, 0]

# ---- 合并全池 ----
O_TAGS = [f[:-4] for f in os.listdir(F3) if f.endswith('__橙子.npz')]
N_TAGS = [f[:-4] for f in os.listdir(F3) if f.endswith('__非橙子.npz')]

allO, allN = [], []
for t in O_TAGS:
    for nm, F in load(t):
        allO.append((nm, F, r7b_p(F[None])[0]))
for t in N_TAGS:
    for nm, F in load(t):
        allN.append((nm, F, r7b_p(F[None])[0]))
allO = dedup([(nm, F) for nm, F, _ in allO])
allN = dedup([(nm, F) for nm, F, _ in allN])
# 重新打分
allO = [(nm, F, r7b_p(F[None])[0]) for nm, F in allO]
allN = [(nm, F, r7b_p(F[None])[0]) for nm, F in allN]
print(f'合并去重后: 橙 {len(allO)}  非橙 {len(allN)}', flush=True)

# ---- 分层留出 15%（固定 seed）----
rng = np.random.default_rng(42)
def split(items, frac=0.15):
    idx = rng.permutation(len(items))
    k = int(len(items) * frac)
    vi = set(idx[:k].tolist())
    return [items[i] for i in range(len(items)) if i not in vi], [items[i] for i in sorted(vi)]

trO, VOt = split(allO)
trN, VNt = split(allN)
print(f'训练 橙{len(trO)} 非橙{len(trN)} | 验证 橙{len(VOt)} 非橙{len(VNt)}', flush=True)

XV = np.concatenate([np.array([x[1] for x in VOt]), np.array([x[1] for x in VNt])])
yV = np.array([0] * len(VOt) + [1] * len(VNt))

def evaluate(oL, nL, reps=6, eps=10, h=100, lr=0.001, bs=8):
    X = np.concatenate([np.array([x[1] for x in oL]), np.array([x[1] for x in nL])])
    y = np.array([0] * len(oL) + [1] * len(nL))
    accs, oAs, nAs = [], [], []
    for s in range(reps):
        W = train(X, y, seed=s, eps=eps, bs=bs, lr=lr, h=h)
        d = logitdiff(W, XV)
        pred = (d < 0).astype(int)
        accs.append(float((pred == yV).mean()))
        oAs.append(float((pred[:len(VOt)] == 0).mean()))
        nAs.append(float((pred[len(VOt):] == 1).mean()))
    return float(np.mean(accs)), float(np.std(accs)), float(np.mean(oAs)), float(np.mean(nAs))

# 橙子按 p 降序（像橙子程度）；非橙子按 p 升序（越不像橙子越先取）＋难例混合
o_by_p = sorted(trO, key=lambda x: -x[2])
n_by_p = sorted(trN, key=lambda x: x[2])
n_hard = sorted(trN, key=lambda x: -x[2])      # 最像橙子的难例

results = []
t0 = time.time()

def take_n_not(m, hard_frac=0.3):
    """非橙取 m 张：易例(不像橙) : 难例(像橙) 按比例混合"""
    nh = int(m * hard_frac); ne = m - nh
    a = n_by_p[:ne]                 # 易例
    b = n_hard[:nh]                 # 难例
    return a + b

grid = [(30, 30), (40, 40), (50, 50), (60, 60), (80, 80), (100, 100), (120, 120)]
for no, nn in grid:
    for hf in (0.2, 0.35, 0.5):
        oL = o_by_p[:no]
        nL = take_n_not(nn, hf)
        if len(oL) < 5 or len(nL) < 5:
            continue
        a, s, ao, an = evaluate(oL, nL)
        results.append({'name': f'{no}o{nn}n_h{int(hf*100)}', 'n_orange': len(oL), 'n_not': len(nL),
                        'hard_frac': hf, 'acc': a, 'std': s, 'acc_orange': ao, 'acc_not': an})
        print(f'  {no}o{nn}n hard={hf:.0%}: acc={a:.4f}±{s:.4f} 橙={ao:.4f} 非橙={an:.4f} ({time.time()-t0:.0f}s)', flush=True)

json.dump(results, open('search_local_results.json', 'w'), ensure_ascii=False, indent=1)
best = max(results, key=lambda r: r['acc'])
print(f'\n最优: {best["name"]}  acc={best["acc"]:.4f} 橙={best["acc_orange"]:.4f} 非橙={best["acc_not"]:.4f}')
