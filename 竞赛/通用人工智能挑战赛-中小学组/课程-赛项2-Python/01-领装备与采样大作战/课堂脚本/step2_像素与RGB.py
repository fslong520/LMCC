# -*- coding: utf-8 -*-
"""
【任务卡】第2讲 步骤2：像素与RGB
任务：读出图片某几个位置的颜色值，看看橙子像素长什么样。
猜一猜：橙子图的像素，是红(R)高还是蓝(B)高？
试一试：多取几个位置（改 x, y），有没有"不橙"的像素？比如橙子上的高光、影子。
"""
import os
from PIL import Image

ASSET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "测试素材")
folder = os.path.join(ASSET, "orange")
files = sorted(f for f in os.listdir(folder) if f.lower().endswith(".jpg"))
img = Image.open(os.path.join(folder, files[0])).convert("RGB")

w, h = img.size
print("图片：", files[0], "尺寸：", img.size)

for (x, y) in [(w // 2, h // 2), (w // 2, h // 3), (10, h - 10)]:
    r, g, b = img.getpixel((x, y))
    judge = "偏橙(红高蓝低)" if (r > 80 and r - b > 30) else "不橙(高光/背景等)"
    print(f"位置({x},{y}) -> R={r} G={g} B={b}  {judge}")
