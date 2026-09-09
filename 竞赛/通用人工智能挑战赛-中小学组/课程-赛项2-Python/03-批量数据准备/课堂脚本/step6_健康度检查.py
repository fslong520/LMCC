# -*- coding: utf-8 -*-
"""
【任务卡】第3讲 步骤6（收官）：健康度检查
任务：给工作区做"体检"——数两类张数、判断是否达标、是否平衡。
猜一猜：现在两类各有多少张？按训练台"每类至少5张、建议20张"的标准，达标了吗？
试一试：把检查项再加一条——测试集和训练集的图有没有混？（提示：set 交集为空）
"""
import os

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "我的数据集")

def count(folder):
    if not os.path.isdir(folder):
        return 0
    return len([f for f in os.listdir(folder) if f.lower().endswith((".jpg", ".png", ".webp"))])

orange_n = count(os.path.join(WORK, "orange_train"))
notorange_n = count(os.path.join(WORK, "not_orange_train"))
print(f"训练集——橙子 {orange_n} 张，非橙子 {notorange_n} 张")

if orange_n >= 20 and notorange_n >= 20:
    print("数量充足，且两类平衡，可训练")
elif orange_n >= 5 and notorange_n >= 5:
    print("刚过最低门槛，建议补到 20+（每类）")
else:
    print("某类不足 5 张，无法训练")

# 检查泄漏：训练/测试集合有没有混
for d in ["orange", "not_orange"]:
    train = set(os.listdir(os.path.join(WORK, d + "_train")))
    test = set(os.listdir(os.path.join(WORK, d + "_test")))
    leak = train & test
    print(f"[{d}] 泄漏检查：{'发现 ' + str(len(leak)) + ' 张同图两边都有！' if leak else '无泄漏'}")
