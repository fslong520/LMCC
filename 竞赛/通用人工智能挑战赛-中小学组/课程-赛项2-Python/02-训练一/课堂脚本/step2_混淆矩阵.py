# -*- coding: utf-8 -*-
"""
【任务卡】第5讲 步骤2：混淆矩阵
任务：手写一个 2x2 混淆矩阵，弄清四格各是什么。
猜一猜：把'橘子'认成'橙子'，是假阳还是假阴？'没认出真橙子'呢？
试一试：改 predictions 里的一两个值，让假阳和假阴都变成 2。
"""
truth       = [1, 0, 1, 0, 1, 0]          # 真实：1=橙子，0=非橙子
predictions = [1, 0, 0, 1, 1, 0]          # 模型预测

tp = sum(1 for t, p in zip(truth, predictions) if t == 1 and p == 1)  # 真阳
fn = sum(1 for t, p in zip(truth, predictions) if t == 1 and p == 0)  # 假阴
fp = sum(1 for t, p in zip(truth, predictions) if t == 0 and p == 1)  # 假阳
tn = sum(1 for t, p in zip(truth, predictions) if t == 0 and p == 0)  # 真阴

print("                 预测=橙子   预测=非橙子")
print(f"  真实=橙子   |   真阳 {tp}    |   假阴 {fn}")
print(f"  真实=非橙子 |   假阳 {fp}    |   真阴 {tn}")
print(f"\n假阳性(把非橙认橙) = {fp}   假阴性(漏认橙子) = {fn}")
print(f"准确率 = {(tp + tn) / len(truth):.0%}")
