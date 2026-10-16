import random

# 模拟人生（AI 第一版）：属性、事件、结局，全是它自己定的
print("=== 模拟人生 ===")
name = input("给这一生起个名字：")
wits = int(input("智力加几点（0-20）："))
body = int(input("体质加几点（0-20）："))
luck = int(input("运气加几点（0-20）："))

wealth = 0
story = []
for age in range(1, 19):
    desc, delta = random.choice([
        ("捡到 50 块", 50),
        ("考试进了前十", 0),
        ("感冒请三天假", -20),
        ("认识个好朋友", 0),
        ("打篮球扭了脚", -30),
    ])
    wealth = wealth + delta + wits + luck // 2
    story.append(str(age) + " 岁：" + desc)

for line in story:
    print(line)
print(name + " 18 岁，攒下 " + str(wealth) + " 块")
if wealth >= 500:
    print("结局：小富翁")
else:
    print("结局：普通人")
