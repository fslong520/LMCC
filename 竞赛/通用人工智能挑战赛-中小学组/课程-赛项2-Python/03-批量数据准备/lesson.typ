#import "../../../../lmcc-theme.typ": *

#show: lmcc-theme.with(
  level: "赛项2·识物工坊 Python备赛",
  lesson: "03",
  title: "批量数据准备——备出高质量橙子数据集",
  date: "2026年",
)

= 批量数据准备——备出高质量橙子数据集

#objective[
- 会用 os 遍历、批量重命名、统一图片
- 会用哈希去重，避免连拍"背答案"
- 会按比例划分训练集/测试集，防数据泄漏
- 会统计两类数量、检查数据健康度
- 明白"数据决定模型上限"，能自己备好数据
]

#warning[
*本节定位*：识物工坊的模型上限由数据决定。本节是备赛核心——用 Python 把"采样→整理→去重→划分→检查"整套数据流程跑通，让你准备的橙子/非橙子数据又快又准。
]

== 〇、为什么数据这么重要（5分钟）

#key-concept("数据决定模型上限", [
识物工坊模型的上限，由你准备的图片决定。
- 两类数量接近、变化充分 → 模型学到真规律，分得准
- 大量重复连拍、类别不清 → 模型"背答案"，换个图就错
- 本节逐个解决：命名、去重、划分、检查
])

== 一、批量整理图片（15分钟）

=== 1.1 统一命名

#practice[
*操作*：把"橙子"文件夹里所有图，统一重命名为 orange_1.jpg、orange_2.jpg...

```python
import os

folder = "orange"
files = [f for f in os.listdir(folder) if f.endswith((".jpg", ".png", ".webp"))]
for i, f in enumerate(sorted(files)):
    old = os.path.join(folder, f)
    new = os.path.join(folder, f"orange_{i+1}.jpg")
    os.rename(old, new)
print(f"已重命名 {len(files)} 张")
```

+ `os.rename(旧, 新)` 改文件名
+ 统一命名便于管理，也避免重名覆盖
])

=== 1.2 统一尺寸

#key-concept("统一尺寸", [
```python
from PIL import Image
import os

folder = "orange"
for f in os.listdir(folder):
    if f.endswith(".jpg"):
        img = Image.open(os.path.join(folder, f))
        img = img.resize((256, 256))       # 统一成 256×256
        img.save(os.path.join(folder, f))
```
- 尺寸统一，数据更规整；建议统一成正方形
])

== 二、去重：别让连拍"背答案"（15分钟）

=== 2.1 为什么去重

#warning[
同一物体连拍几十张几乎一样的图，模型会"背下"这张图，而不是学会"橙子"的一般规律。训练时分数虚高，一换图就失效。所以同一连拍只保留少量代表图。
]

=== 2.2 用哈希去重

#practice[
*操作*：用图片内容指纹（哈希）找出完全重复的图。

```python
import os, hashlib

def img_hash(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()

folder = "orange"
seen = set()
for f in sorted(os.listdir(folder)):
    if not f.endswith((".jpg", ".png")):
        continue
    h = img_hash(os.path.join(folder, f))
    if h in seen:
        print("重复删除：", f)
        os.remove(os.path.join(folder, f))
    else:
        seen.add(h)
```

+ `hashlib.md5` 给文件算指纹，相同内容指纹相同
+ 完全相同的图删掉，保留一张代表作
])

=== 2.3 相似图（进阶）

#key-concept("相似度去重（进阶）", [
完全重复好去，但"几乎一样"（连拍）需算相似度。可用 Pillow 缩图后比较像素差异：

```python
from PIL import Image

def is_similar(a, b, thresh=20):
    A = Image.open(a).convert("L").resize((32, 32))
    B = Image.open(b).convert("L").resize((32, 32))
    pa, pb = list(A.getdata()), list(B.getdata())
    diff = sum(abs(x - y) for x, y in zip(pa, pb)) / len(pa)
    return diff < thresh   # 差异小于阈值 → 视为近似
```

`convert("L")` 转灰度、`resize` 缩图，比较两图的平均像素差。近似的只留一张。
])

== 三、划分训练集与测试集（15分钟）

=== 3.1 为什么必须分开

#warning[
*防数据泄漏*：绝不能用最终测试的图片去训练。若同一画面近似图同时出现在训练和测试中，自测分会虚高。要单独留一组"从未训练过"的图，专测泛化能力。
]

=== 3.2 按比例划分

#practice[
*操作*：把橙子图按 8:2 分成训练集和测试集（测试集单独放，不进训练）。

```python
import os, random, shutil

def split_folder(src, train_dir, test_dir, ratio=0.8):
    os.makedirs(train_dir, exist_ok=True)
    os.makedirs(test_dir, exist_ok=True)
    files = [f for f in os.listdir(src) if f.endswith((".jpg", ".png", ".webp"))]
    random.shuffle(files)
    cut = int(len(files) * ratio)
    for i, f in enumerate(files):
        dst = train_dir if i < cut else test_dir
        shutil.copy(os.path.join(src, f), os.path.join(dst, f))

split_folder("orange", "orange_train", "orange_test", 0.8)
split_folder("not_orange", "not_train", "not_test", 0.8)
print("划分完成：训练集80%，测试集20%")
```

+ `random.shuffle` 打乱，`shutil.copy` 复制
+ 训练集 80%、测试集 20%，两类都这样分
+ *测试集的图绝不进训练*——这就是防泄漏
])

== 四、统计与健康度检查（15分钟）

=== 4.1 统计两类数量

#practice[
*操作*：统计橙子/非橙子训练图数量，判断是否达标、是否平衡。

```python
import os

def count(folder):
    return len([f for f in os.listdir(folder) if f.endswith((".jpg", ".png", ".webp"))])

orange_n = count("orange_train")
notorange_n = count("not_train")
print(f"训练集——橙子 {orange_n}，非橙子 {notorange_n}")
if orange_n >= 20 and notorange_n >= 20:
    print("数量充足，且两类平衡，可训练")
elif orange_n >= 5 and notorange_n >= 5:
    print("刚过最低门槛，建议补到 20+")
else:
    print("某类不足 5 张，无法训练")
```

+ 每类 ≥5 才能训练，建议 20 张以上
+ 两类数量尽量接近（橙 40、非橙也约 40）
])

=== 4.2 健康度检查清单

#key-concept("数据健康度", [
提交训练前，用 Python 检查：
+ 类别清晰：橙子/非橙子没混
+ 无重复、无模糊废图
+ 两类数量接近
+ 变化充分：不同角度/背景/光线，非橙子含橘子、苹果等难例
+ 训练/测试分开，无泄漏
])

== 五、小结与作业（10分钟）

=== 小结

#key-concept("本节掌握", [
+ 批量命名、统一尺寸（os + Pillow）
+ 哈希去重、相似度去重（防"背答案"）
+ 按 8:2 划分训练/测试集（防泄漏）
+ 统计数量、检查健康度（达标与平衡）
])

=== 作业

用 Python 把一份橙子/非橙子图片：①统一命名 ②去重 ③8:2 划分训练与测试 ④打印两类数量并判断是否达标。

---

*下讲预告*：准备好的数据交给训练台，它在做什么？下一讲讲机器学习与二分类：训练集、批大小、学习率、数据健康度到底怎么回事。
