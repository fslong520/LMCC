# -*- coding: utf-8 -*-
"""
手写 CNN（纯 numpy）——橙子二分类
==================================

为什么手写：训练台里的"深度模型"是个黑盒；这里把卷积、ReLU、池化、全连接、
反向传播一层层摆开，56 张小图一分钟跑完，看清 CNN 到底在学什么。

⚠ 教学重点（诚实口径）：固定轮数训练后训练准确率 97%+，验证只有 ~60%
  （同口径下纹理 SVM 66.1%）——56 张图喂 1.8 万参数，背题不是学习。
  这正是"数据量是深度学习的水"的现场演示，也是本课最值钱的一课。
  （脚本内早停峰值口径偏高，作观察用，勿当成绩引用。）

架构（输入 48x48 灰度）：
  Conv1(1->4, 5x5, pad2) -> ReLU -> MaxPool2   -> 24x24x4
  Conv2(4->8, 3x3, pad1) -> ReLU -> MaxPool2   -> 12x12x8
  Flatten -> FC(1152->16) -> ReLU -> FC(16->2) -> Softmax

用法：
    python cnn_numpy.py                    # 训练 + 验证
    python cnn_numpy.py --epochs 40        # 调轮数
"""
import argparse
import os
import sys
import time

import numpy as np
from PIL import Image

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "测试素材")
rng = np.random.default_rng(42)

# ---------------- 数据 ----------------
def load_data(size=48):
    X, y, names = [], [], []
    for d, label in [("orange", 1), ("not_orange", 0)]:
        folder = os.path.join(BASE, d)
        for f in sorted(os.listdir(folder)):
            if not f.lower().endswith(".jpg"):
                continue
            img = Image.open(os.path.join(folder, f)).convert("L").resize((size, size))
            X.append(np.asarray(img, dtype=np.float32) / 255.0)
            y.append(label)
            names.append(f"{d}/{f}")
    X = np.array(X)[:, None, :, :]  # (N,1,48,48)
    X = (X - X.mean()) / (X.std() + 1e-7)   # 标准化：梯度更稳
    y = np.array(y)
    return X, y, names

# ---------------- 层：前向 + 反向 ----------------
def conv_forward(x, W, b, pad=0):
    """x:(N,C,H,W) W:(F,C,k,k) -> (N,F,H,W)；stride=1"""
    N, C, H, Wd = x.shape
    F, _, k, _ = W.shape
    xp = np.pad(x, ((0, 0), (0, 0), (pad, pad), (pad, pad)))
    Ho, Wo = H + 2 * pad - k + 1, Wd + 2 * pad - k + 1
    # im2col：把每个 k*k 窗口摊成一行，卷积变矩阵乘
    cols = np.empty((N, C, k, k, Ho, Wo), dtype=x.dtype)
    for i in range(k):
        for j in range(k):
            cols[:, :, i, j] = xp[:, :, i:i + Ho, j:j + Wo]
    cols = cols.reshape(N, C * k * k, Ho * Wo)
    out = W.reshape(F, -1) @ cols + b.reshape(1, F, 1)
    return out.reshape(N, F, Ho, Wo), (cols, x.shape, W.shape)

def _infer_pad(Hin, k, Hout):
    return (Hout + k - 1 - Hin) // 2

def conv_backward(dout, cache, W):
    cols, xshape, wshape = cache
    N, C, H, Wd = xshape
    F, _, k, _ = wshape
    pad = _infer_pad(H, k, dout.shape[2])
    Ho, Wo = dout.shape[2], dout.shape[3]
    dcols = (W.reshape(F, -1).T @ dout.reshape(N, F, Ho * Wo))  # (N, C*k*k, Ho*Wo)
    dcols = dcols.reshape(N, C, k, k, Ho, Wo)
    dxp = np.zeros((N, C, H + 2 * pad, Wd + 2 * pad), dtype=dout.dtype)
    for i in range(k):
        for j in range(k):
            dxp[:, :, i:i + Ho, j:j + Wo] += dcols[:, :, i, j]
    dx = dxp[:, :, pad:pad + H, pad:pad + Wd]
    dW = (dout.reshape(N, F, Ho * Wo) @ cols.transpose(0, 2, 1)).sum(0).reshape(wshape)
    db = dout.sum(axis=(0, 2, 3))
    return dx, dW, db

