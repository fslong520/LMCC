#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""分词机：自己切一句，再跟模型的切法比一比。

用法：
    python3 04-分词机.py           打开窗口
    python3 04-分词机.py --check   不开窗口，打印切法（自测用）
"""
import sys

FONT = ("Noto Sans CJK SC", 26)
FONT_SM = ("Noto Sans CJK SC", 13)
BG = "#ffffff"
INK = "#1f2937"
BLUE = "#1e3a8a"
CUT = "#dc2626"
BOX = "#bfdbfe"
HALF = "#e5e7eb"

SAMPLES = [
    "今天天气真好，我要去学校",
    "帮我用 Python 写个模拟人生的程序",
    "大模型一次只猜下一个词",
]

# ---------- 切法 ----------

def load_model_splitter():
    """返回 (名字, 切分函数)；没有词表就退回近似切法。"""
    try:
        import tiktoken
        for name in ("o200k_base", "cl100k_base"):
            try:
                enc = tiktoken.get_encoding(name)
            except Exception:
                continue
            def split(s, enc=enc):
                out = []
                for tid in enc.encode(s):
                    raw = enc.decode_single_token_bytes(tid)
                    try:
                        out.append(raw.decode("utf-8"))
                    except UnicodeDecodeError:
                        out.append(None)      # 半个字：这个字被切成两半
                return out
            return name, split
    except Exception:
        pass
    return "近似切法", rough_split


def rough_split(s):
    """没有词表时的兜底：中文一字一块，连续的字母数字一块，标点一块。"""
    out, buf = [], ""
    for ch in s:
        if ch.isascii() and (ch.isalnum() or ch in "_-."):
            buf += ch
        else:
            if buf:
                out.append(buf)
                buf = ""
            out.append(ch)
    if buf:
        out.append(buf)
    return out


def pieces_by_cuts(chars, cuts):
    """按切缝位置把字分成块。cuts 里放的是切缝左边的字号。"""
    out, cur = [], ""
    for i, ch in enumerate(chars):
        cur += ch
        if i in cuts:
            out.append(cur)
            cur = ""
    if cur:
        out.append(cur)
    return out


# ---------- 窗口 ----------

def run_gui():
    import tkinter as tk
    from tkinter import font as tkfont

    model_name, model_split = load_model_splitter()

    root = tk.Tk()
    root.title("分词机  LMCC 第 03 课")
    root.geometry("1020x700")
    root.configure(bg=BG)

    big = tkfont.Font(family=FONT[0], size=FONT[1])
    small = tkfont.Font(family=FONT[0], size=FONT_SM[1])

    state = {"text": SAMPLES[0], "cuts": set(), "model": [], "pos": []}

    top = tk.Frame(root, bg=BG)
    top.pack(fill="x", padx=24, pady=(18, 6))

    tk.Label(top, text="写一句话，点字与字之间的缝，就切一刀：",
             bg=BG, fg=INK, font=small).pack(anchor="w")
    entry = tk.Entry(top, font=small, width=54)
    entry.insert(0, state["text"])
    entry.pack(side="left", pady=6)

    def use_text():
        state["text"] = entry.get() or " "
        state["cuts"] = set()
        state["model"] = []
        redraw()

    tk.Button(top, text="用它", font=small, command=use_text).pack(side="left", padx=6)

    ex = tk.Frame(root, bg=BG)
    ex.pack(fill="x", padx=24)
    tk.Label(ex, text="例句：", bg=BG, fg=INK, font=small).pack(side="left")
    for s in SAMPLES:
        b = tk.Button(ex, text=s, font=small,
                      command=lambda s=s: (entry.delete(0, "end"), entry.insert(0, s), use_text()))
        b.pack(side="left", padx=4)

    canvas = tk.Canvas(root, bg=BG, highlightthickness=0, height=150)
    canvas.pack(fill="x", padx=24, pady=(14, 0))

    label_you = tk.Label(root, text="", bg=BG, fg=BLUE, font=small, justify="left", anchor="w")
    label_you.pack(fill="x", padx=24, pady=(8, 0))

    btn = tk.Frame(root, bg=BG)
    btn.pack(fill="x", padx=24, pady=8)
    tk.Button(btn, text="看模型的切法", font=small,
              command=lambda: show_model()).pack(side="left")
    tk.Button(btn, text="清掉我的刀", font=small,
              command=lambda: (state.__setitem__("cuts", set()), redraw())).pack(side="left", padx=8)
    tk.Label(btn, text=f"模型词表：{model_name}", bg=BG, fg="#6b7280", font=small).pack(side="right")

    canvas2 = tk.Canvas(root, bg=BG, highlightthickness=0, height=130)
    canvas2.pack(fill="x", padx=24)
    label_model = tk.Label(root, text="", bg=BG, fg="#6b7280", font=small, justify="left", anchor="w")
    label_model.pack(fill="x", padx=24, pady=(6, 0))

    geo = {}

    def layout(chars, cv):
        """一行排开，返回每个字的 (x, 宽)。窗口窄就换行。"""
        maxw = cv.winfo_width() or 960
        xs, x, y, line_h = [], 12, 40, 56
        for ch in chars:
            w = big.measure(ch) + 14
            if x + w > maxw - 12 and x > 12:
                x, y = 12, y + line_h
            xs.append((x, w, y))
            x += w
        geo["height"] = y + line_h
        cv.configure(height=geo["height"])
        return xs

    def redraw():
        cv = canvas
        cv.delete("all")
        chars = list(state["text"])
        xs = layout(chars, cv)
        state["pos"] = xs
        for i, (ch, (x, w, y)) in enumerate(zip(chars, xs)):
            cv.create_text(x + w / 2, y, text=ch, font=big, fill=INK)
            if i < len(chars) - 1:
                cv.create_line(x + w, y - 17, x + w, y + 17, fill="#d1d5db", width=1)
            if i in state["cuts"]:
                cv.create_line(x + w, y - 22, x + w, y + 22, fill=CUT, width=3)
                cv.create_text(x + w, y - 34, text="✂", fill=CUT, font=FONT_SM)
        n = len(pieces_by_cuts(chars, state["cuts"]))
        label_you.config(text=f"你切了 {n} 块：" + " / ".join(pieces_by_cuts(chars, state["cuts"])))
        draw_model()

    def on_click(event):
        pos = state["pos"]
        best = None
        for i in range(len(pos) - 1):
            x_next, _, y = pos[i + 1]
            if abs(event.y - y) <= 28:
                d = abs(event.x - x_next)
                if best is None or d < best[0]:
                    best = (d, i)
        if best and best[0] <= 22:
            toggle(best[1])

    canvas.bind("<Button-1>", on_click)

    def toggle(i):
        if i == len(state["text"]) - 1:
            return
        state["cuts"] ^= {i}
        redraw()

    def show_model():
        state["model"] = model_split(state["text"])
        draw_model()

    def draw_model():
        cv = canvas2
        cv.delete("all")
        chars = list(state["text"])
        xs = layout(chars, cv)
        tops = {}
        model = state["model"]
        if not model:
            label_model.config(text="点「看模型的切法」，看看模型把这些字切成了几块。")
            return
        # 把模型块映射回字符位置
        idx = 0
        groups = []
        for piece in model:
            if piece is None:
                groups.append((idx, idx, True))      # 半个字
                idx += 1
            else:
                groups.append((idx, idx + len(piece) - 1, False))
                idx += len(piece)
        for start, end, half in groups:
            x0 = xs[start][0]
            x1 = xs[min(end, len(chars) - 1)][0] + xs[min(end, len(chars) - 1)][1]
            y = xs[start][2]
            cv.create_rectangle(x0 + 1, y - 24, x1 - 1, y + 24,
                                outline="#1d4ed8", width=2,
                                fill=HALF if half else BOX)
            if half:
                cv.create_text((x0 + x1) / 2, y + 40, text="半个字", fill="#6b7280", font=FONT_SM)
        for ch, (x, w, y) in zip(chars, xs):
            cv.create_text(x + w / 2, y, text=ch, font=big, fill=INK)
        halves = sum(1 for p in model if p is None)
        extra = f"，其中 {halves} 块是半个字" if halves else ""
        label_model.config(text=f"模型切了 {len(model)} 块{extra}：" +
                                " / ".join("□" if p is None else p for p in model))

    root.update()
    redraw()
    root.mainloop()


def check():
    name, split = load_model_splitter()
    for s in SAMPLES + ["", "a", "hello world"]:
        m = split(s)
        print(f"[{name}] {s!r} -> {len(m)} 块 -> {['□' if p is None else p for p in m]}")
    chars = list("帮我写程序")
    print("手工切：", pieces_by_cuts(chars, {1, 2}), "共", len(pieces_by_cuts(chars, {1, 2})), "块")
    print("不切：", pieces_by_cuts(chars, set()))
    print("OK")


if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    else:
        run_gui()
