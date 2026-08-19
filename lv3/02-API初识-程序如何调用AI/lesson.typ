#import "../../lmcc-theme.typ": *

#show: lmcc-theme.with(
  level: "驾驭AI（创造应用篇）",
  lesson: "02",
  title: "API初识-程序如何调用AI",
  date: "2026年",
)

= API初识-程序如何调用AI

#objective[
- 理解 API 是什么、为什么程序通过 API 调用 AI
- 认识 API Key、请求（Request）与响应（Response）的概念
- 掌握 Python 开发环境与运行程序的基本方法
- 会用 Python 的 `print`、变量与 `requests` 发送第一个 HTTP 请求
]

#warning[
*本节定位：从"人用 AI"走向"程序用 AI"。* 前序课程里都是人打开网页跟 AI 对话，从本节开始，我们让*程序*去调用 AI。Python 是本系列编程课的通用语言——LMCC 后续 API 实战、RAG、智能体，全部用 Python 实现。今天先把环境搭好、把"程序如何发请求"这件事跑通。
]

== 〇、回顾（5分钟）

- LV3-01 提示工程：人怎么把指令说清楚
- 提问："如果让一个程序（而非人）去问 AI，程序需要准备什么？"

== 一、导入（10分钟）

=== 1.1 从聊天框到程序

#key-concept("API = 程序之间的对话接口", [
*API*（Application Programming Interface，应用程序编程接口）= 程序之间互相"说话"的约定接口。

人用 AI：打开网页 → 输入提示词 → 看回答。\
程序用 AI：*代码* → 发 HTTP 请求 → 收 JSON 响应。

本质相同：把"提示词"交给 AI，拿回"回答"。区别只在*由谁发、用什么发*。
])

=== 1.2 为什么用 Python

- Python 语法简洁、生态丰富，AI 领域第一语言
- 大模型官方 SDK 与示例几乎全是 Python
- 后续 RAG、智能体、微调实操全走 Python

== 二、核心内容（25分钟）

=== 2.1 Python 环境与第一次运行

#practice[
*操作*：

+ 安装 Python（官网 https://www.python.org 下载，勾选 *Add to PATH*）
+ 命令行输入 `python --version` 验证
+ 新建文件 `hello.py`，写入：
]

```python
print("Hello, AI!")
```

#practice[
*运行*：命令行 `python hello.py`，屏幕输出 `Hello, AI!`。

+ `print()`：输出——把内容打印到屏幕
+ 字符串：用引号 `"..."` 或 `'...'` 括起来的内容
+ 这就是 Python 的 *IPO 模型* 中的 O（Output，输出）
]

=== 2.2 变量与输入输出

#key-concept("变量 = 给数据起名字", [
变量像贴了标签的盒子：先把数据装进去，再通过名字取用。

```python
# 输入（Input）
name = input("你叫什么名字？")

# 处理（Process）
message = "你好，" + name

# 输出（Output）
print(message)
```
])

- `input()`：从键盘读入，返回*字符串*
- `=` 是*赋值*（把右边数据装进左边变量），不是数学等号
- 变量命名：字母、数字、下划线，不能数字开头，不用 Python 关键字

=== 2.3 什么是 HTTP 请求

#key-concept("请求 → 响应", [
程序调用 AI 的过程，本质是一次 *HTTP 请求（Request）* 与 *HTTP 响应（Response）*：

+ *请求*：程序向 AI 服务器发送指令（含你的提示词）
+ *响应*：服务器处理后返回结果（通常是 JSON 格式）

就像去餐厅点餐：你报菜名（请求），厨房做好端上来（响应）。
])

=== 2.4 requests 库：发送第一个请求

`requests` 是 Python 最常用的 HTTP 请求库。安装：

```bash
pip install requests
```

#practice[
*操作*：发送一个请求到公开 API，看返回什么。

```python
import requests

# 请求：向服务器要数据
resp = requests.get("https://httpbin.org/get")

# 响应：服务器返回的结果
print(resp.status_code)   # 状态码，200 表示成功
print(resp.text)          # 响应内容
```

*观察*：`resp.status_code` 是 *变量*；`resp.text` 是服务器返回的文本。程序"调用 API"就是这么简单——发请求、读响应。
]

#warning[
*网络问题兜底*：若教室网络受限，可换用本地演示服务器（老师提前在局域网内搭好一个模拟 API），或使用离线录屏演示。核心是让学生理解"发请求、收响应"这一模式，而非依赖具体站点。
]

== 三、实操练习（30分钟）

=== 3.1 练习一：Python 快速上手

#practice[
+ 新建 `first.py`，用 `input` 问姓名，用 `print` 打印"你好，XX，欢迎来到 AI 编程"
+ 运行、改错、再运行——熟悉"改代码 → 跑一遍 → 看结果"的循环
]

=== 3.2 练习二：第一次 API 调用

#practice[
+ 用 `requests.get` 请求 `https://httpbin.org/get`
+ 打印状态码与响应内容
+ 观察：返回值里有哪些字段？哪个字段装着服务器告诉你的话？
]

#key-concept("小结", [
今天把三件事跑通：*Python 能运行*、*变量能存数据*、*程序能发请求收响应*。这三件就是"程序用 AI"的骨架。下节课我们把请求真正发到大模型，让它回答问题。
])

== 四、课后作业（10分钟）

1. 用 `print` 打印三行自我介绍（姓名、爱好、想用 AI 做什么）
2. 用 `input` 接收年龄并打印
3. 把 `requests.get` 请求换成任一公开 API（如天气、笑话），打印返回内容

== 五、扩展阅读

- Python 官方教程：https://docs.python.org/zh-cn/3/tutorial/
- requests 文档：https://requests.readthedocs.io/
- 下一课预告：LV3-03 第一次 API 实战——让 AI 真正回答问题
