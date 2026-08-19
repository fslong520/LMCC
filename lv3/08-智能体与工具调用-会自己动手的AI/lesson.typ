#import "../../lmcc-theme.typ": *

#show: lmcc-theme.with(
  level: "驾驭AI（创造应用篇）",
  lesson: "08",
  title: "智能体与工具调用-会自己动手的AI",
  date: "2026年",
)

= 智能体与工具调用-会自己动手的AI

#objective[
- 理解 Agent（智能体）的概念：能自主规划、调用工具、完成任务
- 掌握 Python 函数定义、参数、返回值——函数就是"工具"
- 理解 Function Calling（函数调用）：AI 学会"点名调用"你写的函数
- 用 Python 实现一个迷你智能体：规划 + 工具调用循环
]

#warning[
*本节定位：让 AI 从"会聊"到"会做"。* 之前 AI 只回文字；本节让 AI 学会*调用工具*——查天气、算数学、查数据库。关键 Python 概念是*函数*：每个工具就是一个函数，AI 通过"函数调用"机制点名字用它们。函数的参数与返回值，就是工具与 AI 之间的"接口"。
]

== 〇、回顾（5分钟）

- LV3-07 知识库：RAG 落地
- 提问："AI 说'明天有雨'，它自己真查了天气吗？如果让你写一个'查天气'的本事，代码长什么样？"

== 一、导入（10分钟）

=== 1.1 从"聊天机器人"到"智能体"

#key-concept("Agent = 能动手的 AI", [
普通 AI：你问 → 它答（只动嘴）。
智能体：你给目标 → 它*自己规划* → *调用工具* → 完成任务（动手做）。

三个能力：

+ *规划*：把大任务拆成小步骤
+ *工具*：能调用的函数/API（查天气、算数、读文件……）
+ *记忆*：记住上下文与中间结果
])

=== 1.2 工具就是函数

Python 里"工具"就是一个函数：

```python
def get_weather(city):
    """查天气：返回城市天气描述"""
    # 这里可接真实天气 API
    return f"{city}：晴，25℃"

print(get_weather("北京"))
```

== 二、核心内容（25分钟）

=== 2.1 函数三要素：定义、参数、返回值

#key-concept("函数的接口 = 参数与返回值", [
```python
def add(a, b):
    """计算两数之和"""
    return a + b

def multiply(a, b):
    return a * b

# 调用
print(add(3, 5))        # 8
print(multiply(4, 6))   # 24
```

- *参数*（`a`, `b`）：调用时传入的"输入"
- *返回值*（`return`）：函数算完交回的"输出"
- 函数的"说明书"（docstring `"""..."""`）告诉使用者它干什么
])

=== 2.2 用字典管理工具清单

#key-concept("工具表 = 名字 → 函数", [
把工具登记成一张表（字典：工具名 → 函数），AI 就能"点名"调用：

```python
def get_weather(city):
    return f"{city}：晴，25℃"

def calculate(expr):
    # 注意：仅教学演示，生产环境慎用 eval
    return eval(expr)

# 工具清单
tools = {
    "get_weather": get_weather,
    "calculate": calculate,
}

# 按名字调用
tool_name = "get_weather"
if tool_name in tools:
    print(tools[tool_name]("北京"))
```

- 字典的*键*是工具名，*值*是函数本身
- `tools[name](参数)`：按名字取出函数并调用——这就是"函数调用"的雏形
])

=== 2.3 Function Calling：AI 决定调哪个工具

#key-concept("AI 学会点名", [
真实 Agent 的 Function Calling 机制：

+ 把工具清单（名字 + 参数说明）发给 AI
+ AI 判断"这个问题该用哪个工具"，返回一个结构化请求（如 `{"tool": "get_weather", "args": {"city": "北京"}}`）
+ 程序执行该函数，把结果回传给 AI
+ AI 结合工具结果生成最终回答

```python
# 示意：AI 返回的调用请求
request = {"tool": "get_weather", "args": {"city": "上海"}}

# 程序执行
tool = tools[request["tool"]]
result = tool(**request["args"])   # ** 把字典展开成关键字参数
print(f"工具结果：{result}")

# 把结果交回 AI 生成回答（示意）
final = f"根据查询，{result}"
print(final)
```

- `**dict`：把字典展开成 `函数(键=值)` 形式
])

=== 2.4 迷你智能体：规划 + 循环

#practice[
*操作*：写一个"会算数 + 会查天气"的迷你智能体。

```python
tools = {
    "add": lambda a, b: a + b,
    "get_weather": lambda city: f"{city}：晴，25℃",
}

while True:
    ask = input("你想做什么？（如：算 3+5 / 查北京天气 / quit）")
    if ask == "quit":
        break

    # 简单规划：根据关键词选工具
    if "算" in ask and "+" in ask:
        a, b = ask.split("+")[-1].split(" ")[-1], "?"  # 简化演示
        print(tools["add"](3, 5))
    elif "天气" in ask:
        city = ask.replace("查", "").replace("天气", "").strip()
        print(tools["get_weather"](city))
    else:
        print("我还没学会这个任务，请换个说法。")
```

*重点*：规划（if/elif 判断用哪个工具）→ 调用（执行函数）→ 反馈（打印结果）。这就是智能体的最小闭环。
]

#warning[
*`eval` 安全警告*：`eval()` 能执行任意代码，极不安全。本课仅用于教学演示，真实项目禁止对用户输入使用 `eval`——用 `int()`/`float()` 或专门解析。
]

== 三、实操练习（30分钟）

=== 3.1 练习一：扩展工具库

#practice[
*任务*：给迷你智能体加三个新工具。

+ `len_text(text)`：返回文本字数（复习 `len`）
+ `upper_text(text)`：转大写
+ `today()`：返回固定日期字符串

把新函数登记进 `tools` 字典，并加对应的 if 判断。
]

=== 3.2 练习二：用 AI 辅助设计工具

#practice[
+ 把需求发给 AI："帮我设计一个 Python 智能体，含 3 个工具函数：查单词、算 BMI、反转字符串，用字典管理，循环输入"
+ 运行 AI 生成的代码
+ 逐行读懂：哪个是定义？哪个是参数？哪个是返回值？
+ 给 `add` 加个"异常处理"：输入非数字时友好提示
]

== 四、课后作业（10分钟）

1. 完善迷你智能体：至少 4 个工具 + 循环问答 + 异常处理
2. 用 AI 辅助编写"BMI 计算器"工具（身高、体重 → BMI 值 → 评价），体会函数封装
3. 思考：如果工具清单有 100 个，`if/elif` 还合适吗？真实 Agent 怎么解决？

== 五、扩展阅读

- Agent 原理（LMCC 教研 MD）：见 `MD文档/人工智能Agent的基本原理与架构.md`
- 下一课预告：LV3-09 多 Agent 协作——让多个智能体分工合作
