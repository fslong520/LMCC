# -*- coding: utf-8 -*-
"""
【任务卡】第2讲 步骤4：橙色占比（笨办法分类器）
任务：数一数整张图里"偏橙"像素占多少，用占比猜这张图是不是橙子。
猜一猜：给一张橙子图，占比会超过 0.3 吗？给一张键盘图呢？
（脚本取三类各 5 张图一起算，看"笨办法"的分类成绩。）
试一试：把 THRESH 调小/调大，看分类结果怎么变——调参的滋味，先尝一口。
"""
import os
from PIL import Image

ASSET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "测试素材")
THRESH = 0.3   # 占比超过它就猜"橙子"

def orange_ratio(path, step=5):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    orange_px = total = 0
    for x in range(0, w, step):
        for y in range(0, h, step):
            r, g, b = img.getpixel((x, y))
            total += 1
            if r > 150 and b < 120:   # 偏橙的粗略判断
                orange_px += 1
    return orange_px / total

hit = miss = 0
for d, expect in [("orange", "橙子"), ("not_orange", "非橙子"), ("not_orange_easy", "非橙子")]:
    folder = os.path.join(ASSET, d)
    files = sorted(x for x in os.listdir(folder) if x.lower().endswith(".jpg"))[:5]
    for f in files:
        ratio = orange_ratio(os.path.join(folder, f))
        guess = "橙子" if ratio > THRESH else "非橙子"
        mark = "对" if guess == expect else "错"
        if guess == expect:
            hit += 1
        else:
            miss += 1
        print(f"{d:16s} {f:16s} 占比={ratio:.2f} -> 猜：{guess}（{mark}）")

print(f"\n笨办法成绩：{hit} 对 / {miss} 错。规则分类器就这样——真正能学的模型在第6讲")
