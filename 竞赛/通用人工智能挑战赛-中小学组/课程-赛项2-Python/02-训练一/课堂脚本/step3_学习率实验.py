# -*- coding: utf-8 -*-
"""
【任务卡】第4讲 步骤3：学习率实验（下山找宝藏）
任务：模拟"从山坡下到谷底"——学习率就是每一步迈多大。
猜一猜：步长 0.02、0.3、1.1 三种走法，谁能到谷底？谁会在山谷两边乱跳？
试一试：再添一种步长试试（改 LR_LIST），说出你发现的现象。
"""
LR_LIST = [0.02, 0.3, 1.1]   # 三种学习率

def valley(x):
    """山谷地形：x=0 是谷底，越偏越高"""
    return x * x

for lr in LR_LIST:
    x = 5.0          # 从山坡上出发
    path = [round(x, 2)]
    for _ in range(20):
        grad = 2 * x         # 坡度
        x = x - lr * grad    # 迈一步
        path.append(round(x, 2))
        if abs(x) < 0.01:
            break
    steps = len(path) - 1
    if steps >= 20:
        print(f"学习率 {lr}: 20步没到谷底，位置在 {x:.2f} —— 太大，在山两边乱跳！")
    else:
        print(f"学习率 {lr}: {steps} 步到谷底（位置 {x:.4f}）"
              + (" —— 稳" if lr <= 0.1 else " —— 大步但侥幸"))

print("\n学习率：太大乱跳、太小太慢。训练台默认 0.001，先用默认，不稳再小调")
