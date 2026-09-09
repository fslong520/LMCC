# -*- coding: utf-8 -*-
"""环境体检：教师开课前 1 分钟跑一遍，逐项打印 [OK]/[缺]"""
import importlib, shutil, subprocess, sys, os

print("Python 版本：", sys.version.split()[0])
ok = True

# 1. 版本 >= 3.10
v = sys.version_info
print(f"[{'OK' if v >= (3, 10) else '缺'}] Python 版本 >= 3.10 （当前 {v.major}.{v.minor}）")
ok &= v >= (3, 10)

# 2. 三方库
for mod, from_ver in [("PIL", "第2讲起"), ("numpy", "第6讲"), ("sklearn", "第6讲")]:
    try:
        m = importlib.import_module(mod)
        print(f"[OK] {mod} 已安装（版本 {getattr(m, '__version__', '?')}）")
    except ImportError:
        if mod == "PIL":
            print(f"[缺] pillow 未安装 —— 第{from_ver}起需要，先运行：")
            print("     python -m pip install pillow numpy scikit-learn")
            ok = False
        else:
            print(f"[可装] {mod} 未安装 —— 仅第6讲需要（1-5讲不受影响）")

# 3. 素材目录
base = os.path.dirname(os.path.abspath(__file__))
sucai = os.path.join(base, "测试素材")
for d, n in [("orange", 40), ("not_orange", 40), ("not_orange_easy", 40)]:
    p = os.path.join(sucai, d)
    if os.path.isdir(p):
        cnt = len([f for f in os.listdir(p) if f.lower().endswith((".jpg", ".png", ".webp"))])
        print(f"[{'OK' if cnt >= n else '少'}] 测试素材/{d}：{cnt} 张")
    else:
        print(f"[缺] 测试素材/{d} 目录不存在——请确认整个课程文件夹完整拷贝")
        ok = False

print("\n结论：" + ("环境就绪，可以开课。" if ok else "按上面提示补齐后再开课（仅第6讲依赖除外）。"))
