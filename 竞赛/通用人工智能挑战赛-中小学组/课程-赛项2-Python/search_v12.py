#!/usr/bin/env python3
# v12：全池域均衡训练，目标全池留出 ≥86.6%（泛化优先）
import os, sys, json
import numpy as np
from sklearn.metrics import balanced_accuracy_score
sys.path.insert(0,'.')
from head_np import train, logitdiff
BASE=os.path.abspath('.')
F2=f'{BASE}/feat2_tf'
L=lambda t: np.load(f'{F2}/{t}.npz',allow_pickle=True)
def unit(F): return F/np.maximum(np.linalg.norm(F,axis=1,keepdims=True),1e-8)
def dedup(items,thr=0.92):
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

ORANGE=['old_orange','n88_orange','r7_orange','r5_orange','r9_orange','r13_orange','r14_orange']
NOT=['old_hard','old_easy','r7_not','n88_not','r8_not','r5_not','r7_raw','r8_raw','r10_raw','r13_not','r14_not']
allO=dedup(sum([ld(t) for t in ORANGE],[]))
allN=dedup(sum([ld(t) for t in NOT],[]))
print('全池: 橙 %d 非橙 %d'%(len(allO),len(allN)), flush=True)

# 分层留出 15%（每池尾部）
VOt=[]; VNt=[]; traO=[]; traN=[]
for items in [allO]:
    pass
# allO/allN 已按路径排序混合——需要分池才能分层。重建：逐池 dedup 后合并
def build(t):
    items=dedup(ld(t))
    k=max(1,int(len(items)*0.15))
    return items[:-k], items[-k:]
traO=[]; VOt=[]
for t in ORANGE:
    a,b=build(t); traO+=a; VOt+=b
traN=[]; VNt=[]
for t in NOT:
    a,b=build(t); traN+=a; VNt+=b
print('训练: 橙 %d 非橙 %d | 验证: 橙 %d 非橙 %d'%(len(traO),len(traN),len(VOt),len(VNt)), flush=True)
XV=np.concatenate([np.array([x[1] for x in VOt]),np.array([x[1] for x in VNt])])
yV=np.array([0]*len(VOt)+[1]*len(VNt))
def run(oL,nL,reps=3,eps=10,h=100,drop=0.0):
    X=np.concatenate([np.array([x[1] for x in oL]),np.array([x[1] for x in nL])])
    y=np.array([0]*len(oL)+[1]*len(nL)); sc=[]; oRs=[]; nRs=[]
    for r in range(reps):
        m=train(X,y,seed=r,eps=eps)
        d=logitdiff(m,XV); p=(d<=0).astype(int)
        sc.append(balanced_accuracy_score(yV,p))
        oRs.append((p[yV==0]==0).mean()); nRs.append((p[yV==1]==1).mean())
    return float(np.mean(sc)),float(np.std(sc)),float(np.mean(oRs)),float(np.mean(nRs))
def uni(pool,k):
    if k<=0 or len(pool)==0: return []
    if len(pool)<=k: return pool[:]
    idx=np.linspace(0,len(pool)-1,k).astype(int)
    return [pool[i] for i in sorted(set(idx))]

results=[]
# V1: 全量训练（域自然分布）
s,d,o,n=run(traO,traN,eps=10)
results.append(('V1-full-ep10',s,d,o,n)); print('V1-full-ep10   %.4f ±%.4f 橙R %.3f 非橙R %.3f'%(s,d,o,n), flush=True)
s,d,o,n=run(traO,traN,eps=20)
results.append(('V1-full-ep20',s,d,o,n)); print('V1-full-ep20   %.4f ±%.4f 橙R %.3f 非橙R %.3f'%(s,d,o,n), flush=True)
# V2: 域均衡采样（每池等量）
oB=uni(traO,100); nB=uni(traN,100)
s,d,o,n=run(oB,nB,eps=10)
results.append(('V2-bal100-ep10',s,d,o,n)); print('V2-bal100      %.4f ±%.4f 橙R %.3f 非橙R %.3f'%(s,d,o,n), flush=True)
# V3: 每域等量（7 橙池×20 + 11 非橙池×13）
oC=[]
for t in ORANGE:
    items=dedup(ld(t)); k=max(1,int(len(items)*0.85))
    oC+=uni(items[:k], 20)
