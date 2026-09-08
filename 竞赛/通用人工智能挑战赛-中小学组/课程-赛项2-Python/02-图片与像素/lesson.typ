#import "../../../../lmcc-theme.typ": *

#show: lmcc-theme.with(
  level: "赛项2·识物工坊 Python备赛",
  lesson: "02",
  title: "图片与像素——理解整图二分类",
  date: "2026年",
)

= 图片与像素——理解整图二分类

#objective[
- 理解"图片在电脑里其实是数字矩阵"
- 会用 Pillow 读取、查看、保存图片
- 分清 RGB 颜色通道，看懂橙子与非橙子的颜色差异
- 理解"整图二分类"到底在分类什么
- 为识物工坊选图、看图打好认知基础
]

#warning[
*本节定位*：识物工坊是"整图二分类"——判断一张图是不是橙子，不标位置。要选好图，得先懂"图片=像素数字"。本节用 Pillow 亲手读图，把抽象概念变具体。
]

== 〇、图片到底是什么（5分钟）

你看到的橙子照片，在电脑里是一大堆数字——每个点叫"像素"，每个像素是几个数（颜色）。

#key-concept("图片 = 像素矩阵", [
一张 100×100 的图，就是 100×100 个像素点。每个像素存颜色。整张图 = 一块数字矩阵。
- 训练台分类的，就是这块"数字矩阵"的规律。
- 说"整图二分类"，就是把一整张图的数字交给模型，让它判断"这是橙子的数字规律吗"。
])

== 一、用 Pillow 读图（15分钟）

=== 1.1 安装与读取

#practice[
*操作*：装 Pillow（Python 的图像库），读一张橙子图。

```bash
pip install pillow
```

```python
from PIL import Image   # 引入 Pillow 图像库

img = Image.open("orange1.jpg")   # 打开图片
print("尺寸：", img.size)          # (宽,高)，如 (300, 300)
print("格式：", img.format)        # 如 JPEG
img.show()                        # 弹窗查看
```

+ `Image.open()` 读图、`.size` 尺寸、`.format` 格式
+ Pillow 是处理图片最常用的 Python 库
])

=== 1.2 保存与格式

#key-concept("保存与转换", [
```python
img.save("copy.png")        # 转成 PNG 保存
img.resize((150, 150)).save("small.jpg")  # 缩小后保存
```
- 识物工坊支持 JPG / PNG / WebP，单张 ≤ 15MB
- 用 Python 批量统一尺寸/格式，能让数据更规整
])

== 二、RGB 颜色通道（15分钟）

=== 2.1 像素是三个数

#practice[
*操作*：取图片某个位置的颜色，看它由几个数组成。

```python
from PIL import Image

img = Image.open("orange1.jpg").convert("RGB")
px = img.getpixel((10, 10))       # 取左上角附近一个像素
print("该像素颜色(R,G,B)：", px)   # 如 (255, 150, 30)

r, g, b = px
print("红：", r, "绿：", g, "蓝：", b)
```

+ 每个像素存 3 个数：红(R)、绿(G)、蓝(B)，各自 0~255
+ 橙子像素往往 R 高、B 低（偏橙红）；这就是模型"认出橙子"的依据之一
])

=== 2.2 颜色怎么看

#key-concept("三原色混合", [
- `(255, 0, 0)` 纯红，`(255, 150, 30)` 橙色系，`(0,0,0)` 黑，`(255,255,255)` 白
- 橙子的特点是 *红色分量高、蓝色分量低*；橘子、橙色球和它接近——这正是"难例"要小心的原因
- 分得清颜色规律，才知道"非橙子"该挑哪些图（橘子、橙色球、橙色西红柿…）
])

== 三、整图二分类在分类什么（15分钟）

=== 3.1 从像素到判断

#practice[
*操作*：写一个"笨办法"——用颜色比例初步猜是不是橙子（理解原理，不替代训练台）。

```python
from PIL import Image

def orange_ratio(img):
    """统计偏橙色的像素占比（简化的例子）"""
    img = img.convert("RGB")
    w, h = img.size
    orange_px = 0
    for x in range(0, w, 5):
        for y in range(0, h, 5):
            r, g, b = img.getpixel((x, y))
            if r > 180 and b < 120:   # 偏橙色的粗略判断
                orange_px += 1
    total = (w // 5) * (h // 5)
    return orange_px / total

img = Image.open("orange1.jpg")
print("橙色占比：", orange_ratio(img))
```

+ 这个例子只演示"颜色统计"，真正的模型比这聪明得多
+ 但能让你理解：*模型就是在找图片里的颜色/纹理规律*，从而判断橙子
])

=== 3.2 为什么靠颜色不够

#warning[
光靠颜色会误判——橘子、橙色球、橙色灯都是"红高蓝低"。所以识物工坊要收集*大量、多样*的真实橙子，让模型学到"橙子的纹理、形状、光泽"而不只是颜色。这也解释了为何难例（橘子/橙色物）对训练如此重要。
]

== 四、选图小技巧（15分钟）

=== 4.1 给数据找"变化"

#practice[
*取样要点*（回想第1讲，用 Python 辅助整理）：

+ 橙子：不同品种、远近、大小、明暗、背景、遮挡、单个/多个
+ 非橙子：苹果、橘子、橙色球、手、桌面、空背景、其他橙色物品
+ 两类数量尽量接近；同一连拍只留几张代表图
+ 用 Python 批量查看、去掉重复、挑出难例
]

=== 4.2 实操：批量看尺寸

#practice[
*操作*：遍历文件夹，打印每张图的尺寸，挑出异常图。

```python
import os
from PIL import Image

folder = "orange"
for f in os.listdir(folder):
    if f.endswith((".jpg", ".png", ".webp")):
        img = Image.open(os.path.join(folder, f))
        print(f, img.size)
# 尺寸差异过大的，可统一 resize，让数据更规整
```

]

== 五、小结与作业（10分钟）

=== 小结

#key-concept("本节掌握", [
+ 图片 = 像素矩阵，每像素 (R,G,B) 三个数
+ Pillow 读图/看图/存图、resize 统一尺寸
+ 橙子像素偏"红高蓝低"，但颜色不够（橘子/橙色球易混）
+ 整图二分类 = 判断一整张图的数字规律是不是橙子
])

=== 作业

用 Python 读 3 张橙子图 + 3 张非橙子图，打印它们的尺寸和某个像素的 RGB，观察橙子与非橙子的颜色差异。

---

*下讲预告*：怎么批量采集、命名、去重、划分训练/测试集？下一讲教你用 Python 备出高质量的橙子数据集。
