#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成素材总表（清洗后）"""
import os, json

BASE = os.path.dirname(os.path.abspath(__file__))

def listing(d):
    p = os.path.join(BASE, d)
    return sorted(f for f in os.listdir(p) if f.lower().endswith((".jpg", ".png", ".webp")))

rows = []
for d, label in [("orange", "橙子"), ("not_orange", "非橙子（难例）"), ("not_orange_easy", "非橙子（易例）")]:
    fs = listing(d)
    rows.append((d, label, len(fs)))
    print(f"{d:20s} {label:14s} {len(fs)} 张")

rej = os.path.join(BASE, "_reject_20260918")
n_rej = sum(len([f for f in files if f.lower().endswith(".jpg")])
            for _, _, files in os.walk(rej))
print(f"{'_reject_20260918':20s} {'剔除区':14s} {n_rej} 张")

with open(os.path.join(BASE, "统计.json"), "w", encoding="utf-8") as f:
    json.dump({d: {"label": l, "count": c} for d, l, c in rows}, f, ensure_ascii=False, indent=1)
