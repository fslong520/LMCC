#!/usr/bin/env python3
"""本地训练 v3：选样策略对比
验证集固定（同一 seed 分层留出），只变「如何选训练样本」：
  A p_desc   橙按像橙程度降序前 N（历史法）
  B p_asc    橙按升序前 N（先取不像橙的）
  C random   随机 N
  D diverse  聚类中心选 N（最大多样性）
  E spread   按 p 分位均匀铺开选 N
非橙同法给四种配比。
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
    return (e / e.sum(axis=1, keepdims=True))[:, 0]

allO, allN = [], []
for f in sorted(os.listdir(F3)):
    if not f.endswith('.npz'):
        continue
    cls = 'O' if f.endswith('__橙子.npz') else 'N'
    for nm, F in load(f[:-4]):
        (allO if cls == 'O' else allN).append((nm, F))
allO = dedup(allO); allN = dedup(allN)
allO = [(nm, F, float(r7b_p(F[None])[0])) for nm, F in allO]
allN = [(nm, F, float(r7b_p(F[None])[0])) for nm, F in allN]
print(f'去重(thr .95)后 橙 {len(allO)} 非橙 {len(allN)}', flush=True)

rng = np.random.default_rng(42)
def split(items, frac=0.2):
    idx = rng.permutation(len(items))
    k = int(len(items) * frac)
    vi = set(idx[:k].tolist())
    return ([items[i] for i in range(len(items)) if i not in vi],
            [items[i] for i in sorted(vi)])
trO, VOt = split(allO); trN, VNt = split(allN)
print(f'训练 橙{len(trO)} 非橙{len(trN)} | 验证 橙{len(VOt)} 非橙{len(VNt)}', flush=True)

XV = np.concatenate([np.array([x[1] for x in VOt]), np.array([x[1] for x in VNt])])
yV = np.array([0] * len(VOt) + [1] * len(VNt))

def evaluate(X, y, reps=8, eps=10, h=100, lr=0.001, bs=8):
    accs, oAs, nAs = [], [], []
    for s in range(reps):
        W = train(X, y, seed=s, eps=eps, bs=bs, lr=lr, h=h)
        d = logitdiff(W, XV)
        pred = (d < 0).astype(int)
        accs.append(float((pred == yV).mean()))
        oAs.append(float((pred[:len(VOt)] == 0).mean()))
        nAs.append(float((pred[len(VOt):] == 1).mean()))
    return float(np.mean(accs)), float(np.std(accs)), float(np.mean(oAs)), float(np.mean(nAs))

def pick(items, n, mode, seed=0):
    if n >= len(items):
        return list(items)
    g = np.random.default_rng(seed)
    if mode == 'p_desc':
        return sorted(items, key=lambda x: -x[2])[:n]
    if mode == 'p_asc':
        return sorted(items, key=lambda x: x[2])[:n]
    if mode == 'random':
        idx = g.permutation(len(items))[:n]
        return [items[i] for i in sorted(idx)]
    if mode == 'spread':
        s = sorted(items, key=lambda x: x[2])
        idx = np.linspace(0, len(s) - 1, n).astype(int)
        return [s[i] for i in sorted(set(idx.tolist()))]
    if mode == 'diverse':
        # 贪心最大多样性（球面散布）
        F = np.array([x[1] for x in items]); Fu = unit(F)
        sel = [int(np.argmax(np.array([x[2] for x in items])))]
        for _ in range(n - 1):
            sim = Fu @ Fu[sel].T
            score = 1 - sim.max(axis=1)
            score[sel] = -1
            sel.append(int(np.argmax(score)))
        return [items[i] for i in sel]
    raise ValueError(mode)

results = []
t0 = time.time()
for no in (30, 40, 60, 80, 100):
    for mo in ('p_desc', 'p_asc', 'random', 'spread', 'diverse'):
        oL = pick(trO, no, mo, seed=1)
        for nn, mn in ((no, 'p_asc'), (no, 'spread'), (no, 'diverse'), (2 * no, 'spread')):
            nL = pick(trN, nn, mn, seed=1)
            if len(oL) < 5 or len(nL) < 5:
                continue
            X = np.concatenate([np.array([x[1] for x in oL]), np.array([x[1] for x in nL])])
            y = np.array([0] * len(oL) + [1] * len(nL))
            a, s, ao, an = evaluate(X, y)
            name = f'O{len(oL)}-{mo}_N{len(nL)}-{mn}'
            results.append({'name': name, 'n_orange': len(oL), 'n_not': len(nL),
                            'orange_mode': mo, 'not_mode': mn,
                            'acc': a, 'std': s, 'acc_orange': ao, 'acc_not': an})
            print(f'  {name:34s} acc={a:.4f} 橙={ao:.4f} 非橙={an:.4f} ({time.time()-t0:.0f}s)', flush=True)

json.dump(results, open('search_local_v3.json', 'w'), ensure_ascii=False, indent=1)
results.sort(key=lambda r: -r['acc'])
print('\n=== 前 8 名（按全局 acc）===')
for r in results[:8]:
    print(f'  {r["name"]:34s} acc={r["acc"]:.4f} 橙={r["acc_orange"]:.4f} 非橙={r["acc_not"]:.4f}')
print('\n=== 前 5 名（按 橙+非橙 最低者，即均衡）===')
for r in sorted(results, key=lambda r: -min(r['acc_orange'], r['acc_not']))[:5]:
    print(f'  {r["name"]:34s} acc={r["acc"]:.4f} 橙={r["acc_orange"]:.4f} 非橙={r["acc_not"]:.4f}')
