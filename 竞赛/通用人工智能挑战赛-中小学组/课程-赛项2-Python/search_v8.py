#!/usr/bin/env python3
# v8：recipeA 邻域组合精扫（8 seeds）
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
r5raw=load('r5_raw'); r9raw=load('r9_raw')
r5O=[x for x in r5raw if 'orange_r5' in x[0]]; r5N=[x for x in r5raw if 'notor_r5' in x[0]]

allO=dedup(oldO+r7O+r9raw); allN=dedup(oldH+oldE+r7N+n88N+r8N+r5raw)
VOt=[x for x in allO][-40:]; VNt=[x for x in allN][-160:]
XV=np.concatenate([np.array([x[1] for x in VOt]),np.array([x[1] for x in VNt])])
yV=np.array([0]*len(VOt)+[1]*len(VNt))
Vp={x[0] for x in VOt}|{x[0] for x in VNt}
def sub(pool): return [x for x in pool if x[0] not in Vp]
P={k:sub(v) for k,v in dict(oldO=oldO,oldH=oldH,oldE=oldE,r7N=r7N,n88O=n88O,n88N=n88N,r8N=r8N,r5O=r5O,r5N=r5N).items()}

def run(oL,nL,reps=8,eps=5):
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

def mk(oldO_k=40, n88O_k=30, r5O_k=10, oldH_k=26, n88N_k=13, r5N_k=31, r7N_k=30, r8_k=0, r9_k=0):
    oL = uni(P['oldO'],oldO_k)+uni(P['n88O'],n88O_k)+uni(P['r5O'],r5O_k)+uni(P.get('r9raw',[]),0)
    nL = uni(P['oldH'],oldH_k)+uni(P['n88N'],n88N_k)+uni(P['r5N'],r5N_k)+uni(P['r7N'],r7N_k)+uni(P['r8N'],r8_k)
    return oL[:100], nL[:100]

results=[]
def trial(name, **kw):
    s,d = run(*mk(**kw))
    results.append((name,s,d,kw))
    print('%-40s %.4f ±%.4f'%(name,s,d), flush=True)

trial('A-base')
trial('A+r8=10', r8_k=10)
trial('A+r8=10,r5N=25', r8_k=10, r5N_k=25)
trial('A+r8=10,r7N=35', r8_k=10, r7N_k=35)
trial('A+r8=15,r5N=25', r8_k=15, r5N_k=25)
trial('A,r5N=25', r5N_k=25)
trial('A,r5N=35', r5N_k=35)
trial('A,r7N=35', r7N_k=35)
trial('A+r8=10,r5N=25,r7N=35', r8_k=10, r5N_k=25, r7N_k=35)
trial('A+r8=5', r8_k=5)
trial('A,n88O=25', n88O_k=25)
trial('A,n88O=35', n88O_k=35)
trial('A+r9=10,r8=10', r9_k=10, r8_k=10, r5O_k=0)
results.sort(key=lambda x:-x[1])
print('\n=== TOP8 ===')
for name,s,d,c in results[:8]: print('%-40s %.4f ±%.4f  %s'%(name,s,d,c))
json.dump([[n,s,d,c] for n,s,d,c in results], open(os.path.join(os.path.dirname(F2),'search_v8_results.json'),'w'))
print('SAVED', flush=True)
