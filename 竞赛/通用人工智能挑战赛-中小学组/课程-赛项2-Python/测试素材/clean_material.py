#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""测试素材清洗（2026-09-18）
依据：逐张视觉质检（dim image read）+ 感知哈希去重 + 人工目视复核。
三分流：
  A. orange/ 里的"柑橘类近物"（青柠/柚子/丑橘/橘瓣）→ 移入 not_orange/ 当难例
  B. orange/ 里的"不可用"（黑白照/人偶/人物/重复）→ 移入 _reject_20260918/
  C. not_orange*/ 里的"其实是橙子"或"非照片" → 移入 _reject_20260918/
  D. 新增候选的好图 → 并入 not_orange/
"""
import os, shutil, json

BASE = os.path.dirname(os.path.abspath(__file__))
REJ = os.path.join(BASE, "_reject_20260918")

# A. 橙子目录里的柑橘类近物 → 转 not_orange（当难例）
ORANGE_TO_HARD = {
    "img_26.jpg": "青柠/柠檬堆",
    "img_31.jpg": "柚子切面（白皮极厚）",
    "img_36.jpg": "丑橘/椪柑（表皮疙瘩）",
    "img_37.jpg": "橘子瓣",
    "orange_13.jpg": "柑橘+柠檬青柠混合切片",
    "orange_37.jpg": "葡萄柚/柚子切片",
    "wm_orange_new_004.jpg": "青柠（绿皮）",
    "wm_orange_new_024.jpg": "黄绿色柑橘",
    "wm_orange_new_026.jpg": "黄绿色柑橘带叶",
}

# B. 橙子目录里的不可用 → reject
ORANGE_REJECT = {
    "wm_orange_new_002.jpg": "黑白老照片",
    "wm_orange_new_029.jpg": "橙子皮拼成的人偶",
    "wm_orange_new_032.jpg": "人物持篮（非橙子主体）",
    "orange_0.jpg": "与 wm_orange_new_040 完全重复",
}

# C. 非橙子目录里其实是橙子 / 非照片 → reject
NOTOR_REJECT = {
    "img_28.jpg": "树上的橙子",
    "img_31.jpg": "结满橙子的果树",
    "not_0.jpg": "橙子堆（且与 wm_notor_new_042 重复）",
    "not_1.jpg": "树上的橙子",
    "not_20.jpg": "结满橙子的树",
    "not_21.jpg": "完整橙子与切面",
    "wm_notor_new_004.jpg": "橙子堆",
    "wm_notor_new_007.jpg": "手绘版画（非照片）",
    "wm_notor_new_009.jpg": "橙子堆",
    "wm_notor_new_013.jpg": "人物与橙子堆",
    "wm_notor_new_014.jpg": "橙子/橘子切面（太像橙）",
    "wm_notor_new_021.jpg": "苹果香蕉橙子混合（含橙子）",
    "wm_notor_new_027.jpg": "货架上的橙子/柑橘堆",
    "wm_notor_new_032.jpg": "挂在树上的橙子",
    "wm_notor_new_034.jpg": "部分剥皮的橙子",
    "wm_notor_new_035.jpg": "结满果实的橙子树",
    "wm_notor_new_039.jpg": "发霉水果（非典型负样本）",
    "wm_notor_new_042.jpg": "橙子堆",
    "wm_notor_new_043.jpg": "树上的橙子",
    "wm_notor_new_044.jpg": "挂满橙子的树",
    "img_37.jpg": "黑白照片（南瓜田）",
}

# 易例目录：非照片与无语义图
EASY_REJECT = {
    "img_1.jpg": "模糊抽象图（无实体语义）",
    "img_5.jpg": "古籍手稿",
    "img_6.jpg": "解剖手稿素描",
    "img_7.jpg": "书页黑白插画",
    "img_37.jpg": "风景画（非照片）",
    "img_39.jpg": "风景画（非照片）",
    "img_36.jpg": "与 img_35 重复（灰咖啡杯）",
}

# D. 新增候选：可用 → not_orange；不可用 → reject
NEW_KEEP = {
    "tangerine_new": ["tangerine_new_000", "tangerine_new_002", "tangerine_new_003",
                      "tangerine_new_010", "tangerine_new_014", "tangerine_new_017",
                      "tangerine_new_018", "tangerine_new_019", "tangerine_new_022",
                      "tangerine_new_024", "tangerine_new_025", "tangerine_new_028"],
    "pomelo_new": ["pomelo_new_001", "pomelo_new_002", "pomelo_new_004",
                   "pomelo_new_010", "pomelo_new_012", "pomelo_new_014",
                   "pomelo_new_015", "pomelo_new_016", "pomelo_new_017",
                   "pomelo_new_018", "pomelo_new_019", "pomelo_new_021",
                   "pomelo_new_022", "pomelo_new_023", "pomelo_new_024",
                   "pomelo_new_026", "pomelo_new_027", "pomelo_new_028",
                   "pomelo_new_029"],
}
NEW_REJECT = {
    "tangerine_new": {
        "tangerine_new_001": "蔬菜沙拉", "tangerine_new_004": "一箱带叶橙子（是橙子）",
        "tangerine_new_005": "两个橙子（是橙子）", "tangerine_new_006": "手托橙子（是橙子）",
        "tangerine_new_007": "手绘插画", "tangerine_new_008": "风景（无水果主体）",
        "tangerine_new_009": "橙子堆（是橙子）", "tangerine_new_011": "树上橘子（存疑）",
        "tangerine_new_012": "石榴（非柑橘）", "tangerine_new_013": "人物与橙子堆",
        "tangerine_new_015": "果园风景", "tangerine_new_016": "混合水果拼盘",
        "tangerine_new_020": "混合水果", "tangerine_new_021": "橙子苹果香蕉混合",
        "tangerine_new_023": "青黄柑橘（存疑）", "tangerine_new_026": "橙子堆（是橙子）",
        "tangerine_new_027": "成堆橙子（是橙子）", "tangerine_new_029": "坚果拼盘",
    },
    "pomelo_new": {
        "pomelo_new_000": "橙子表皮特写（是橙子）", "pomelo_new_003": "世界地图（非水果）",
        "pomelo_new_005": "合影人物", "pomelo_new_006": "人物（非水果主体）",
        "pomelo_new_007": "人物与柚子", "pomelo_new_008": "人物与柚子",
        "pomelo_new_009": "抱水果的男子", "pomelo_new_011": "人拿水果",
        "pomelo_new_013": "草地残骸", "pomelo_new_020": "青芒果（非柑橘）",
        "pomelo_new_025": "标志牌模型",
    },
}

def move(src, dst, note, log):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst):
        log.append({"file": os.path.basename(src), "action": "跳过(已存在)", "note": note})
        return
    shutil.move(src, dst)
    log.append({"file": os.path.basename(src), "to": dst.replace(BASE + "/", ""), "note": note})

def main():
    log = []
    # A. orange → not_orange（难例）
    for f, note in ORANGE_TO_HARD.items():
        s = os.path.join(BASE, "orange", f)
        if os.path.exists(s):
            move(s, os.path.join(BASE, "not_orange", "hard_" + f), "转难例：" + note, log)
    # B. orange → reject
    for f, note in ORANGE_REJECT.items():
        s = os.path.join(BASE, "orange", f)
        if os.path.exists(s):
            move(s, os.path.join(REJ, "orange", f), note, log)
    # C. not_orange / not_orange_easy → reject
    for f, note in NOTOR_REJECT.items():
        s = os.path.join(BASE, "not_orange", f)
        if os.path.exists(s):
            move(s, os.path.join(REJ, "not_orange", f), note, log)
    for f, note in EASY_REJECT.items():
        s = os.path.join(BASE, "not_orange_easy", f)
        if os.path.exists(s):
            move(s, os.path.join(REJ, "not_orange_easy", f), note, log)
    # D. 新增候选
    for grp, files in NEW_KEEP.items():
        for base in files:
            s = os.path.join(BASE, "_新增候选", grp, base + ".jpg")
            if os.path.exists(s):
                prefix = "tg_" if grp.startswith("tangerine") else "pm_"
                move(s, os.path.join(BASE, "not_orange", prefix + base.split("_")[-1] + ".jpg"),
                     "新增难例：" + grp, log)
    for grp, items in NEW_REJECT.items():
        for base, note in items.items():
            s = os.path.join(BASE, "_新增候选", grp, base + ".jpg")
            if os.path.exists(s):
                move(s, os.path.join(REJ, grp, base + ".jpg"), note, log)
    with open(os.path.join(REJ, "cleaning_log.json"), "w", encoding="utf-8") as fh:
        json.dump(log, fh, ensure_ascii=False, indent=1)
    print(f"共处理 {len(log)} 项")
    for d in ["orange", "not_orange", "not_orange_easy"]:
        p = os.path.join(BASE, d)
        n = len([f for f in os.listdir(p) if f.lower().endswith(".jpg")])
        print(f"  {d}: {n} 张")

if __name__ == "__main__":
    main()