nC=[]
for t in NOT:
    items=dedup(ld(t)); k=max(1,int(len(items)*0.85))
    nC+=uni(items[:k], 13)
s,d,o,n=run(oC,nC,eps=10)
results.append(('V3-pereq',s,d,o,n)); print('V3-pereq       %.4f ±%.4f 橙R %.3f 非橙R %.3f'%(s,d,o,n), flush=True)
# V4: 全量+ep20+h128
def train128(X,y,seed=0,eps=10,bs=8,lr=0.001,h=128):
    n,dm=X.shape; Y=np.eye(2)[y]
    rng=np.random.default_rng(seed)
    lim=np.sqrt(6.0/(dm+h)); W1=rng.uniform(-lim,lim,(dm,h)); b1=np.zeros(h)
    lim2=np.sqrt(6.0/(h+2)); W2=rng.uniform(-lim2,lim2,(h,2)); b2=np.zeros(2)
    mw=[np.zeros_like(x) for x in (W1,b1,W2,b2)]; vw=[np.zeros_like(x) for x in (W1,b1,W2,b2)]
    t=0; idx=np.arange(n)
    for ep in range(eps):
        rng.shuffle(idx)
        for s0 in range(0,n,bs):
            i2=idx[s0:s0+bs]; xb,yb=X[i2],Y[i2]
            h1=xb@W1+b1; hr=np.maximum(h1,0)
            lg=hr@W2+b2
            e=np.exp(lg-lg.max(axis=1,keepdims=True)); p=e/e.sum(axis=1,keepdims=True)
            g=(p-yb)/len(i2)
            gW2=hr.T@g; gb2=g.sum(axis=0); gh=(g@W2.T)*(h1>0); gW1=xb.T@gh; gb1=gh.sum(axis=0)
            t+=1
            for i,g_ in enumerate([gW1,gb1,gW2,gb2]):
                mw[i]=0.9*mw[i]+0.1*g_; vw[i]=0.999*vw[i]+0.001*g_*g_
                mh=mw[i]/(1-0.9**t); vh=vw[i]/(1-0.999**t)
                u=-lr*mh/(np.sqrt(vh)+1e-7)
                if i==0: W1+=u
                elif i==1: b1+=u
                elif i==2: W2+=u
                else: b2+=u
    return (W1,b1,W2,b2)
def logit128(par,X):
    W1,b1,W2,b2=par
    h=np.maximum(X@W1+b1,0); lg=h@W2+b2
    return lg[:,0]-lg[:,1]
sc=[];oRs=[];nRs=[]
X=np.concatenate([np.array([x[1] for x in traO]),np.array([x[1] for x in traN])])
y=np.array([0]*len(traO)+[1]*len(traN))
for r in range(3):
    m=train128(X,y,seed=r,eps=20,h=128)
    d=logit128(m,XV); p=(d<=0).astype(int)
    sc.append(balanced_accuracy_score(yV,p))
    oRs.append((p[yV==0]==0).mean()); nRs.append((p[yV==1]==1).mean())
s,d=float(np.mean(sc)),float(np.std(sc))
results.append(('V4-h128-ep20',s,d,float(np.mean(oRs)),float(np.mean(nRs))))
print('V4-h128-ep20   %.4f ±%.4f 橙R %.3f 非橙R %.3f'%(s,d,np.mean(oRs),np.mean(nRs)), flush=True)
results.sort(key=lambda x:-x[1])
print('\n=== RANK ===')
for name,s,d,o,n in results: print('%-16s %.4f ±%.4f 橙R %.3f 非橙R %.3f'%(name,s,d,o,n))
json.dump([[n,s,d,o,n2] for n,s,d,o,n2 in results], open('search_v12_results.json','w'))
print('SAVED', flush=True)