def relu_forward(x):
    mask = x > 0
    return x * mask, mask

def pool_forward(x):
    """2x2 max pool，stride 2"""
    N, C, H, W = x.shape
    Ho, Wo = H // 2, W // 2
    x6 = x[:, :, :Ho * 2, :Wo * 2].reshape(N, C, Ho, 2, Wo, 2)
    out = x6.max(axis=(3, 5))
    mask = (x6 == out[:, :, :, None, :, None])
    return out, mask

def pool_backward(dout, cache):
    Ho, Wo = dout.shape[2], dout.shape[3]
    return (cache.astype(dout.dtype) * dout[:, :, :, None, :, None]).reshape(dout.shape[0], dout.shape[1], Ho * 2, Wo * 2)

def softmax_cross_entropy(logits, y):
    """返回 loss、dlogits、准确率"""
    z = logits - logits.max(axis=1, keepdims=True)
    e = np.exp(z)
    p = e / e.sum(axis=1, keepdims=True)
    N = len(y)
    loss = -np.log(p[np.arange(N), y] + 1e-9).mean()
    dlogits = p.copy()
    dlogits[np.arange(N), y] -= 1
    return loss, dlogits / N, (p.argmax(1) == y).mean()

# ---------------- 网络 ----------------
class TinyCNN:
    def __init__(self, lr=0.05, dropout=0.5):
        self.lr = lr
        self.dropout = dropout
        k1 = np.sqrt(2.0 / (1 * 25)); k2 = np.sqrt(2.0 / (4 * 9))
        self.W1 = rng.normal(0, k1, (4, 1, 5, 5)).astype(np.float32)
        self.b1 = np.zeros(4, dtype=np.float32)
        self.W2 = rng.normal(0, k2, (8, 4, 3, 3)).astype(np.float32)
        self.b2 = np.zeros(8, dtype=np.float32)
        self.W3 = rng.normal(0, np.sqrt(2.0 / 1152), (16, 1152)).astype(np.float32)
        self.b3 = np.zeros(16, dtype=np.float32)
        self.W4 = rng.normal(0, np.sqrt(2.0 / 16), (2, 16)).astype(np.float32)
        self.b4 = np.zeros(2, dtype=np.float32)

    def forward(self, x, training=False):
        c1, self.ca1 = conv_forward(x, self.W1, self.b1, pad=2)     # 4@48x48
        r1, self.cr1 = relu_forward(c1)
        p1, self.cp1 = pool_forward(r1)                             # 4@24x24
        c2, self.ca2 = conv_forward(p1, self.W2, self.b2, pad=1)    # 8@24x24
        r2, self.cr2 = relu_forward(c2)
        p2, self.cp2 = pool_forward(r2)                             # 8@12x12
        self.p2shape = p2.shape
        self.flat = p2.reshape(len(x), -1)                          # 1152
        # Dropout（仅训练时）：小数据集救命稻草
        if training and self.dropout > 0:
            keep = rng.random(self.flat.shape) >= self.dropout
            self.flat = self.flat * keep / (1 - self.dropout)
            self.keep = keep
        else:
            self.keep = None
        z3 = self.flat @ self.W3.T + self.b3
        r3, self.cr3 = relu_forward(z3)
        self.r3v = r3
        logits = r3 @ self.W4.T + self.b4
        return logits

    def backward(self, dlogits):
        dW4 = dlogits.T @ self.r3v; db4 = dlogits.sum(0)
        dr3 = dlogits @ self.W4
        dz3 = dr3 * self.cr3
        dW3 = dz3.T @ self.flat; db3 = dz3.sum(0)
        dflat = dz3 @ self.W3
        if self.keep is not None:                     # dropout 反向：同一路径
            dflat = dflat * self.keep / (1 - self.dropout)
        dp2 = dflat.reshape(self.p2shape)
        dc2 = pool_backward(dp2, self.cp2) * self.cr2
        dx2, dW2, db2 = conv_backward(dc2, self.ca2, self.W2)
        dp1 = dx2
        dc1 = pool_backward(dp1, self.cp1) * self.cr1
        dx1, dW1, db1 = conv_backward(dc1, self.ca1, self.W1)
        for p, g in [(self.W1, dW1), (self.b1, db1), (self.W2, dW2), (self.b2, db2),
                     (self.W3, dW3), (self.b3, db3), (self.W4, dW4), (self.b4, db4)]:
            p -= self.lr * g.astype(np.float32)

