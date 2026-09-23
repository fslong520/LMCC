#!/usr/bin/env python3
# v7：本地方案矩阵（无 RAR，含 r12 若有），6 seeds，瞄准超 r7-B
import os, json, sys
import numpy as np
from sklearn.metrics import balanced_accuracy_score
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from head_np import train, logitdiff
F2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'feat2')
L = lambda t: np.load(f'{F2}/{t}.npz', allow_pickle=True)
def unit(F): return F/np.maximum(np.linalg.norm(F,axis=1,keepdims=True),1e-8)
def dedup(items,thr=0.90):
    items=sorted(items,key=lambda x:x[0])
    F=np.array([it[1] for it in items]);Fu=unit(F);sim=Fu@Fu.T
    keep,dead=[],set()
    for i in range(len(items)):
        if i in dead: continue
        keep.append(items[i])
        for j in np.where(sim[i]>thr)[0]:
            if j>i: dead.add(j)
    return keep
def load(t): d=L(t); return list(zip(d['names'].tolist(), d['F']))

oldO=load('old_orange'); oldH=load('old_hard'); oldE=load('old_easy')
r7O=load('r7_orange'); r7N=load('r7_not'); n88O=load('n88_orange'); n88N=load('n88_not'); r8N=load('r8_not')
r5raw=load('r5_raw'); r7raw=load('r7_raw'); r8raw=load('r8_raw'); r10raw=load('r10_raw'); r9raw=load('r9_raw')
r5O=[x for x in r5raw if 'orange_r5' in x[0]]; r5N=[x for x in r5raw if 'notor_r5' in x[0]]

allO=dedup(oldO+r7O+r9raw); allN=dedup(oldH+oldE+r7N+n88N+r8N+r5raw+r7raw+r8raw+r10raw)
VOt=[x for x in allO][-40:]; VNt=[x for x in allN][-160:]
XV=np.concatenate([np.array([x[1] for x in VOt]),np.array([x[1] for x in VNt])])
yV=np.array([0]*len(VOt)+[1]*len(VNt))
Vp={x[0] for x in VOt}|{x[0] for x in VNt}
def sub(pool): return [x for x in pool if x[0] not in Vp]
P={k:sub(v) for k,v in dict(oldO=oldO,oldH=oldH,oldE=oldE,r7O=r7O,r7N=r7N,n88O=n88O,n88N=n88N,r8N=r8N,r5O=r5O,r5N=r5N).items()}
print('训练池:', {k:len(v) for k,v in P.items()}, flush=True)

def run(oL,nL,reps=6,eps=5):
    X=np.concatenate([np.array([x[1] for x in oL]),np.array([x[1] for x in nL])])
    y=np.array([0]*len(oL)+[1]*len(nL)); sc=[]
    for r in range(reps):
        m=train(X,y,seed=r,eps=eps)
        p=1-(logitdiff(m,XV)>0).astype(int)
        sc.append(balanced_accuracy_score(yV,p))
    return float(np.mean(sc)),float(np.std(sc))

def uni(pool,k):
    if k<=0 or len(pool)==0: return []
    if len(pool)<=k: return pool[:]
    idx=np.linspace(0,len(pool)-1,k).astype(int)
    return [pool[i] for i in sorted(set(idx))]

def mk(oldO_k=40, n88O_k=10, r5O_k=30, oldH_k=30, n88N_k=15, r5N_k=15, r7N_k=35, r8_k=0, r10_k=0, r9_k=0, oldE_k=0, nO=100, nN=100):
    oL = uni(P['oldO'],oldO_k)+uni(P['n88O'],n88O_k)+uni(P['r5O'],r5O_k)+uni(P['r9raw'] if 'r9raw' in P else [],0)+uni(P['r8N'],0)
    oL = oL[:nO]
    nL = uni(P['oldH'],oldH_k)+uni(P['n88N'],n88N_k)+uni(P['r5N'],r5N_k)+uni(P['r7N'],r7N_k)+uni(P['r8N'],r8_k)+uni(P['r10raw'] if 'r10raw' in P else [],0)+uni(P['oldE'],oldE_k)
    nL = nL[:nN]
    return oL, nL

results=[]
def trial(name, **kw):
    s,d = run(*mk(**kw))
    results.append((name,s,d,kw))
    print('%-36s %.4f ±%.4f'%(name,s,d), flush=True)

# 基线组
trial('r7B-baseline')
trial('recipeA', oldO_k=40,n88O_k=30,r5O_k=10,oldH_k=26,n88N_k=13,r5N_k=31,r7N_k=30)
# r8 橙色食物难例
for k in [5,10,15,20]:
    trial('r8=%d'%k, r8_k=k)
# r10 网络难例
for k in [10,20]:
    trial('r10=%d'%k, r10_k=k, oldH_k=30-10)
# r9 新橙
for k in [10,20]:
    trial('r9=%d'%k, r9_k=k, r5O_k=30-k)
# 配比网格（基于 r7-B 邻域）
for r5N in [20,25,30]:
    for r7N in [25,30,40]:
        trial('r5N=%d_r7N=%d'%(r5N,r7N), r5N_k=r5N, r7N_k=r7N, r8_k=10)
# 规模
for nO,nN in [(90,100),(100,90),(100,110),(90,110)]:
    trial('nO%d_nN%d'%(nO,nN), nO=nO, nN=nN)
results.sort(key=lambda x:-x[1])
print('\n=== TOP10 ===')
for name,s,d,c in results[:10]: print('%-36s %.4f ±%.4f'%(name,s,d))
json.dump([[n,s,d,c] for n,s,d,c in results], open(os.path.join(os.path.dirname(F2),'search_v7_results.json'),'w'))
print('SAVED', flush=True)
