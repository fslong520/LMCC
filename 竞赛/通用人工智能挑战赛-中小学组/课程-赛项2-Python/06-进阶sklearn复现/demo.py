# -*- coding: utf-8 -*-
"""
识物工坊·橙子二分类 demo —— 用本课程测试素材跑通"数据→特征→训练→测试→评估"链路
对应第6讲《进阶：用 Python 复现图像二分类》

用法：
    python demo.py              # 用测试素材（orange/ + not_orange/）
    python demo.py <橙子目录> <非橙子目录>   # 指定自定义数据目录

输出：训练/测试划分、准确率、混淆矩阵、样例预测
"""
import os, sys
import numpy as np
from PIL import Image
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import confusion_matrix, accuracy_score

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "测试素材")

def load_features(folder, label, size=16):
    """读文件夹所有图，提取特征：缩略图灰度像素展平 + 平均RGB。返回(X, y)"""
    X, y = [], []
    folder = os.path.abspath(folder)
    for f in sorted(os.listdir(folder)):
        if not f.lower().endswith((".jpg", ".png", ".webp")):
            continue
        path = os.path.join(folder, f)
        try:
            img = Image.open(path).convert("RGB").resize((size, size))
            small = np.asarray(img, dtype=float) / 255.0      # 归一化 0~1
            feat = small.flatten()                            # 缩略图所有像素
            r, g, b = small.mean(axis=(0, 1))                 # 平均RGB
            X.append(np.concatenate([feat, [r, g, b]]))
            y.append(label)
        except Exception as e:
            print(f"跳过异常图 {f}: {e}")
    return X, y

def main():
    if len(sys.argv) >= 3:
        orange_dir, notorange_dir = sys.argv[1], sys.argv[2]
    else:
        orange_dir = os.path.join(BASE, "orange")
        notorange_dir = os.path.join(BASE, "not_orange")

    # 1. 加载数据（橙子=1，非橙子=0）
    Xo, yo = load_features(orange_dir, 1)
    Xn, yn = load_features(notorange_dir, 0)
    X = np.array(Xo + Xn); y = np.array(yo + yn)
    print(f"样本数：橙子 {len(Xo)}，非橙子 {len(Xn)}，共 {len(X)}")

    # 2. 8:2 划分训练/测试（防泄漏：只按这里划分，测试图不进训练）
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    print(f"训练集 {len(X_train)}，测试集 {len(X_test)}")

    # 3. 训练
    clf = DecisionTreeClassifier(max_depth=8, random_state=42)
    clf.fit(X_train, y_train)
    print("训练完成")

    # 4. 评估
    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    cm = confusion_matrix(y_test, y_pred)
    print(f"\n测试集准确率：{acc:.2%}")
    print("混淆矩阵(行=真实[非橙,橙], 列=预测[非橙,橙])：")
    print(cm)
    print("  假阳性(把非橙认橙):", cm[0][1])
    print("  假阴性(漏认橙子):", cm[1][0])

    # 5. 样例
    print("\n样例预测（3条）：")
    for i in range(min(3, len(X_test))):
        name = "橙子" if y_pred[i] == 1 else "非橙子"
        truth = "橙子" if y_test[i] == 1 else "非橙子"
        print(f"  预测={name}，真实={truth}")

    print("\n想看'深度模型'长什么样？运行 python cnn_numpy.py ——")
    print("  手写的两层卷积网络（纯 numpy），训练准确率 97%+ 但验证 ~60%：")
    print("  现场演示'过拟合'——数据量是深度学习的水。")

if __name__ == "__main__":
    main()
