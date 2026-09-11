# -*- coding: utf-8 -*-
"""
【任务卡】第5讲 步骤1：准确率（以及它的陷阱）
任务：算准确率，再做一个"全猜多数类"的坏实验。
猜一猜：95 张非橙子 + 5 张橙子，"永远猜非橙子"的笨模型准确率是多少？
试一试：这样的模型准确率高却没用——为什么？该看什么才能识破它？
"""
correct, total = 8, 10
print(f"认真模型：答对 {correct}/{total}，准确率 {correct / total:.1%}")

# 陷阱实验：不平衡数据
not_orange, orange = 95, 5
print(f"\n数据不平衡：非橙子 {not_orange} 张、橙子 {orange} 张")
print(f"笨模型'永远猜非橙子'：准确率 {not_orange / (not_orange + orange):.0%}，"
      f"但橙子全漏——{orange}/{orange} 假阴性！")
print("\n所以只看准确率不够，要看更细的：混淆矩阵（下一步）")
