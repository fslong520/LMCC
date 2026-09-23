#!/usr/bin/env python3
# v10：r13/r14 新域占比网格（torch 口径）
import os, sys, json
import numpy as np
from sklearn.metrics import balanced_accuracy_score
sys.path.insert(0,'.')
from head_np import train, logitdiff
BASE=os.path.abspath('.')
F2=f'{BASE}/feat2'
L=lambda t: np.load(f'{F2}/{t}.npz',allow_pickle=True)
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
def ld(t): d=L(t); return list(zip(d['names'].tolist(), d['F']))
oldO=ld('old_orange'); oldH=ld('old_hard')
r7N=ld('r7_not'); n88O=ld('n88_orange'); n88N=ld('n88_not'); r8N=ld('r8_not')
r5raw=ld('r5_raw'); r9raw=ld('r9_raw')
r5O=[x for x in r5raw if 'orange_r5' in x[0]]; r5N=[x for x in r5raw if 'notor_r5' in x[0]]
r9O=[x for x in r9raw]
r13O=ld('r13_14_orange'); r13N=ld('r13_14_not')
allO=dedup(oldO+r9O); allN=dedup(oldH+r7N+n88N+r8N+r5N)
VOt=[x for x in allO][-40:]; VNt=[x for x in allN][-160:]
XV=np.concatenate([np.array([x[1] for x in VOt]),np.array([x[1] for x in VNt])])
yV=np.array([0]*len(VOt)+[1]*len(VNt))
Vp={x[0] for x in VOt}|{x[0] for x in VNt}
def sub(pool): return [x for x in pool if x[0] not in Vp]
P={k:sub(v) for k,v in dict(oldO=oldO,oldH=oldH,n88O=n88O,n88N=n88N,r8N=r8N,r5O=r5O,r5N=r5N,r9O=r9O,r7N=r7N,r13O=r13O,r13N=r13N).items()}
print('池:', {k:len(v) for k,v in P.items()}, flush=True)
def uni(pool,k):
    if k<=0 or len(pool)==0: return []
    if len(pool)<=k: return pool[:]
    idx=np.linspace(0,len(pool)-1,k).astype(int)
    return [pool[i] for i in sorted(set(idx))]
def run(oL,nL,reps=8):
    X=np.concatenate([np.array([x[1] for x in oL]),np.array([x[1] for x in nL])])
    y=np.array([0]*len(oL)+[1]*len(nL)); sc=[]
    for r in range(reps):
        m=train(X,y,seed=r,eps=5)
        p=1-(logitdiff(m,XV)>0).astype(int)
        sc.append(balanced_accuracy_score(yV,p))
    return float(np.mean(sc)),float(np.std(sc))
results=[]
for r13O_k in [10,15]:
    for r13N_k in [10,20,30]:
        oL=uni(P['oldO'],40)+uni(P['n88O'],30)+uni(P['r9O'],10)+uni(P['r13O'],r13O_k)
        nL=uni(P['oldH'],26)+uni(P['n88N'],13)+uni(P['r5N'],31)+uni(P['r7N'],30)+uni(P['r8N'],10)+uni(P['r13N'],r13N_k)
        s,d=run(oL[:100],nL[:100])
        name='r13O%d_r13N%d'%(r13O_k,r13N_k)
        results.append((name,s,d)); print('%-16s %.4f ±%.4f'%(name,s,d), flush=True)
oL=uni(P['oldO'],40)+uni(P['n88O'],30)+uni(P['r9O'],10)
nL=uni(P['oldH'],26)+uni(P['n88N'],13)+uni(P['r5N'],31)+uni(P['r7N'],30)+uni(P['r8N'],10)
s,d=run(oL[:100],nL[:100]); results.append(('E1-ref',s,d)); print('%-16s %.4f ±%.4f'%('E1-ref',s,d), flush=True)
results.sort(key=lambda x:-x[1])
print('BEST:', results[0], flush=True)
json.dump(results, open('search_v10_results.json','w'))
print('SAVED', flush=True)
