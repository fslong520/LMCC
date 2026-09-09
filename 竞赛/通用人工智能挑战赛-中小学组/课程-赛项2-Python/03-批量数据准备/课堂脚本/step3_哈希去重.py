# -*- coding: utf-8 -*-
"""
【任务卡】第3讲 步骤3：哈希去重
任务：给每张图算"指纹"（MD5），把指纹相同的多余副本删掉。
猜一猜：工作区里埋了几张重复图？这一步会删几张？
试一试：删完后把 step0 重跑一遍再重复本步——结果一样吗？这叫可重复流程。
"""
import os, hashlib

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "我的数据集")

def img_hash(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()

for d in ["orange", "not_orange"]:
    folder = os.path.join(WORK, d)
    seen = set()
    for f in sorted(os.listdir(folder)):
        if not f.lower().endswith((".jpg", ".png", ".webp")):
            continue
        path = os.path.join(folder, f)
        h = img_hash(path)
        if h in seen:
            os.remove(path)
            print(f"[{d}] 指纹相同，删除副本：{f}")
        else:
            seen.add(h)
            print(f"[{d}] 保留：{f}")
