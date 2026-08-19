#import "../../lmcc-theme.typ": *

#show: lmcc-theme.with(
  level: "驾驭AI（创造应用篇）",
  lesson: "15",
  title: "综合项目-开发与调试（一）",
  date: "2026年",
)

= 综合项目-开发与调试（一）

#objective[
- 把前面所学（变量、分支、循环、函数、列表、字典、异常、API）整合进一个完整项目
- 掌握 Python 项目组织：模块拆分、`if __name__` 入口、参数传递
- 掌握调试方法：`print` 定位、读懂报错栈、分而治之
- 学会用 AI 结对完成项目开发与排错
]

#warning[
*本节定位：从"学零件"到"装整机"。* 前面各课学了 Python 的各个知识点，本节把它们组合成一个完整项目（如"AI 学习助手"：调 API 回答 + 关键词检索本地资料 + 保存记录）。重点不是新语法，而是*工程方法*：怎么组织代码、怎么调试、怎么和 AI 协作开发。
]

== 〇、回顾（5分钟）

- LV3-14 综合项目规划：选题、方案、任务拆解
- 提问："你的项目拆成了哪几个功能模块？每个模块用到了哪个 Python 知识点？"

== 一、导入（10分钟）

=== 1.1 项目的三层结构

#key-concept("输入层 → 逻辑层 → 输出层", [
一个完整项目通常分三层：

+ *输入层*：接收用户指令（`input`、文件、API 参数）
+ *逻辑层*：核心处理（分支、循环、函数、调 API）
+ *输出层*：呈现结果（`print`、写文件）

用函数把每一层封装好，代码才清晰、可复用、可测试。
])

=== 1.2 模块拆分：一个文件一个职责

#practice[
*推荐结构*：

```text
my_ai_app/
├── main.py        # 入口：组织流程
├── ai_client.py   # 调大模型 API
├── search.py      # 本地资料检索（RAG 简化版）
└── records.py     # 保存/读取记录
```
]

== 二、核心内容（25分钟）

=== 2.1 函数间的参数传递

#key-concept("数据如何流动", [
模块之间靠*函数参数*和*返回值*传递数据：

```python
# ai_client.py
def ask_ai(question):
    """调大模型，返回回答文本"""
    # ……requests 调 API（LV3-03 内容）
    return answer

# main.py
from ai_client import ask_ai

question = input("你的问题：")
answer = ask_ai(question)   # 传入参数，拿到返回值
print(answer)
```

- `from 模块 import 函数`：导入别的文件里的函数
- 函数就是模块之间的"接口"
])

=== 2.2 程序入口：`if __name__ == "__main__"`

#key-concept("主入口写法", [
```python
# main.py
def main():
    # 项目主流程
    print("AI 学习助手启动")

if __name__ == "__main__":
    main()
```

- 直接运行时 `__name__ == "__main__"`，执行 `main()`
- 被别的文件导入时 `__name__` 是模块名，不执行——避免"导入即运行"
])

=== 2.3 调试方法：分而治之

#practice[
*调试四步*：

+ ① *读报错*：看最后一行 `Traceback`，找"文件名:行号 + 错误类型"
+ ② *打印定位*：在可疑处加 `print("到这了", 变量)`，看数据到哪一步不对
+ ③ *缩小范围*：先测函数内部（单独调用），再测模块间，最后测整体
+ ④ *问 AI*：把报错信息 + 期望行为原样发给 AI

*常见错误*：`NameError` 变量未定义、`TypeError` 类型不对、`KeyError` 键不存在、`IndexError` 下标越界、`IndentationError` 缩进错。
]

=== 2.4 异常处理：让程序有"急救包"

#key-concept("try/except/finally", [
```python
try:
    answer = ask_ai(question)
except requests.exceptions.Timeout:
    print("AI 响应超时，请重试")
except Exception as e:
    print(f"出错了：{e}")
else:
    print(f"AI 回答：{answer}")
```

- `try`：尝试执行
- `except`：出错后的处理（可写多个，捕获不同错误）
- `else`：没出错时执行
- 分级捕获：先具体（`Timeout`）后通用（`Exception`）
])

== 三、实操练习（30分钟）

=== 3.1 练习一：组装你的项目

#practice[
*任务*：把"AI 学习助手"拆成函数并组装。

+ 写 `ask_ai(question)`（LV3-03 的 API 调用，封装成函数）
+ 写 `search_local(keyword)`（LV3-06 的关键词检索，封装成函数）
+ 写 `save_record(question, answer)`（写文件）
+ 在 `main()` 里组织流程：输入 → 先查本地 → 查不到再问 AI → 保存
]

=== 3.2 练习二：调试实战

#practice[
+ 老师提供"带 bug 的项目"（缩进错、函数没 return、KeyError、类型没转换）
+ 逐个修复，每修一个记录"错误类型 → 原因 → 修法"
+ 用 `print` 在关键位置打点，观察数据流
+ 挑战：把 `save_record` 加上 `try/except`，磁盘满/权限不足时不崩
]

== 四、课后作业（10分钟）

1. 完成"AI 学习助手"全部功能（本地检索 + AI 回答 + 记录保存）
2. 用 AI 辅助给项目加一个新功能（如：历史记录查询、多轮对话记忆）
3. 给项目写一个 `README`：功能说明 + 运行方法 + 依赖库

== 五、扩展阅读

- 调试技巧：https://docs.python.org/zh-cn/3/tutorial/errors.html
- 下一课预告：LV3-16 综合项目-打磨与评测（二）——让项目更稳、更优
