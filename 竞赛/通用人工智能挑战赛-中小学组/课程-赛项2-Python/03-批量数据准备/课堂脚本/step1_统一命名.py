# -*- coding: utf-8 -*-
"""
【任务卡】第3讲 步骤1：统一命名
任务：把"我的数据集/orange"里所有图重命名为 orange_1.jpg、orange_2.jpg……
猜一猜：那张"重复_xxx.jpg"会被改成什么名字？
试一试：跑两遍——第二遍还有东西可改吗？为什么？（看它怎么处理"名字已是目标名"）
"""
import os

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "我的数据集")
folder = os.path.join(WORK, "orange")

files = [f for f in os.listdir(folder) if f.endswith((".jpg", ".png", ".webp"))]
for i, f in enumerate(sorted(files)):
    old = os.path.join(folder, f)
    new = os.path.join(folder, f"orange_{i + 1}.jpg")
    if os.path.abspath(old) != os.path.abspath(new):
        os.rename(old, new)
        print(f"重命名：{f} -> orange_{i + 1}.jpg")
    else:
        print(f"跳过（已是目标名）：{f}")
print(f"\n共处理 {len(files)} 张")
