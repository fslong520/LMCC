#import "../../lmcc-theme.typ": *

#show: lmcc-theme.with(
  level: "驾驭AI（创造应用篇）",
  lesson: "04",
  title: "AI编程入门-让AI帮我写代码",
  date: "2026年",
)

= AI编程入门-让AI帮我写代码

#objective[
- 掌握 Python 核心语法：变量、数据类型、类型转换、分支、循环、函数
- 掌握列表、字典两种核心数据结构，能读写简单文件
- 会用 AI 辅助编程：生成代码、解释逻辑、调试报错
- 独立完成一个综合小工具（含输入、处理、输出）
]

#warning[
*本节定位：Python 语法筑基 + AI 辅助编程入门。* 前两节课程序只是"调 API"，本节把 Python 本身学扎实——它是后续 RAG、智能体、综合项目的语言地基。语法虽多，但每点都配 AI 辅助练习：先让 AI 写，再读懂它、改它、调试它。*学编程的真正方式不是背语法，而是和 AI 结对写代码。*
]

== 〇、回顾（5分钟）

- LV3-03：dict、f-string、try/except 调 API
- 提问："写程序像不像做菜？需要哪些'食材'（数据）和'步骤'（流程）？"

== 一、导入（10分钟）

=== 1.1 程序的骨架：IPO

#key-concept("IPO = 输入 → 处理 → 输出", [
程序三环节：

+ *I（Input 输入）*：`input()` 从键盘读数据
+ *P（Process 处理）*：运算、判断、循环——核心逻辑
+ *O（Output 输出）*：`print()` 把结果给别人看

```python
name = input("请输入你的名字：")      # I
message = f"你好，{name}！"          # P
print(message)                        # O
```
])

=== 1.2 变量与命名

- 变量 = 贴标签的盒子，`=` 是*赋值*（装数据），不是数学等号
- 命名规则：字母、数字、下划线，不能数字开头；不用 Python 关键字
- 建议"见名知意"：`score`、`health`、`name`

```python
health = 100      # 整数
name = "小明"     # 字符串
is_alive = True   # 布尔
```

== 二、核心内容（25分钟）

=== 2.1 数据类型

| 类型 | 说明 | 示例 |
|:----:|:-----|:-----|
| `int` | 整数 | `100`、`-5` |
| `float` | 浮点数 | `3.14`、`0.5` |
| `str` | 字符串 | `"hello"`、`'AI'` |
| `bool` | 布尔值 | `True`、`False` |
| `None` | 空值 | `None` |
| `list` | 列表 | `[1, 2, 3]` |
| `dict` | 字典 | `{"key": "value"}` |

#key-concept("类型转换", [
`input()` 读进来的是*字符串*，要做数学运算必须先转类型：

```python
age = int(input("你的年龄？"))        # 字符串 → 整数
height = float(input("你的身高？"))   # 字符串 → 浮点数
score = str(95)                        # 整数 → 字符串
```

常用转换：`int()`、`float()`、`str()`、`list()`。
])

=== 2.2 分支结构：让程序做决定

#key-concept("if / elif / else", [
程序按条件走不同分支：

```python
score = int(input("请输入分数："))
if score >= 90:
    print("优秀")
elif score >= 60:
    print("及格")
else:
    print("需要努力")
```

- *缩进*（4 空格）表示代码属于哪个分支——Python 靠缩进分层
- 比较运算符：`==`、`!=`、`>`、`<`、`>=`、`<=`
- 逻辑运算符：`and`（且）、`or`（或）、`not`（非）
])

=== 2.3 循环结构：让程序重复做事

#key-concept("for 与 while", [
*for*：知道重复几次，或遍历一组数据。

```python
for i in range(5):                 # 0~4 共 5 次
    print(f"第 {i+1} 次")

for tool in ["ChatGPT", "Midjourney", "SD"]:
    print(f"AI 工具：{tool}")       # 遍历列表
```

*while*：不知道几次，满足条件就一直做。

```python
health = 100
while health > 0:
    health -= 10
    print(f"剩余血量：{health}")
```

控制词：`break` 跳出循环，`continue` 跳过本次。
])

=== 2.4 列表与字典：核心数据结构

#key-concept("列表 = 有序的一串，字典 = 键值对应", [
```python
# 列表 list：按序号存多个值
scores = [90, 85, 78]
print(scores[0])       # 90，下标从 0 开始
scores.append(95)      # 尾部加一个
print(len(scores))     # 4，长度

# 字典 dict：按名字存值
student = {"name": "小明", "age": 12}
print(student["name"]) # 小明
student["city"] = "北京"  # 新增键值对
```

- 列表用 `[]`，字典用 `{}`
- 遍历字典：`for key in student: print(key, student[key])`
])

=== 2.5 函数：把代码装进"盒子"

#key-concept("def 定义函数", [
```python
def greet(name):
    """打招呼：返回问候语"""
    return f"你好，{name}！"

print(greet("小明"))   # 调用函数，输出：你好，小明！
```

- `def 函数名(参数)` 定义，`return` 返回值
- 参数是"输入"，返回值是"输出"
- 常用内建函数：`print`、`input`、`len`、`range`、`max`、`min`、`sum`、`int`、`float`、`str`
])

=== 2.6 标准库与文件

#practice[
*操作*：导入模块、读写文件。

```python
import random

print(random.randint(1, 6))   # 掷骰子：1~6 随机

# 写文件
with open("result.txt", "w", encoding="utf-8") as f:
    f.write("AI 说：你好！")

# 读文件
with open("result.txt", "r", encoding="utf-8") as f:
    content = f.read()
print(content)
```

- `import` 导入模块，用 `模块.函数` 调用
- `with open(...) as f` 打开文件，结束自动关闭
]

== 三、实操练习（30分钟）

=== 3.1 练习一：AI 结对写"成绩评语生成器"

#practice[
*任务*：用 AI 辅助完成一个工具——输入学生姓名与成绩，输出个性化评语。

+ 步骤一：把需求告诉 AI——"写一个 Python 程序，输入姓名和成绩，90 分以上评'优秀'，60 分以上评'及格'，否则评'加油'，用 f-string 输出'XX同学，本次成绩XX，评价：XX'"
+ 步骤二：运行 AI 生成的代码，记录报错
+ 步骤三：把报错信息原样发给 AI，让它修复
+ 步骤四：把代码中的"评价规则"改成 `if/elif/else` 四档，亲身体会分支结构
]

#warning[
*AI 结对编程铁律*：先让 AI 生成 → 自己读懂 → 亲手修改 → 遇错发 AI 调试。禁止只"复制粘贴"而不理解——*读懂并改过一行代码，才算学会。*
]

=== 3.2 练习二：调试排错

#practice[
*任务*：修复老师准备的"带 bug 程序"（三处错误：缩进错、类型没转换、键名写错）。

+ 把报错信息原样复制给 AI
+ 对比 AI 修复前后，说出每处错在哪个知识点
+ 挑战：给程序加 `try/except`，让它在输入非法时友好提示而非崩溃
]

== 四、课后作业（10分钟）

1. 完成"成绩评语生成器"，支持输入任意多学生（用 `for` 循环 + 列表）
2. 用 AI 辅助编写"简易计算器"（加减乘除，含类型转换与分支）
3. 把程序输出的评语追加写入 `records.txt`（复习文件写入）

== 五、扩展阅读

- Python 官方教程（中文）：https://docs.python.org/zh-cn/3/tutorial/
- Python 之禅（廖雪峰）：https://www.liaoxuefeng.com/wiki/1016959663602400
- 下一课预告：LV3-05 扣子智能体与自动化——不写代码也能造自动化
