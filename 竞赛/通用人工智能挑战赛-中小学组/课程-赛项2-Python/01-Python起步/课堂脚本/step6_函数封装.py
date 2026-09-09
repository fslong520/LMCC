# -*- coding: utf-8 -*-
"""
【任务卡】第1讲 步骤6：函数封装
任务：把"数图"这一步封进函数，之后随处可用。
猜一猜：函数体里那句"这里假装数了数"会被打印吗？为什么？
试一试：给 count_imgs 换个参数值；再想想真的数图时 return 什么？
"""


def count_imgs(folder):
    """统计某文件夹里的图片数量（本步先假装数完）"""
    # 这里假装数了数：真实的数法在第 7 步
    return 20


n = count_imgs("orange")
print(f"橙子类有{n}张")

# 函数的好处：同一个活，到处可用
print("非橙子类有", count_imgs("not_orange"), "张（也是假装的）")
