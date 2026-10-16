import random

# 模拟人生 · 最终版：名字、天赋、编号都会说人话；结局按组合条件分七档
print("=== 模拟人生 · 最终版 ===")
while True:
    name = input("给这一生起个名字：").strip()
    if name:
        break
    print("名字总得有一个吧")

def ask(what):
    while True:
        v = input(what + "加几点（0-20）：").strip()
        if v.isdigit() and int(v) <= 20:
            return int(v)
        print("请输 0 到 20 的数字")

wits = ask("智力")
body = ask("体质")
luck = ask("运气")

wealth = 0
for age in range(1, 19):
    while True:
        pick = input("第 " + str(age) + " 年怎么过？1 学习 2 看店 3 打游戏 4 锻炼 ：").strip()
        if pick.isdigit() and 1 <= int(pick) <= 4:
            pick = int(pick)
            break
        print("输 1 到 4 的编号")
    if pick == 1:
        wits = wits + 2
    elif pick == 2:
        wealth = wealth + 100 + wits * 5
    elif pick == 3:
        luck = luck + 1
        wealth = wealth - 20
    else:
        body = body + 1

print("18 岁，" + name + " 攒下 " + str(wealth) + " 块，智力 " + str(wits) + "，体质 " + str(body) + "，运气 " + str(luck))

if wits >= 40 and body >= 25 and luck >= 25:
    print("结局：六边形战士")
elif wits >= 40 and body < 25:
    print("结局：学霸，课间都在补觉")
elif body >= 30 and luck >= 30:
    print("结局：体育生，运气还特别好")
elif wealth >= 1500:
    print("结局：小金库攒起来了")
elif luck >= 35:
    print("结局：运气好得不讲道理")
elif wits >= 25 or body >= 25:
    print("结局：普通，但有一样拿得出手")
else:
    print("结局：平平无奇，下辈子再练")
