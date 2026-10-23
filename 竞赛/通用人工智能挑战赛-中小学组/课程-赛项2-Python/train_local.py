#!/usr/bin/env python3
"""本地训练：在清洗后素材池上搜索最优配方
- 模型与平台同构：1280 → 100 (ReLU) → 2，Adam(lr=0.001, bs=8, eps=10)
- 验证：按池分层留出 15%（每池尾部），避免同源泄漏
- 每配方 6 seed 重复，报 全局/橙/非橙 三档准确率
输出 search_local_results.json
"""
import os, sys, json, time, itertools
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
    """同名内容去重（特征余弦 > thr 视为重复）"""
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

# 全部可用池（清洗后）；测试素材拆成三块以便分层
POOLS = {
    'orange': ['测试素材__橙子', 'recipe_G__橙子', 'recipe_I__橙子', 'recipe_E1__橙子',
               'recipe_E2__橙子', '清洗_r13r14__橙子', '赛项2定版_r5_真实82__橙子',
               '赛项2定版_旧素材100x100_真实77__橙子', '赛项2定版_易例搭配35x35__橙子',
               '赛项2定版_清理版100x100__橙子', '赛项2定版_清理版40x40__橙子',
               '赛项2定版_非橙88__橙子'],
    'not':    ['测试素材__非橙子', 'recipe_G__非橙子', 'recipe_I__非橙子', 'recipe_E1__非橙子',
               'recipe_E2__非橙子', '清洗_r13r14__非橙子', '赛项2定版_r5_真实82__非橙子',
               '赛项2定版_r7_真实86__非橙子', '赛项2定版_v2_真实81__非橙子',
               '赛项2定版_前30名__非橙子', '赛项2定版_旧素材100x100_真实77__非橙子',
               '赛项2定版_易例搭配35x35__非橙子', '赛项2定版_清理版100x100__非橙子',
               '赛项2定版_清理版40x40__非橙子', '赛项2定版_非橙88__非橙子'],
}

def build_split(val_frac=0.15):
    """按池分层留出验证"""
    traO, VOt, traN, VNt = [], [], [], []
    for tag in POOLS['orange']:
        try: items = dedup(load(tag))
        except Exception: continue
        k = max(1, int(len(items) * val_frac))
        traO += items[:-k]; VOt += items[-k:]
    for tag in POOLS['not']:
        try: items = dedup(load(tag))
        except Exception: continue
        k = max(1, int(len(items) * val_frac))
        traN += items[:-k]; VNt += items[-k:]
    return traO, VOt, traN, VNt

traO, VOt, traN, VNt = build_split()
print(f'训练: 橙 {len(traO)} 非橙 {len(traN)} | 验证: 橙 {len(VOt)} 非橙 {len(VNt)}', flush=True)

XV = np.concatenate([np.array([x[1] for x in VOt]), np.array([x[1] for x in VNt])]) if (VOt or VNt) else None
yV = np.array([0] * len(VOt) + [1] * len(VNt))

def evaluate(oL, nL, reps=6, eps=10, h=100, lr=0.001, bs=8):
    X = np.concatenate([np.array([x[1] for x in oL]), np.array([x[1] for x in nL])])
    y = np.array([0] * len(oL) + [1] * len(nL))
    accs, oAs, nAs = [], [], []
    for s in range(reps):
        W = train(X, y, seed=s, eps=eps, bs=bs, lr=lr, h=h)
        d = logitdiff(W, XV)
        pred = (d < 0).astype(int)          # logit(橙)-logit(非橙) < 0 → 判橙
        acc = float((pred == yV).mean())
        accs.append(acc)
        oAs.append(float((pred[:len(VOt)] == 0).mean()))
        nAs.append(float((pred[len(VOt):] == 1).mean()))
    return (float(np.mean(accs)), float(np.std(accs)),
            float(np.mean(oAs)), float(np.mean(nAs)))

def topN(items, n, key=None):
    """取前 n（按路径排序；后续可换排序依据）"""
    return sorted(items, key=lambda x: x[0])[:n]

results = []
t0 = time.time()

# 配方族：橙 N + 非橙 M，网格搜索样本量
grid = [(40, 40), (50, 50), (60, 60), (80, 80), (100, 100), (120, 120), (150, 150), (200, 200)]
for no, nn in grid:
    oL = topN(traO, no); nL = topN(traN, nn)
    if len(oL) < 5 or len(nL) < 5:
        continue
    a, s, ao, an = evaluate(oL, nL)
    results.append({'name': f'grid-{no}o{nn}n', 'n_orange': len(oL), 'n_not': len(nL),
                    'acc': a, 'std': s, 'acc_orange': ao, 'acc_not': an})
    print(f'  {no}o{nn}n: acc={a:.4f}±{s:.4f} 橙={ao:.4f} 非橙={an:.4f}  ({time.time()-t0:.0f}s)', flush=True)

json.dump(results, open('search_local_results.json', 'w'), ensure_ascii=False, indent=1)
best = max(results, key=lambda r: r['acc'])
print(f'\n最优: {best["name"]}  acc={best["acc"]:.4f}  橙={best["acc_orange"]:.4f} 非橙={best["acc_not"]:.4f}')
print('-> search_local_results.json')
