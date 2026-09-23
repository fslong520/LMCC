#!/usr/bin/env python3
"""导出指定配方素材（与 search_v8 mk 截断逻辑一致）+ 缩图备用"""
import os, sys, json, shutil, hashlib
import numpy as np

BASE = os.path.dirname(os.path.abspath(__file__))
F2 = f'{BASE}/feat2'
L = lambda t: np.load(f'{F2}/{t}.npz', allow_pickle=True)
def load(t): d=L(t); return list(zip(d['names'].tolist(), d['F']))
def uni(pool,k):
    if k<=0 or len(pool)==0: return []
    if len(pool)<=k: return pool[:]
    idx=np.linspace(0,len(pool)-1,k).astype(int)
    return [pool[i] for i in sorted(set(idx))]

oldO=load('old_orange'); oldH=load('old_hard')
r7N=load('r7_not'); n88O=load('n88_orange'); n88N=load('n88_not'); r8N=load('r8_not')
r5raw=load('r5_raw'); r9raw=load('r9_raw')
r5O=[x for x in r5raw if 'orange_r5' in x[0]]; r5N=[x for x in r5raw if 'notor_r5' in x[0]]
r9O=[x for x in r9raw]

def build(name, oldO_k, n88O_k, r5O_k, r9_k, oldH_k, n88N_k, r5N_k, r7N_k, r8_k):
    oL = uni(oldO,oldO_k)+uni(n88O,n88O_k)+uni(r5O,r5O_k)+uni(r9O,r9_k)
    nL = uni(oldH,oldH_k)+uni(n88N,n88N_k)+uni(r5N,r5N_k)+uni(r7N,r7N_k)+uni(r8N,r8_k)
    oL, nL = oL[:100], nL[:100]
    # md5 去重（跨类保橙）
    seen={}; oL2=[]
    for f,_ in oL:
        h=hashlib.md5(open(f,'rb').read()).hexdigest()
        if h in seen: continue
        seen[h]=1; oL2.append(f)
    nL2=[]
    for f,_ in nL:
        h=hashlib.md5(open(f,'rb').read()).hexdigest()
        if h in seen: continue
        seen[h]=1; nL2.append(f)
    outdir=f'{BASE}/recipe_{name}'
    shutil.rmtree(outdir, ignore_errors=True)
    os.makedirs(outdir+'/橙子'); os.makedirs(outdir+'/非橙子')
    man={'orange':[],'not_orange':[]}
    for side,items,cls in [('orange',oL2,'橙子'),('not_orange',nL2,'非橙子')]:
        for i,f in enumerate(items):
            shutil.copy(f,'%s/%s/%03d__%s'%(outdir,cls,i,os.path.basename(f)))
            man[side].append(f)
    json.dump(man, open(outdir+'/manifest.json','w'), ensure_ascii=False, indent=1)
    print(name, '橙', len(oL2), '非橙', len(nL2), '→', outdir)

if __name__ == '__main__':
    build('E1', 40, 30, 0, 10, 26, 13, 31, 30, 0)   # A + r9O10 换 r5O
    build('E2', 40, 30, 10, 0, 26, 13, 25, 30, 10)  # A + r8N10, r5N 31→25
