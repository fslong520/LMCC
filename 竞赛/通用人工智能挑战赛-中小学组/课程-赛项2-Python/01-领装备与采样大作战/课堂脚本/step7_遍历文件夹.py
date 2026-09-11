# -*- coding: utf-8 -*-
"""
【任务卡】第1讲 步骤7（收官）：遍历文件夹
任务：用 os 真的数出测试素材里橙子图片的张数。
猜一猜：素材里橙子有多少张？（跑之前先说说你的猜测）
试一试：把 folder 换成 not_orange_easy，数数对照组有多少张。
"""
import os

# 脚本在 01-Python起步/课堂脚本/ 下，素材在 ../../测试素材/
ASSET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "测试素材")
folder = os.path.join(ASSET, "orange")

img_count = 0
for f in os.listdir(folder):
    if f.endswith((".jpg", ".png", ".webp")):
        img_count += 1

print(f"共找到 {img_count} 张橙子图片")
print("这就是第6步那个函数的'真身'——把这里改成 return img_count，count_imgs 就活了")
