import random

# 第三句之后：输错不再崩，可结局它只看钱，门槛还是它定的
print("=== 模拟人生 · 带校验版 ===")
name = input("给这一生起个名字：")
wits = int(input("智力加几点："))
body = int(input("体质加几点："))
luck = int(input("运气加几点："))

ACTIONS = ["死磕学习", "帮家里看店", "打游戏", "跑步锻炼"]

wealth = 0
wits_add = 0
for age in range(1, 19):
    while True:
        pick = input("第 " + str(age) + " 年怎么过？输 1-4 ：").strip()
        if pick == "" or not pick.isdigit() or int(pick) < 1 or int(pick) > 4:
            print("输 1 到 4 的编号，比如 2")
        else:
            break
    act = ACTIONS[int(pick) - 1]
    if act == "死磕学习":
        wits_add = wits_add + 2
    elif act == "帮家里看店":
        wealth = wealth + 100
    elif act == "打游戏":
        wealth = wealth - 20
    else:
        body = body + 1

print(name + " 18 岁，攒下 " + str(wealth) + " 块")
if wealth >= 100000:
    print("结局：亿万富翁")
elif wealth >= 50000:
    print("结局：小富翁")
else:
    print("结局：普通人")
