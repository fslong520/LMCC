# -*- coding: utf-8 -*-
"""
【任务卡】第2讲 步骤5（收官）：批量看尺寸
任务：遍历整个橙子文件夹，打印每张图的尺寸，揪出"不合群"的图。
猜一猜：40 张橙子图，尺寸全都一样大吗？
试一试：给循环里加一句判断，只打印"宽度不是 330"的图，有几张？
"""
import os
from PIL import Image

ASSET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "测试素材")
folder = os.path.join(ASSET, "orange")

for f in sorted(os.listdir(folder)):
    if f.lower().endswith((".jpg", ".png", ".webp")):
        img = Image.open(os.path.join(folder, f))
        print(f"{f:20s} {img.size}")
print("\n尺寸差异过大可统一 resize——第3讲就干这个")
