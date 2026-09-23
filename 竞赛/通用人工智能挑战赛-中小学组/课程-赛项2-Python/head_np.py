#!/usr/bin/env python3
import numpy as np
def train(X, y, seed=0, eps=5, bs=8, lr=0.001, h=100):
    n, d = X.shape; ncls = 2
    Y = np.eye(ncls)[y]
    rng = np.random.default_rng(seed)
    lim1 = np.sqrt(6.0/(d+h)); W1 = rng.uniform(-lim1, lim1, (d,h)); b1 = np.zeros(h)
    lim2 = np.sqrt(6.0/(h+ncls)); W2 = rng.uniform(-lim2, lim2, (h,ncls)); b2 = np.zeros(ncls)
    mw = [np.zeros_like(W1), np.zeros_like(b1), np.zeros_like(W2), np.zeros_like(b2)]
    vw = [np.zeros_like(x) for x in mw]
    b1t, b2t, t = 0.9, 0.999, 0
    idx_all = np.arange(n)
    for ep in range(eps):
        rng.shuffle(idx_all)
        for s in range(0, n, bs):
            idx = idx_all[s:s+bs]; xb, yb = X[idx], Y[idx]
            h1 = xb@W1 + b1; h1r = np.maximum(h1, 0)
            logits = h1r@W2 + b2
            e = np.exp(logits - logits.max(axis=1, keepdims=True))
            p = e/e.sum(axis=1, keepdims=True)
            g = (p - yb)/len(idx)
            gW2 = h1r.T@g; gb2 = g.sum(axis=0)
            gh1 = (g@W2.T)*(h1>0)
            gW1 = xb.T@gh1; gb1 = gh1.sum(axis=0)
            t += 1
            for i, g_ in enumerate([gW1, gb1, gW2, gb2]):
                mw[i] = b1t*mw[i] + (1-b1t)*g_
                vw[i] = b2t*vw[i] + (1-b2t)*g_*g_
                mh = mw[i]/(1-b1t**t); vh = vw[i]/(1-b2t**t)
                upd = -lr*mh/(np.sqrt(vh)+1e-7)
                if i==0: W1 += upd
                elif i==1: b1 += upd
                elif i==2: W2 += upd
                else: b2 += upd
    return (W1,b1,W2,b2)
def logitdiff(params, X):
    W1,b1,W2,b2 = params
    h1 = np.maximum(X@W1+b1, 0)
    lg = h1@W2+b2
    return lg[:,0]-lg[:,1]
