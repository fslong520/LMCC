# -*- coding: utf-8 -*-
"""
【任务卡】第3讲 步骤0（每次动手前必做）：准备工作区
任务：从测试素材复制一小批图到"我的数据集"工作区，并故意埋 2 张重复图。
猜一猜：为什么宁可多复制一份，也不直接在素材上改？
试一试：打开 我的数据集/orange 文件夹，找到被埋的那两张重复图。
"""
import os, shutil

ASSET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "测试素材")
WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "我的数据集")

for d, src, n in [("orange", "orange", 8), ("not_orange", "not_orange", 8)]:
    dst = os.path.join(WORK, d)
    os.makedirs(dst, exist_ok=True)
    files = sorted(f for f in os.listdir(os.path.join(ASSET, src)) if f.lower().endswith(".jpg"))[:n]
    for f in files:
        shutil.copy(os.path.join(ASSET, src, f), os.path.join(dst, f))
    # 每类故意埋 1 张重复（复制最后一张再存一份）——留给步骤3去重
    shutil.copy(os.path.join(dst, files[-1]), os.path.join(dst, "重复_" + files[-1]))
    print(f"已复制 {len(files)} 张到 我的数据集/{d}/（含 1 张故意重复）")

print("\n记住铁律：原始素材永不改动，所有操作在备份工作区里做")
