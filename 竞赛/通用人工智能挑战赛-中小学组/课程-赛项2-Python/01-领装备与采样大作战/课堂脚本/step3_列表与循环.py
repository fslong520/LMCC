# -*- coding: utf-8 -*-
"""
【任务卡】第1讲 步骤3：列表与循环
任务：把一批图片名装进列表，用 for 逐张"检查"。
猜一猜：一共会打印几行？第一行打印的是列表里第几张？
试一试：在列表里再加一张"橙子4.jpg"，猜对行数了吗？
"""
orange_imgs = ["橙子1.jpg", "橙子2.jpg", "橙子3.jpg"]

for img in orange_imgs:
    print("正在检查：", img)

print("下标 0 是：", orange_imgs[0])   # 下标从 0 开始！
