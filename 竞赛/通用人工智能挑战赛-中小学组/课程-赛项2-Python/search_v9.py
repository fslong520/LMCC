#!/usr/bin/env python3
# v9：top4 方案精评（12 seeds + 分项指标 + 去重后干净清单）
import os, json, sys
import numpy as np
from sklearn.metrics import balanced_accuracy_score
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from head_np import train, logitdiff
BASE = os.path.dirname(os.path.abspath(__file__))
F2 = f'{BASE}/feat2'
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

oldO=load('old_orange'); oldH=load('old_hard')
r7N=load('r7_not'); n88O=load('n88_orange'); n88N=load('n88_not'); r8N=load('r8_not')
r5raw=load('r5_raw'); r9raw=load('r9_raw')
r5O=[x for x in r5raw if 'orange_r5' in x[0]]; r5N=[x for x in r5raw if 'notor_r5' in x[0]]
r9O=[x for x in r9raw]

allO=dedup(oldO+r9O); allN=dedup(oldH+r7N+n88N+r8N+r5N)
VOt=[x for x in allO][-40:]; VNt=[x for x in allN][-160:]
XV=np.concatenate([np.array([x[1] for x in VOt]),np.array([x[1] for x in VNt])])
yV=np.array([0]*len(VOt)+[1]*len(VNt))
Vp={x[0] for x in VOt}|{x[0] for x in VNt}
def sub(pool): return [x for x in pool if x[0] not in Vp]
P={k:sub(v) for k,v in dict(oldO=oldO,oldH=oldH,n88O=n88O,n88N=n88N,r8N=r8N,r5O=r5O,r5N=r5N,r9O=r9O,r7N=r7N).items()}
print('池:', {k:len(v) for k,v in P.items()}, flush=True)

def uni(pool,k):
    if k<=0 or len(pool)==0: return []
    if len(pool)<=k: return pool[:]
    idx=np.linspace(0,len(pool)-1,k).astype(int)
    return [pool[i] for i in sorted(set(idx))]

def mk(name):
    if name=='A-base':
        oL=uni(P['oldO'],40)+uni(P['n88O'],30)+uni(P['r5O'],10)
        nL=uni(P['oldH'],26)+uni(P['n88N'],13)+uni(P['r5N'],31)+uni(P['r7N'],30)
    elif name=='A+r8=10':
        oL=uni(P['oldO'],40)+uni(P['n88O'],30)+uni(P['r5O'],10)
        nL=uni(P['oldH'],26)+uni(P['n88N'],13)+uni(P['r5N'],31)+uni(P['r7N'],30)+uni(P['r8N'],10)
    elif name=='A+r8=10,r5N=25':
        oL=uni(P['oldO'],40)+uni(P['n88O'],30)+uni(P['r5O'],10)
        nL=uni(P['oldH'],26)+uni(P['n88N'],13)+uni(P['r5N'],25)+uni(P['r7N'],30)+uni(P['r8N'],10)
    elif name=='A+r9=10,r8=10':
        oL=uni(P['oldO'],40)+uni(P['n88O'],30)+uni(P['r9O'],10)
        nL=uni(P['oldH'],26)+uni(P['n88N'],13)+uni(P['r5N'],31)+uni(P['r7N'],30)+uni(P['r8N'],10)
    return oL[:100], nL[:100]

SEEDS=list(range(12))
results=[]
for name in ['A-base','A+r8=10','A+r8=10,r5N=25','A+r9=10,r8=10']:
    oL,nL=mk(name)
    X=np.concatenate([np.array([x[1] for x in oL]),np.array([x[1] for x in nL])])
    y=np.array([0]*len(oL)+[1]*len(nL)); sc=[]; oRs=[]; nRs=[]
    for r in SEEDS:
        m=train(X,y,seed=r,eps=5)
        p=1-(logitdiff(m,XV)>0).astype(int)
        sc.append(balanced_accuracy_score(yV,p))
        oRs.append((p[yV==0]==0).mean()); nRs.append((p[yV==1]==1).mean())
    s,d=float(np.mean(sc)),float(np.std(sc))
    results.append((name,s,d,float(np.mean(oRs)),float(np.mean(nRs))))
    print('%-22s bal %.4f ±%.4f  橙R %.3f 非橙R %.3f'%(name,s,d,np.mean(oRs),np.mean(nRs)), flush=True)
results.sort(key=lambda x:-x[1])
print('\nBEST:', results[0][0], '%.4f'%results[0][1])
json.dump(results, open(f'{BASE}/search_v9_results.json','w'), ensure_ascii=False)
print('SAVED', flush=True)
