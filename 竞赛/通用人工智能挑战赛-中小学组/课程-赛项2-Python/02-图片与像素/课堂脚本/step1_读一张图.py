# -*- coding: utf-8 -*-
"""
【任务卡】第2讲 步骤1：读一张图
任务：用 Pillow 打开一张橙子图，报出尺寸和格式。
猜一猜：这张图有多大？是什么格式？
试一试：把 index 改成别的数字，读另一张图——尺寸都一样吗？
（注：img.show() 会弹图片窗口；若在远程教室弹不出，可删掉那行）
"""
import os
from PIL import Image

ASSET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "测试素材")
folder = os.path.join(ASSET, "orange")

files = sorted(f for f in os.listdir(folder) if f.lower().endswith((".jpg", ".png", ".webp")))
path = os.path.join(folder, files[0])
img = Image.open(path)

print("文件：", files[0])
print("尺寸：", img.size)     # (宽, 高)
print("格式：", img.format)   # 如 JPEG

# img.show()   # 想看图就把行首的 # 删掉
print("图片在电脑里就是一个'像素矩阵'对象——下一步我们伸手摸摸它")
