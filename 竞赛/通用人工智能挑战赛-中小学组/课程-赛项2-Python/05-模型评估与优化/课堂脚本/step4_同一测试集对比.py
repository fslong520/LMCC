# -*- coding: utf-8 -*-
"""
【任务卡】第5讲 步骤4：同一测试集对比
任务：补难例重训前后，用同一组测试图公平比一比。
猜一猜：换了测试集再比，行不行？为什么必须同一组？
试一试：改 v2_pred 里的一个值，让 v2 反而更差——现实的优化也会失败，重训再看。
"""
testset = ["t1.jpg", "t2.jpg", "t3.jpg", "t4.jpg", "t5.jpg"]
truth   = [1, 0, 1, 1, 0]            # 真实标签：1=橙子，0=非橙子

def accuracy(predictions):
    correct = sum(1 for p, t in zip(predictions, truth) if p == t)
    return correct / len(truth)

v1_pred = [1, 0, 1, 0, 0]   # 模型v1（t4 认错）
v2_pred = [1, 0, 1, 1, 0]   # 补难例重训后的模型v2
print(f"测试集：{testset}")
print(f"v1 准确率：{accuracy(v1_pred):.0%}")
print(f"v2 准确率：{accuracy(v2_pred):.0%}")

print("\n要点：同一组保留测试图 + 每次重训记录版本，改进才作数")
