# -*- coding: utf-8 -*-
"""
【任务卡】第5讲 步骤3：误判归档
任务：把测试结果里的误判自动分成"假阳堆"和"假阴堆"，为补难例做准备。
猜一猜：这两堆图，各自该补什么样的新图？
试一试：往 results 里添两条你自己的误判记录（编个文件名也行），看归档对不对。
"""
results = [
    ("orange",     "orange_test_1.jpg", "正确"),   # 真阳
    ("orange",     "orange_test_2.jpg", "漏认"),   # 假阴：真橙子没认出
    ("not_orange", "tangerine.jpg",     "误认"),   # 假阳：橘子被认成橙
    ("not_orange", "keyboard.jpg",      "正确"),   # 真阴
]

false_positive = [r for r in results if r[2] == "误认"]
false_negative = [r for r in results if r[2] == "漏认"]

print(f"假阳堆（{len(false_positive)}张，把非橙认成橙）：")
for r in false_positive:
    print("   ", r[1])
print(f"假阴堆（{len(false_negative)}张，漏掉真橙子）：")
for r in false_negative:
    print("   ", r[1])

print("\n药方：假阳多 -> 补相似非橙子难例；假阴多 -> 补不同光线角度的橙子")
