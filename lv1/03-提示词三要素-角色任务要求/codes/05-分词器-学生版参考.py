#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分词器（学生版参考）：词表最长匹配。

学生让 AI 写分词器，常见的产出就是这一类：有一张词表，
每个位置先试最长的词，试不到就切一个字。
老师用它做对照，也用它兜底。
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE = os.path.join(HERE, "词表-样例.txt")

BUILTIN = ["模拟", "人生", "程序", "模型", "分词", "天气", "天天", "真好", "今天", "学校", "教室", "黑板上"]


def load_words(path):
    if not os.path.exists(path):
        return BUILTIN
    with open(path, encoding="utf-8") as f:
        words = [w.strip() for w in f if w.strip()]
    return words or BUILTIN


def tokenize(text, words):
    table = set(words)
    longest = max(len(w) for w in table)
    out, i = [], 0
    while i < len(text):
        ch = text[i]
        # 字母数字连成一串，整块算
        if ch.isascii() and (ch.isalnum() or ch in "_-."):
            j = i
            while j < len(text) and text[j].isascii() and (text[j].isalnum() or text[j] in "_-."):
                j += 1
            out.append(text[i:j])
            i = j
            continue
        # 从最长的试起
        hit = None
        for size in range(min(longest, len(text) - i), 1, -1):
            piece = text[i:i + size]
            if piece in table:
                hit = piece
                break
        if hit:
            out.append(hit)
            i += len(hit)
        else:
            out.append(ch)
            i += 1
    return out


def main():
    words = load_words(TABLE)
    print(f"词表里有 {len(words)} 个词")
    text = input("输入一句话：").strip() or "帮我用 Python 写个模拟人生的程序"
    pieces = tokenize(text, words)
    for n, p in enumerate(pieces, 1):
        print(f"{n:>2}. {p}")
    print(f"一共 {len(pieces)} 块")


if __name__ == "__main__":
    main()
