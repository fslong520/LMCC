# -*- coding: utf-8 -*-
"""
【任务卡】第3讲 步骤2：统一尺寸
任务：把两类图全部缩放成 128x128。
猜一猜：宽和高不相等的图，硬缩成正方形会发生什么？（画面被压扁了）
试一试：训练台内部对图片尺寸的处理也是"统一规格"——想想为什么要统一。
"""
import os
from PIL import Image

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "我的数据集")

for d in ["orange", "not_orange"]:
    folder = os.path.join(WORK, d)
    for f in sorted(os.listdir(folder)):
        if not f.lower().endswith((".jpg", ".png", ".webp")):
            continue
        path = os.path.join(folder, f)
        img = Image.open(path)
        if img.size != (128, 128):
            img.resize((128, 128)).save(path)
            print(f"{d}/{f}: {img.size} -> (128, 128)")
        else:
            print(f"{d}/{f}: 本来就是 128x128")