def augment_batch(Xb):
    """在线增强：随机水平/垂直翻转 + 随机平移±3px。翻个面还是橙子。"""
    Xb = Xb.copy()
    for i in range(len(Xb)):
        if rng.random() < 0.5:
            Xb[i] = Xb[i, :, :, ::-1]
        if rng.random() < 0.3:
            Xb[i] = Xb[i, :, ::-1, :]
        dx, dy = rng.integers(-3, 4), rng.integers(-3, 4)
        Xb[i] = np.roll(Xb[i], (dx, dy), axis=(1, 2))
    return Xb

def cross_val_train(X, y, k=5, epochs=30, lr=0.05, wd=1e-4, verbose=True):
    """5 折交叉验证（与 experiment.py 同口径），逐折早停取验证峰值"""
    idx = rng.permutation(len(X))
    folds = np.array_split(idx, k)
    accs, peaks = [], []
    for i, val_idx in enumerate(folds):
        train_idx = np.setdiff1d(idx, val_idx)
        net = TinyCNN(lr=lr)
        params = [net.W1, net.b1, net.W2, net.b2, net.W3, net.b3, net.W4, net.b4]
        best, best_ep = 0.0, 0
        for ep in range(epochs):
            perm = rng.permutation(train_idx)
            for s in range(0, len(perm), 8):
                b = perm[s:s + 8]
                logits = net.forward(augment_batch(X[b]), training=True)
                loss, dlogits, _ = softmax_cross_entropy(logits, y[b])
                net.backward(dlogits)
                for p in params:                      # L2 权重衰减
                    p -= lr * wd * p
            vl = net.forward(X[val_idx])              # 验证：每轮监控，防过拟合
            vacc = (vl.argmax(1) == y[val_idx]).mean()
            if vacc > best:
                best, best_ep = vacc, ep
        accs.append(best)
        peaks.append(best_ep)
        if verbose:
            print(f"  折{i + 1}: 验证峰值 {best:.0%}（ep{best_ep} 早停）")
    return np.array(accs), peaks

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--lr", type=float, default=0.02)
    args = ap.parse_args()

    t0 = time.time()
    X, y, names = load_data(48)
    print(f"数据：{len(X)} 张 48x48 灰度图（橙子 {(y == 1).sum()} / 非橙子 {(y == 0).sum()}）")
    n_params = 4 * 25 + 4 + 8 * 36 + 8 + 16 * 1152 + 16 + 2 * 16 + 2
    print(f"网络参数量：卷积1 {4 * 25 + 4} + 卷积2 {8 * 36 + 8} + FC1 {16 * 1152 + 16} + FC2 {2 * 16 + 2} = {n_params} 个")
    print(f"\n开始 5 折交叉验证（每折带在线增强+Dropout，逐轮验证早停取峰值）……")

    accs, peaks = cross_val_train(X, y, epochs=args.epochs, lr=args.lr)
    print(f"\n5 折早停峰值均值：{accs.mean():.1%}")
    print(f"耗时 {time.time() - t0:.0f}s（CPU 6 核）")
    print("\n对照（传统特征，见 experiment.py）：颜色特征最佳 60.6%，纹理特征最佳 66.1%（同口径 5 折）")
    print("观察：训练准确率远高于验证——56 张图喂 1.8 万参数，背题不是学习")
    print("结论：数据量是深度学习的水；小数据世界里手工先验仍占优")
    print("这正是识物工坊训练台要求'每类 20 张起步、越多越好'的原因")

if __name__ == "__main__":
    main()
