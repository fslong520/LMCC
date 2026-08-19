#import "../../lmcc-theme.typ": *

#show: lmcc-theme.with(
  level: "驾驭AI（创造应用篇）",
  lesson: "03",
  title: "第一次API实战-我的AI小应用",
  date: "2026年",
)

= 第一次API实战-我的AI小应用

#objective[
- 理解字典（dict）与 JSON 的关系，能读取 API 返回的数据
- 掌握 f-string 格式化输出，让程序"说人话"
- 掌握 `try/except` 异常处理，让程序在出错时不崩溃
- 独立完成"我的 AI 小应用"：调用大模型 API，实现问答
]

#warning[
*本节定位：第一次让程序真正用上 AI。* 上节跑通了"发请求、收响应"，本节把它升级为"向大模型发请求、拿回答"。核心是三个 Python 知识点——*字典、f-string、异常*——它们是读懂 API 返回、写出可用程序的关键。API Key 由老师统一准备，务必保密不外传。
]

== 〇、回顾（5分钟）

- LV3-02：`requests.get` 发请求、读 `resp.text`
- 提问："服务器返回的一长串文本，程序要怎么从里面挖出 AI 的答案？"

== 一、导入（10分钟）

=== 1.1 从"文本"到"数据"

服务器返回的不是一行普通文字，而是 *JSON*——一种"键值对"结构的数据格式。程序要读懂它，先要懂 *字典*。

#key-concept("字典 dict = 键值对盒子", [
字典用花括号 `{}`，里面装"键 : 值"对，用键取对应的值：

```python
info = {
    "name": "AI",
    "age": 3,
    "skills": ["聊天", "写代码", "画画"]
}

print(info["name"])     # 输出：AI
print(info["skills"])   # 输出：['聊天', '写代码', '画画']
```

- 键（key）是名字，值（value）是内容
- 用 `字典[键]` 取值
- JSON 的格式和 Python 字典几乎一样——这就是程序能读懂 API 返回的原因
])

=== 1.2 项目目标

做出"我的 AI 小应用"：命令行里输入问题，程序调用大模型 API，把 AI 的回答打印出来。

== 二、核心内容（25分钟）

=== 2.1 读取 API 返回的 JSON

#practice[
*操作*：请求一个返回 JSON 的 API，把它解析成 Python 字典。

```python
import requests

resp = requests.get("https://httpbin.org/json")
data = resp.json()        # 把 JSON 文本转成 Python 字典
print(data)               # 打印整个字典
```

`resp.json()`：把服务器返回的 JSON *文本* 变成 Python *字典*，就能用 `data["键"]` 取值了。
]

=== 2.2 f-string：把变量装进字符串

#key-concept("f-string 格式化", [
在字符串前加 `f`，用花括号 `{}` 把变量嵌进去：

```python
name = "小明"
print(f"你好，{name}！")   # 输出：你好，小明！
```

比 `"你好，" + name` 更清晰，是 Python 中最常用的输出方式。
])

=== 2.3 调用大模型 API（完整示例）

#practice[
*操作*：填入老师发的 API Key，运行下面的"AI 问答程序"。

```python
import requests

API_KEY = "sk-你的密钥"
url = "https://api.example.com/v1/chat/completions"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

question = input("你想问 AI 什么？")

payload = {
    "model": "gpt-4o-mini",
    "messages": [
        {"role": "user", "content": question}
    ]
}

resp = requests.post(url, headers=headers, json=payload)
data = resp.json()

answer = data["choices"][0]["message"]["content"]
print(f"AI 说：{answer}")
```

*拆解*：

+ `headers`：请求头，携带 API Key 与内容类型（一个字典）
+ `payload`：请求体，告诉 AI"你是谁、要问什么"（嵌套字典 + 列表）
+ `data["choices"][0]["message"]["content"]`：从返回字典逐层取值，挖出 AI 的回答
]

#warning[
*API 地址与模型名以老师提供的为准*，不同平台字段略有差异。若返回报错，先打印 `data` 看完整内容，再定位取值的键。
]

=== 2.4 异常处理：程序不崩溃

#key-concept("try/except 兜底", [
网络不稳、密钥写错、格式不对……程序随时可能出错。用 `try/except` 把可能出错的代码"包起来"：

```python
try:
    resp = requests.post(url, headers=headers, json=payload, timeout=30)
    data = resp.json()
    print(f"AI 说：{data['choices'][0]['message']['content']}")
except Exception as e:
    print(f"出错了：{e}")
```

- `try` 里放"可能出错"的代码
- `except` 里放"出错后怎么办"
- 没有它，程序一遇到网络问题就崩；有了它，程序友好地告诉你哪里不对
])

== 三、实操练习（30分钟）

=== 3.1 练习一：改造输出

#practice[
+ 把 AI 的回答用 f-string 组装成完整句子，如"你问的是：XX；AI 的回答是：XX"
+ 让程序支持连续提问：`while` 循环 + 输入 `quit` 退出
]

=== 3.2 练习二：加上异常保护

#practice[
+ 故意把 API Key 写错，运行程序，观察报错
+ 用 `try/except` 包住请求，让程序不崩溃、给出友好提示
+ 挑战：把"网络超时"单独用 `except requests.exceptions.Timeout` 捕获
]

== 四、课后作业（10分钟）

1. 完成"AI 小应用"：支持循环问答 + 异常处理
2. 尝试把 AI 的回答保存到文件（`with open(...)` + `write`）
3. 思考：如果返回的 JSON 结构变了，程序哪里会报错？如何让程序更健壮？

== 五、扩展阅读

- 大模型 API 官方文档（以老师提供平台为准）
- JSON 入门：https://www.json.org/json-zh.html
- 下一课预告：LV3-04 AI编程入门——自己动手写更多 Python 代码
