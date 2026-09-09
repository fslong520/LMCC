# -*- coding: utf-8 -*-
"""
【任务卡】第3讲 步骤5：划分数据集
任务：把工作区的图按 8:2 分成训练集和测试集。
猜一猜：8 张图分 8:2，训练几张、测试几张？random.shuffle 之后是哪几张去测试？
试一试：跑两遍，测试集里的图名变了吗？（随机性）——但"测试图绝不进训练"永远不变。
"""
import os, random, shutil

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "我的数据集")

def split_folder(src, train_dir, test_dir, ratio=0.8):
    os.makedirs(train_dir, exist_ok=True)
    os.makedirs(test_dir, exist_ok=True)
    files = [f for f in os.listdir(src) if f.lower().endswith((".jpg", ".png", ".webp"))]
    random.shuffle(files)
    cut = int(len(files) * ratio)
    for i, f in enumerate(files):
        dst = train_dir if i < cut else test_dir
        shutil.copy(os.path.join(src, f), os.path.join(dst, f))
    return cut, len(files) - cut

for d in ["orange", "not_orange"]:
    src = os.path.join(WORK, d)
    n_train, n_test = split_folder(src, os.path.join(WORK, d + "_train"), os.path.join(WORK, d + "_test"))
    print(f"{d}: 训练 {n_train} 张，测试 {n_test} 张")

print("\n铁律：测试集的图绝不进训练——这是防数据泄漏")
