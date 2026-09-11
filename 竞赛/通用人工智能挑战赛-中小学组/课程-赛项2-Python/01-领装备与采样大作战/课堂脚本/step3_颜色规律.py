# -*- coding: utf-8 -*-
"""
【任务卡】第2讲 步骤3：颜色规律
任务：把橙子、橘子(难例)、键盘(易例)三类的平均颜色都算出来对比。
猜一猜：哪一类和橙子的平均色最接近？差多少？
试一想：只看"平均色"能分清橙子和橘子吗？——这就是难例为什么难。
"""
import os
from PIL import Image

ASSET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "测试素材")

def avg_rgb(folder, limit=10):
    """取该类前 limit 张图，算平均RGB"""
    files = sorted(f for f in os.listdir(folder) if f.lower().endswith(".jpg"))[:limit]
    rs = gs = bs = n = 0
    for f in files:
        img = Image.open(os.path.join(folder, f)).convert("RGB")
        for px in list(img.resize((8, 8)).getdata()):
            rs += px[0]; gs += px[1]; bs += px[2]; n += 1
    return rs // n, gs // n, bs // n

for name, d in [("橙子", "orange"), ("橘子等难例", "not_orange"), ("键盘等易例", "not_orange_easy")]:
    r, g, b = avg_rgb(os.path.join(ASSET, d))
    print(f"{name:6s} 平均RGB = ({r}, {g}, {b})  {'红高蓝低' if r > b else '非红高蓝低'}")
