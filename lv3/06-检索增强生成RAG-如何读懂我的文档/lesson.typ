#import "../../lmcc-theme.typ": *

#show: lmcc-theme.with(
  level: "驾驭AI（创造应用篇）",
  lesson: "06",
  title: "检索增强生成RAG-如何读懂我的文档",
  date: "2026年",
)

= 检索增强生成RAG-如何读懂我的文档

#objective[
- 理解 RAG（检索增强生成）的完整流程：文档 → 切分 → 向量化 → 检索 → 生成
- 掌握 Python 读写文件、字符串切分、列表操作
- 会用 Python 实现一个迷你版"文档问答"雏形
- 理解 Embedding（向量化）与相似度检索的直观含义
]

#warning[
*本节定位：让 AI"读懂你自己的文档"。* 大模型只学过公开数据，不知道你的资料。RAG 的思路：先把文档切块存入知识库，用户提问时检索相关片段，连同问题一起交给 AI。本节聚焦 Python 侧的数据准备能力——*文件读写、切分、遍历、函数封装*——这些都是 RAG 的"搬运工"。
]

== 〇、回顾（5分钟）

- LV3-05 扣子智能体：无代码自动化
- 提问："让 AI 回答'我们学校的校规是什么'，它答不出，因为没学过。怎么让它'现学'你的文档？"

== 一、导入（10分钟）

=== 1.1 大模型的局限

#key-concept("知识截止与幻觉", [
+ 大模型只"学过"训练数据截止前的内容
+ 你的私有文档（校规、教案、产品手册）它没见过
+ 硬问会答错甚至"一本正经地胡说"（幻觉）

*RAG 的解法*：不问"记忆"，改问"检索 + 阅读"——先查文档，再作答。
])

=== 1.2 RAG 四步流程

#practice[
*RAG 流水线*：

+ ① *切分*：把长文档切成小块（chunk）
+ ② *向量化*：每块转成数字向量（Embedding）
+ ③ *检索*：用户提问 → 也转向量 → 找最相似的小块
+ ④ *生成*：把"问题 + 检索到的文档块"一起交给大模型作答
]

今天先用 Python 完成①②③的"数据搬运"部分，④的调用上节已会。

== 二、核心内容（25分钟）

=== 2.1 Python 读写文档

#practice[
*操作*：读取一个文档，按段落切分。

```python
# 读取整个文档
with open("校规.txt", "r", encoding="utf-8") as f:
    text = f.read()
print(f"文档总长度：{len(text)} 字")

# 按段落切分（以空行分隔）
paragraphs = text.split("\n\n")
print(f"切分成 {len(paragraphs)} 段")
for i, p in enumerate(paragraphs):
    print(f"第 {i+1} 段：{p[:20]}...")   # 只显示前 20 字
```

- `open(..., "r")` 读、"w" 写
- `split("\n\n")` 按空行切分字符串 → 得到列表
- `enumerate` 同时拿到序号和内容
]

=== 2.2 字符串操作

#key-concept("字符串常用方法", [
```python
title = "  学校校规 2026 版  "

print(title.strip())      # 去首尾空格 → "学校校规 2026 版"
print(title.replace("校规", "守则"))  # 替换
print(title.lower())      # 转小写

# 拼接
full = title.strip() + "（试行）"
print(full)

# 判断包含
if "校规" in title:
    print("文档主题：校规")
```
])

=== 2.3 用函数封装 RAG 步骤

#key-concept("函数 = RAG 的零件", [
把每个步骤写成函数，后续可复用、可测试：

```python
def read_document(path):
    """读取文档，返回全文"""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def split_paragraphs(text):
    """按空行切分成段落列表"""
    return [p.strip() for p in text.split("\n\n") if p.strip()]

def search(keyword, paragraphs):
    """简单检索：返回含关键词的段落"""
    result = []
    for i, p in enumerate(paragraphs):
        if keyword in p:
            result.append((i, p))
    return result

# 使用
text = read_document("校规.txt")
paras = split_paragraphs(text)
hits = search("迟到", paras)
for idx, p in hits:
    print(f"第 {idx+1} 段命中：{p[:30]}...")
```

- *列表推导式* `[p.strip() for p in ...]`：一行生成新列表
- 函数返回 `(序号, 内容)` 元组，可打包在列表里
])

=== 2.4 Embedding 与相似度（直观理解）

#key-concept("向量 = 数字化的语义", [
机器不懂文字，只懂数字。Embedding 把文字变成一串数字（向量），语义相近的文字向量也相近：

```python
# 示意：两句话的"相似度"（0~1，越接近1越像）
similarity = 0.85
if similarity > 0.7:
    print("高度相关，可作答案素材")
```

真实做法：用 Embedding API 把每段文字转成向量，提问也转向量，算*余弦相似度*取最大者。今天先理解"用数字比较语义"的思想，下节用现成知识库工具落地。
])

== 三、实操练习（30分钟）

=== 3.1 练习一：文档问答小程序（简化版）

#practice[
*任务*：实现"关键词检索问答"。

+ 老师准备一篇文档（校规 / 课程说明 / 项目简介）
+ 用 `read_document` 读取、`split_paragraphs` 切分
+ 用户输入问题，程序提取关键词（可简化为"用户在问题里输入的关键词"）
+ 用 `search` 找到含关键词的段落并打印
]

=== 3.2 练习二：加上循环与异常

#practice[
+ 用 `while True` 支持连续提问，输入 `quit` 退出
+ 用 `try/except` 处理"文件不存在"
+ 挑战：把检索结果用 f-string 组装成"参考：……"，拼进给 AI 的提示词
]

== 四、课后作业（10分钟）

1. 用 AI 辅助把"关键词检索"升级为"多关键词"（任一命中即算）
2. 读一篇长文，统计它有多少段、每段平均多少字（复习 `len` 与循环）
3. 思考：关键词检索 vs 语义向量检索，各有什么优缺点？

== 五、扩展阅读

- RAG 通俗讲解（LMCC 教研 MD 文档）：见 `MD文档/高级RAG技术.md`
- 下一课预告：LV3-07 搭建个人知识库——用现成工具落地完整 RAG
