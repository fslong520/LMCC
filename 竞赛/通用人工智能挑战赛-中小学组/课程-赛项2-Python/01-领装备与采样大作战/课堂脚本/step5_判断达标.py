# -*- coding: utf-8 -*-
"""
【任务卡】第1讲 步骤5：判断达标
任务：用 if/elif/else 判断图片数量够不够训练。
猜一猜：count=18 时走哪条路？改成 5 呢？改成 3 呢？
试一试：把三个数都试一遍，说出门槛分别是什么。
"""
for count in [18, 5, 3]:
    if count >= 20:
        print(f"{count}张 -> 数量充足，可以训练")
    elif count >= 5:
        print(f"{count}张 -> 刚到最低门槛，建议再加")
    else:
        print(f"{count}张 -> 不够5张，无法训练")
