# -*- coding: utf-8 -*-
"""
【任务卡】第3讲 步骤4：相似度去重（进阶）
任务：两张不同的照片也可能"几乎一样"（连拍）。把图缩成 32x32 灰度，比平均像素差。
猜一猜：一张橙子和一张键盘的差异值，大概会是多少？两张连拍橙子呢？
试一试：把 THRESH 调成 5 或 60，看"相似"的标准怎么变——阈值调参的第一课。
"""
import os
from PIL import Image

ASSET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "测试素材")
THRESH = 20   # 平均像素差小于它 -> 判为相似

def gray_small(path):
    return list(Image.open(path).convert("L").resize((32, 32)).getdata())

def diff(a, b):
    return sum(abs(x - y) for x, y in zip(a, b)) / len(a)

orange_dir = os.path.join(ASSET, "orange")
files = sorted(f for f in os.listdir(orange_dir) if f.lower().endswith(".jpg"))[:3]
e1 = gray_small(os.path.join(orange_dir, files[0]))
e2 = gray_small(os.path.join(orange_dir, files[1]))
kb = gray_small(os.path.join(ASSET, "not_orange_easy", sorted(
    f for f in os.listdir(os.path.join(ASSET, "not_orange_easy")) if f.lower().endswith(".jpg"))[0]))

print(f"橙子A vs 橙子B  平均像素差 = {diff(e1, e2):.1f}  -> {'相似' if diff(e1, e2) < THRESH else '不同'}")
print(f"橙子A vs 键盘   平均像素差 = {diff(e1, kb):.1f}  -> {'相似' if diff(e1, kb) < THRESH else '不同'}")
print("\n结论：真实连拍去重就是把所有图两两比较，差值小于阈值只留一张")
