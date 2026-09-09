#import "../../../../lmcc-theme.typ": *

#show: lmcc-theme.with(
  level: "赛项2·识物工坊 Python备赛",
  lesson: "06",
  title: "进阶：用 Python 复现图像二分类",
  date: "2026年",
)

= 进阶：用 Python 复现图像二分类

#objective[
- 用 sklearn 跑通"数据→训练→测试"完整二分类链路
- 用颜色/灰度统计做最简单的橙子分类，理解特征
- 看清训练台背后在干什么，不盲调参
- 理解数据增强思想，知道怎么备数据更有效
- 对比 Python 复现与训练台，融会贯通
]

#warning[
*本节定位*：进阶选学。识物工坊在浏览器内跑训练，本节用 Python 复现一个简化版，让你看清"数据→特征→模型→评估"到底怎么走。懂了原理，上台调参更从容。
]

== 课前准备（Windows 课堂环境）

- 需要 numpy + scikit-learn：`python -m pip install numpy scikit-learn`（约 60MB，课前装好）
- 教师机验证：`python check_env.py`，sklearn 一行 [OK]
- 本讲复用目录下现成脚本做对照实验：`demo.py`（难例）、`demo.py ..\..\测试素材\orange ..\..\测试素材\not_orange_easy`（易例）、`experiment.py`（全景对比）——引导学生比较两份数据的准确率差异，自己说出"数据决定上限"
- 老机器装不上 sklearn 可跳过本讲，不影响备赛

== 〇、为什么复现一遍（5分钟）

#key-concept("复现 = 看懂黑盒", [
训练台是个"黑盒"（点训练，出模型）。用 Python 复现一遍，黑盒变透明：知道它内部在算特征、学规律、出评估。
- 不必做得多准，关键是看清*整条链路*
- 学有余力者选学；只想备赛可跳过深入部分
])

== 一、搭建数据（10分钟）

=== 1.1 准备两类图

#practice[
*操作*：用第3讲备好的数据，或临时几张小图。整理成"特征 x + 标签 y"。

```python
# 特征：这里用颜色的简单统计（红蓝差）当"特征"
# 标签：橙子=1，非橙子=0
samples = [
    ([230, 120, 30], 1),   # 橙子（红高蓝低）
    ([250, 40, 20], 1),    # 橙子
    ([120, 180, 60], 0),   # 绿苹果（非橙子）
    ([200, 90, 20], 0),    # 橘子（难例，接近橙子特征）
]
```

+ 样本存(list, 标签)：特征在前，标签在后
+ 训练台用的特征远比这复杂，但"样本+标签"的结构一致
]

== 二、训练一个模型（20分钟）

=== 2.1 用 sklearn 训练

#practice[
*操作*：用 sklearn 的决策树或逻辑回归做二分类。

```bash
pip install scikit-learn
```

```python
from sklearn.tree import DecisionTreeClassifier

X = [s[0] for s in samples]   # 特征
y = [s[1] for s in samples]   # 标签

clf = DecisionTreeClassifier()   # 决策树分类器
clf.fit(X, y)                    # 训练

# 预测：给一张新特征，判断是否橙子
new_img_features = [220, 110, 25]   # 假设某张图的颜色特征
pred = clf.predict([new_img_features])
print("预测：", "橙子" if pred[0] == 1 else "非橙子")
```

+ `DecisionTreeClassifier` 一个简单分类器
+ `fit(特征, 标签)` 训练，`predict` 预测
+ 这就是训练台"点训练"在底层做的事（模型更复杂）
]

=== 2.2 用真实图片颜色

#key-concept("从图片提取特征", [
```python
from PIL import Image

def color_features(path):
    """从图片提取简单的颜色特征：平均红、平均绿、平均蓝"""
    img = Image.open(path).convert("RGB").resize((32, 32))
    px = list(img.getdata())
    n = len(px)
    r = sum(p[0] for p in px) / n
    g = sum(p[1] for p in px) / n
    b = sum(p[2] for p in px) / n
    return [r, g, b]   # 一张图 → 3 个数字特征

print(color_features("orange1.jpg"))
```
- 一张图 → 几个数字（特征），喂给模型
- 训练台会提取更丰富的纹理/形状特征，原理相通
])

=== 2.3 进阶特征：纹理维度（LBP）

#key-concept("纹理特征：摸一摸'皮肤'", [
颜色特征分不清"橙子 vs 橘子"（颜色太像），但摸上去手感不同——橙子皮有*毛孔麻点*，橘子皮光滑有高光。LBP（局部二值模式）就是把"麻点密度"变成数字：

```python
import numpy as np
from PIL import Image

def lbp_hist(path):
    """纹理特征：3x3 邻域与中心比大小，得 0~255 的'麻点编码'，统计分布"""
    g = np.asarray(Image.open(path).convert("L").resize((64, 64)), float) / 255.0
    h, w = g.shape
    lbp = np.zeros((h - 2, w - 2))
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            lbp = lbp * 2 + (g[1+dy:h-1+dy, 1+dx:w-1+dx] > g[1:h-1, 1:w-1])
    hist, _ = np.histogram(lbp.ravel(), bins=16, range=(0, 256), density=True)
    return hist

print(lbp_hist("orange1.jpg"))   # 16 个数：这张图的'皮肤质地'
```

- 实测（详见 `优化实验结论.md`）：纹理特征 + SVM = *65.9%*，高于颜色特征的 57%，且波动最小
- 教训一条：维度贵精不贵多——试过边缘方向直方图，无效反拖累，被舍弃
])

