# -*- coding: utf-8 -*-
"""
【任务卡】第4讲 步骤2：分批喂图（批大小）
任务：把数据切成一小批一小批喂给"模型"。
猜一猜：6 张图、批大小 2，会切几批？最后一批不满会怎样？
试一试：把 batch_size 改成 4，切完的结果对不对得上你的预期？
"""
dataset = ["图1", "图2", "图3", "图4", "图5", "图6"]
batch_size = 2

for i in range(0, len(dataset), batch_size):
    batch = dataset[i:i + batch_size]
    print(f"第 {i // batch_size + 1} 批（{len(batch)}张）：", batch)

print("\n识物工坊批大小可选 8/16/32，默认 16；样本少时保持默认，别乱改")
