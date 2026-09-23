#!/usr/bin/env python3
# v11：显式挤占配比（新旧域同池竞争，无截断扭曲）
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
def run(oL,nL,reps=10):
    X=np.concatenate([np.array([x[1] for x in oL]),np.array([x[1] for x in nL])])
    y=np.array([0]*len(oL)+[1]*len(nL)); sc=[]
    for r in range(reps):
        m=train(X,y,seed=r,eps=5)
        p=1-(logitdiff(m,XV)>0).astype(int)
        sc.append(balanced_accuracy_score(yV,p))
    return float(np.mean(sc)),float(np.std(sc))
recipes = {
  # 基线：E1（无新域）
  'E1': dict(oldO=40,n88O=30,r9O=10,r13O=0, oldH=26,n88N=13,r5N=31,r7N=30,r8N=10,r13N=0),
  # 轻度挤占
  'H1': dict(oldO=35,n88O=25,r9O=10,r13O=10, oldH=22,n88N=12,r5N=25,r7N=25,r8N=8,r13N=8),
  # 中度
  'H2': dict(oldO=30,n88O=20,r9O=10,r13O=20, oldH=20,n88N=10,r5N=20,r7N=20,r8N=10,r13N=20),
  # 重度
  'H3': dict(oldO=25,n88O=15,r9O=10,r13O=30, oldH=18,n88N=9,r5N=18,r7N=17,r8N=8,r13N=30),
  # 只加非橙新域（橙不动）
  'H4': dict(oldO=40,n88O=30,r9O=10,r13O=0, oldH=22,n88N=12,r5N=26,r7N=25,r8N=5,r13N=10),
}
results=[]
for name,c in recipes.items():
    oL=(uni(P['oldO'],c['oldO'])+uni(P['n88O'],c['n88O'])+uni(P['r9O'],c['r9O'])+uni(P['r13O'],c['r13O']))
    nL=(uni(P['oldH'],c['oldH'])+uni(P['n88N'],c['n88N'])+uni(P['r5N'],c['r5N'])+uni(P['r7N'],c['r7N'])+uni(P['r8N'],c['r8N'])+uni(P['r13N'],c['r13N']))
    s,d=run(oL,nL)
    results.append((name,s,d,c))
    print('%-6s 橙%d 非橙%d  bal %.4f ±%.4f'%(name,len(oL),len(nL),s,d), flush=True)
results.sort(key=lambda x:-x[1])
print('BEST:', results[0][0], '%.4f'%results[0][1], flush=True)
json.dump([[n,s,d,c] for n,s,d,c in results], open('search_v11_results.json','w'))
print('SAVED', flush=True)
