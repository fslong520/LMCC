# -*- coding: utf-8 -*-
"""
识物工坊·数据增强实验
对比"不增强 vs 增强"（旋转/翻转/亮度）在难例数据上的精度。

要点：增强只对训练集做，测试集保持原样（防数据泄漏）。

用法：python augment.py [<橙子目录> <非橙子目录>]
"""
import os, sys, warnings
import numpy as np
from PIL import Image, ImageEnhance
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.metrics import accuracy_score

warnings.filterwarnings("ignore")
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "测试素材")


def feat(img):
    """16×16 RGB + 平均RGB（与 demo 同）"""
    small = np.asarray(img.resize((16, 16)), dtype=float) / 255.0
    return np.concatenate([small.flatten(), small.mean(axis=(0, 1))])


def augment(img):
    """生成增强图：水平翻转、旋转±15°、亮度0.8/1.2（共5种新图）"""
    outs = []
    outs.append(img.transpose(Image.FLIP_LEFT_RIGHT))
    outs.append(img.rotate(15))
    outs.append(img.rotate(-15))
    outs.append(ImageEnhance.Brightness(img).enhance(0.8))
    outs.append(ImageEnhance.Brightness(img).enhance(1.2))
    return outs


def load(folder, label):
    imgs = []
    for f in sorted(os.listdir(folder)):
        if f.lower().endswith((".jpg", ".png", ".webp")):
            try:
                imgs.append(Image.open(os.path.join(folder, f)).convert("RGB"))
            except Exception:
                pass
    return imgs, [label] * len(imgs)


def main():
    if len(sys.argv) >= 3:
        od, nd = sys.argv[1], sys.argv[2]
    else:
        od, nd = os.path.join(BASE, "orange"), os.path.join(BASE, "not_orange")

    imgs_o, y_o = load(od, 1)
    imgs_n, y_n = load(nd, 0)
    imgs = imgs_o + imgs_n
    y = np.array(y_o + y_n)
    print(f"原始数据：{len(imgs)} 张（橙子 {len(imgs_o)}，非橙子 {len(imgs_n)}）")

    # 固定划分：测试集不参与增强
    idx = np.arange(len(imgs))
    tr_idx, te_idx = train_test_split(idx, test_size=0.2, random_state=42, stratify=y)

    clf = lambda: make_pipeline(StandardScaler(), SVC(kernel="rbf", random_state=42))

    # A. 不增强
    X_tr = np.array([feat(imgs[i]) for i in tr_idx])
    y_tr = y[tr_idx]
    X_te = np.array([feat(imgs[i]) for i in te_idx])
    y_te = y[te_idx]
    m = clf().fit(X_tr, y_tr)
    acc_a = accuracy_score(y_te, m.predict(X_te))
    print(f"\nA 不增强：训练 {len(X_tr)} 张 → 测试精度 {acc_a:.1%}")

    # B. 训练集增强（每张变 6 张：原图 + 5 种变换）
    X_tr2, y_tr2 = [], []
    for i in tr_idx:
        X_tr2.append(feat(imgs[i])); y_tr2.append(y[i])
        for aug in augment(imgs[i]):
            X_tr2.append(feat(aug)); y_tr2.append(y[i])
    X_tr2 = np.array(X_tr2); y_tr2 = np.array(y_tr2)
    m2 = clf().fit(X_tr2, y_tr2)
    acc_b = accuracy_score(y_te, m2.predict(X_te))
    print(f"B 训练集增强：训练 {len(X_tr2)} 张 → 测试精度 {acc_b:.1%}")

    print(f"\n增强效果：{acc_a:.1%} → {acc_b:.1%}（{acc_b - acc_a:+.1%}）")
    print("注：增强只作用于训练集，测试集原样——防数据泄漏。")


if __name__ == "__main__":
    main()
