# -*- coding: utf-8 -*-
"""
【任务卡】第1讲 步骤4：字典分类
任务：用字典把图片按"橙子 / 非橙子"两类装起来。
猜一猜：橙子类有几张？非橙子类有几张？
试一试：往非橙子类加一张"橙色球.jpg"再跑——为什么橙色球要算非橙子？
"""
dataset = {
    "orange": ["橙子1.jpg", "橙子2.jpg"],    # 橙子类
    "not_orange": ["苹果.jpg", "橘子.jpg"],  # 非橙子类
}

print("橙子类有", len(dataset["orange"]), "张")
print("非橙子类有", len(dataset["not_orange"]), "张")
print("训练台就是按这两类组织图片的")
