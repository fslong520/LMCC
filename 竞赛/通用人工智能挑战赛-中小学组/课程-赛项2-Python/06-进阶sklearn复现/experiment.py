# -*- coding: utf-8 -*-
"""
识物工坊·橙子二分类 优化实验
对比不同特征 / 模型 / 评估法，在"难例"数据（橘子/杏/南瓜等极像橙子）上的精度。

用法：
    python experiment.py                 # 默认用 测试素材/orange + not_orange（难例）
    python experiment.py <橙子目录> <非橙子目录>

说明：数据量小（各40张），单次 8:2 划分的测试精度波动大，
      故主指标用 5 折交叉验证（cross_val_score），更可靠。
"""
import os, sys, warnings
import numpy as np
from PIL import Image
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline

warnings.filterwarnings("ignore")
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "测试素材")


# ---------- 特征提取 ----------
def feat_basic(img):
    """A：16×16 RGB 缩略图展平 + 平均RGB（demo 当前用法）"""
    small = np.asarray(img.resize((16, 16)), dtype=float) / 255.0
    return np.concatenate([small.flatten(), small.mean(axis=(0, 1))])

def feat_rich(img):
    """B：32×32 RGB + 每通道均值/标准差（更多空间信息）"""
    small = np.asarray(img.resize((32, 32)), dtype=float) / 255.0
    mean = small.mean(axis=(0, 1))
    std = small.std(axis=(0, 1))
    return np.concatenate([small.flatten(), mean, std])

def feat_hsv_hist(img):
    """C：HSV 颜色直方图（H/S/V 各 16 bin，对光照更鲁棒）"""
    hsv = np.asarray(img.convert("HSV").resize((32, 32)), dtype=float) / 255.0
    hist = []
    for ch in range(3):
        h, _ = np.histogram(hsv[:, :, ch], bins=16, range=(0, 1), density=True)
        hist.append(h)
    return np.concatenate(hist)

def feat_combined(img):
    """D：B + C（空间 + 颜色分布）"""
    return np.concatenate([feat_rich(img), feat_hsv_hist(img)])


FEATS = {
    "A_basic16": feat_basic,
    "B_rich32": feat_rich,
    "C_hsvhist": feat_hsv_hist,
    "D_combined": feat_combined,
}

MODELS = {
    "决策树": lambda: DecisionTreeClassifier(max_depth=8, random_state=42),
    "随机森林": lambda: RandomForestClassifier(n_estimators=200, random_state=42),
    "SVM": lambda: make_pipeline(StandardScaler(), SVC(kernel="rbf", random_state=42)),
    "KNN": lambda: make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=5)),
}


def load(folder, label):
    X = []
    for f in sorted(os.listdir(folder)):
        if not f.lower().endswith((".jpg", ".png", ".webp")):
            continue
        p = os.path.join(folder, f)
        try:
            img = Image.open(p).convert("RGB")
            X.append(img)
        except Exception as e:
            print(f"跳过 {f}: {e}")
    return X, [label] * len(X)


def main():
    if len(sys.argv) >= 3:
        od, nd = sys.argv[1], sys.argv[2]
    else:
        od = os.path.join(BASE, "orange")
        nd = os.path.join(BASE, "not_orange")

    imgs_o, y_o = load(od, 1)
    imgs_n, y_n = load(nd, 0)
    imgs = imgs_o + imgs_n
    y = np.array(y_o + y_n)
    print(f"数据：橙子 {len(imgs_o)}，非橙子 {len(imgs_n)}，共 {len(imgs)}")
    print(f"数据集：{os.path.basename(od)} vs {os.path.basename(nd)}（难例越多，越难分）\n")

    print(f"{'特征':<12}{'模型':<10}{'5折CV均值':>10}{'标准差':>8}")
    print("-" * 42)
    results = []
    for fname, ffn in FEATS.items():
        X = np.array([ffn(im) for im in imgs])
        for mname, mfn in MODELS.items():
            clf = mfn()
            scores = cross_val_score(clf, X, y, cv=5, scoring="accuracy")
            results.append((scores.mean(), fname, mname, scores.std()))
            print(f"{fname:<12}{mname:<10}{scores.mean():>9.1%}{scores.std():>9.3f}")

    results.sort(reverse=True)
    print("\n最佳组合：")
    for mean, f, m, std in results[:3]:
        print(f"  {f} + {m} → CV {mean:.1%} (±{std:.3f})")

    # 与 baseline 对比
    base = [r for r in results if r[1] == "A_basic16" and r[2] == "决策树"]
    if base:
        gain = results[0][0] - base[0][0]
        print(f"\n相比 baseline（A_basic16 + 决策树 {base[0][0]:.1%}）：提升 {gain:+.1%}")


if __name__ == "__main__":
    main()