== 三、评估模型（20分钟）

=== 3.1 划分与测试

#practice[
*操作*：像第3讲那样分训练/测试，测准确率。

```python
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split

X = [s[0] for s in samples]
y = [s[1] for s in samples]

# 8:2 划分训练/测试
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

clf = DecisionTreeClassifier()
clf.fit(X_train, y_train)
acc = clf.score(X_test, y_test)   # 测试集准确率
print("测试集准确率：", acc)
```

+ `train_test_split` 自动 8:2 划分（省手动分）
+ `score` 算测试集准确率——模型水平
]

=== 3.2 看混淆矩阵

#key-concept("confusion_matrix", [
```python
from sklearn.metrics import confusion_matrix

y_pred = clf.predict(X_test)
cm = confusion_matrix(y_test, y_pred)
print("混淆矩阵：\n", cm)
# sklearn 默认按标签排序 [0,1]：行=真实，列=预测
# [[真阴, 假阳(非橙认橙)],
#  [假阴(漏认橙), 真阳]]
```
- 和训练台"评估+误判分析"一致
- 假阳/假阴一目了然，指导补难例
])

== 四、数据增强思想（15分钟）

=== 4.1 让模型更稳

#practice[
*操作*：用 Pillow 做简单数据增强（旋转、亮度变化），模拟更多变化，提升泛化（可选动手）。

```python
from PIL import Image, ImageEnhance

img = Image.open("orange1.jpg")
img.rotate(15).save("orange_rot.jpg")          # 旋转15度
ImageEnhance.Brightness(img).enhance(0.8).save("orange_dim.jpg")  # 调暗
```

+ *数据增强*：旋转、翻转、调亮度、微调色相——人为制造更多变化
+ 让模型见到更多样，不易过拟合、更稳
+ 识物工坊可能内置增强；自己备数据也可先多样化
]

=== 4.2 增强 vs 难例

#warning[
- *难例*（补真图）优先：橘子、不同光线橙子——真实分布，最有效
- *增强*（变出图）辅助：旋转/亮度——扩充数量与变化
- 先补难例，再用增强锦上添花。扎实的真实数据永远是根本
]

== 五、亲手训一个 CNN（选学进阶，20分钟）

=== 5.1 深度模型登场

#key-concept("CNN：让卷积核自己学'该看什么'", [
前面所有特征（颜色、纹理、边缘）都是*人想好*再提取的。CNN 的卷积核是*学出来*的——
第一层学"找边/找颜色块"，第二层学"找纹理组合"，层层递进。

```python
python cnn_numpy.py
```

输出（约 1 分钟，纯 numpy 无需深度学习框架）。实测结果值得细品：
*训练准确率 97%+，验证却只有 60% 上下*——网络把 56 张训练图背下来了。

对照：纹理特征 SVM 66.1%（同口径）。
*CNN 在这个数据量上没有赢*——为什么？往下看。
])

=== 5.2 过拟合现场课（本讲最值钱的十分钟）

#warning[
小数据训深度网络的真实困境，全在这组数字里：
- 56 张图 vs 1.8 万参数——参数比样本多 300 倍
- 训练准确率 97.7%，验证 50%：背题，不是学习
- 试过的药方：在线增强、Dropout、L2、早停——验证分上去了（75%），
  *但那是"在验证集上挑最好的一轮"的虚高*；换成不在验证集上做任何选择的
  诚实评估，掉回 60% 以下
]

#key-concept("三课合并成一句", [
1. *数据量是深度学习的水*——CNN 的优势要几百张图才显出来，识物工坊
   训练台建议每类 20+ 张起步、越多越好，正是这个道理
2. *评估口径决定结论真假*——在验证集上反复挑峰值，等于用考试卷练习题；
   诚实口径（模型选择与测试分离）才能报出真分数
3. *手工特征没输*——纹理 SVM 66.1% 与 CNN 59.2% 同口径对比，56 张图的
   小世界里，人的先验知识仍然值钱
])

#key-concept("cnn_numpy.py 里看什么", [
- `conv_forward`：im2col 把卷积变矩阵乘——卷积核滑窗的"物化"
- `softmax_cross_entropy`：交叉熵损失——"分类=猜概率分布"
- `backward`：链式法则逐层回传——梯度怎么从输出流回卷积核
- `augment_batch`：在线增强——每个 epoch 图都在"变形"
课堂只需跑通+看输出对比；源码给学有余力者课后解剖。
])

== 六、小结与作业（10分钟）

=== 小结

#key-concept("本节掌握", [
+ 复现二分类链路：特征+标签 → fit 训练 → 测试评估
+ `train_test_split` 划分、`score` 准确率、`confusion_matrix` 看误判
+ 用 Pillow 提取颜色/纹理特征、做数据增强
+ 亲手训 CNN：看懂链路，也看懂*小数据上深度模型的边界*
+ 看清训练台黑盒，调参不盲目
])

=== 作业

选学：用 sklearn 在几张小图上跑通二分类，打印测试集准确率与混淆矩阵；跑 `cnn_numpy.py` 对比准确率；思考它和识物工坊训练台有何异同。

---

*课程小结*：六讲学完，你既会用 Python 备好橙子/非橙子数据，也懂了训练台背后的二分类原理——甚至亲手训过一个 CNN。接下来——报名进平台，把这份功力用到识物工坊实战上！
