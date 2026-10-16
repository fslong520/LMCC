import random

# 第二句之后：每一年怎么过我自己选（投 9 就崩在这行）
print("=== 模拟人生 · 自己选版 ===")
name = input("给这一生起个名字：")
wits = int(input("智力加几点："))
body = int(input("体质加几点："))
luck = int(input("运气加几点："))

ACTIONS = ["死磕学习", "帮家里看店", "打游戏", "跑步锻炼"]

wealth = 0
wits_add = 0
for age in range(1, 19):
    print("第 " + str(age) + " 年，怎么过？1 学习  2 看店  3 打游戏  4 锻炼")
    pick = int(input("输编号："))
    act = ACTIONS[pick - 1]
    if act == "死磕学习":
        wits_add = wits_add + 2
    elif act == "帮家里看店":
        wealth = wealth + 100
    elif act == "打游戏":
        wealth = wealth - 20
    else:
        body = body + 1

print(name + " 18 岁，攒下 " + str(wealth) + " 块，智力 +" + str(wits_add))
if wealth >= 500:
    print("结局：小富翁")
else:
    print("结局：普通人")
