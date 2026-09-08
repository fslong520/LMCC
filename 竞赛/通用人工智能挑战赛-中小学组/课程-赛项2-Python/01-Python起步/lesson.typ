#import "../../../../lmcc-theme.typ": *

#show: lmcc-theme.with(
  level: "赛项2·识物工坊 Python备赛",
  lesson: "01",
  title: "Python起步——为识物工坊打地基",
  date: "2026年",
)

= Python起步——为识物工坊打地基

#objective[
- 会写第一个 Python 程序（print、变量、运算）
- 掌握列表、字典与 for 循环，能批量处理数据
- 会用 if/else 做判断、用函数封装流程
- 会用 os 遍历文件夹里的图片文件
- 理解"学 Python 是为了备好橙子/非橙子数据"
]

#warning[
*本节定位*：识物工坊用浏览器训练台做橙子二分类，选手不写训练代码，但要用 Python 备数据。本节是把 Python 最常用的部分过一遍——全部围绕"批量整理图片"这一个真实任务展开，学完就能上手备数据。
]

== 〇、为什么备赛要学 Python（5分钟）

识物工坊的模型上限，由你准备的图片决定。而整理几十张橙子/非橙子图片，用 Python 批量做最快、最不易出错。

#key-concept("备赛与Python的关系", [
识物工坊流程：*采样 → 健康度检查 → 浏览器训练 → 测试 → 提交*。
其中"采样"和"检查"两步，可先用 Python 批量处理图片——这是本节要练的目标。
])

== 一、第一个程序：让Python说话（10分钟）

=== 1.1 print 与变量

#practice[
*操作*：写第一个程序，用小 Python 打印一句"我要备橙子数据"。

```python
# 变量：给数据起个名字
dataset = "橙子与非橙子"
print("我的任务是：准备" + dataset + "图片")
```

+ `print()`：把内容打印出来
+ `变量`：如 `dataset`，像贴标签的盒子
+ `"..."`：字符串，要用引号包起来
*运行*：`python 1.py`，屏幕上显示这句话。
]

=== 1.2 常用运算

#key-concept("数字与字符串基础", [
```python
a = 10        # 整数
b = 3.5       # 小数
name = "橙子"  # 字符串
print(a + b)        # 加法 → 13.5
print(name * 3)     # 重复字符串 → 橙子橙子橙子
print(f"我有{a}张{name}图片")   # f字符串：把变量塞进句子
```
])

== 二、列表与循环：批量处理（15分钟）

=== 2.1 列表：把一批图片装起来

#practice[
*操作*：用列表存一批图片文件名，用 for 循环逐张打印。

```python
# 列表：一串数据，用[]包起来
orange_imgs = ["橙子1.jpg", "橙子2.jpg", "橙子3.jpg"]

# for循环：逐个取出
for img in orange_imgs:
    print("正在检查：", img)
```

+ `列表`：`[...]` 存多个值，下标从 0 开始 `orange_imgs[0]`
+ `for ... in ...`：遍历，逐个处理
+ 这正是批量看图的雏形——后面用它遍历整个文件夹
])

=== 2.2 字典：给图片分类

#key-concept("字典：键值对应", [
```python
# 字典：名字→内容，用{}包起来
dataset = {
    "orange": ["橙子1.jpg", "橙子2.jpg"],   # 橙子类
    "not_orange": ["苹果.jpg", "橘子.jpg"],  # 非橙子类
}
print("橙子类有", len(dataset["orange"]), "张")
print("非橙子类有", len(dataset["not_orange"]), "张")
```
- 用 `字典[键]` 取值，`len()` 数长度
- 训练台正是按"橙子/非橙子"两类组织的
])

== 三、判断与函数：整理逻辑（15分钟）

=== 3.1 if/else 判断

#practice[
*操作*：按数量判断数据是否达标。

```python
count = 18
if count >= 20:
    print("数量充足，可以训练")
elif count >= 5:
    print("刚到最低门槛，建议再加")
else:
    print("不够5张，无法训练")
```

- `if`/`elif`/`else`：按条件走不同分支
- 训练台门槛：每类至少 5 张，建议 20 张以上——这正是要判断的
])

=== 3.2 函数：封装成流程

#key-concept("def 函数", [
```python
def count_imgs(folder):
    """统计某文件夹里jpg图片的数量"""
    # ...用一个好用的函数，把"数图"这一步封起来
    return 20

n = count_imgs("orange")
print(f"橙子类有{n}张")
```
- `def 函数名(参数)` 定义，`return` 返回
- 把常用步骤包成函数，下次直接调用
])

== 四、实操：遍历文件夹（20分钟）

=== 4.1 os 遍历图片

#practice[
*操作*：用 Python 列出某个文件夹里所有图片。

```python
import os   # os 模块：跟系统文件打交道

folder = "orange"   # 换成你的橙子图片文件夹
img_count = 0
for f in os.listdir(folder):
    if f.endswith((".jpg", ".png", ".webp")):
        print("发现图片：", f)
        img_count += 1

print(f"共找到 {img_count} 张橙子图片")
```

- `import os` 引入系统工具
- `os.listdir(folder)` 列出文件夹里所有文件名
- `endswith((...))` 判断扩展名（jpg/png/webp）
]

=== 4.2 小任务：统计两类图片

#practice[
*操作*：分别统计"橙子"和"非橙子"两个文件夹的图片数，输出是否达标。

```python
import os

def count_imgs(folder):
    n = 0
    for f in os.listdir(folder):
        if f.endswith((".jpg", ".png", ".webp")):
            n += 1
    return n

orange_n = count_imgs("orange")
notorange_n = count_imgs("not_orange")
print(f"橙子 {orange_n} 张，非橙子 {notorange_n} 张")
if orange_n >= 5 and notorange_n >= 5:
    print("两类都达标，可开始训练")
else:
    print("某类不足5张，先补充数据")
```

+ 把"数图"写进函数 `count_imgs`，两边都能用
+ `and`：两个条件都要满足
]

== 五、小结与作业（10分钟）

=== 小结

#key-concept("本节掌握", [
+ `print` 打印、`变量`存数据、`f"..."` 格式化
+ `列表`存一串、`for` 循环遍历、`字典`按类存取
+ `if/elif/else` 判断、`def` 函数封装
+ `os.listdir` 遍历文件夹、`endswith` 过滤图片
])

=== 作业

回家用 Python 统计你电脑上某个图片文件夹里 jpg/png/webp 各多少张，并打印"能否训练"的判断。

--- 

*下讲预告*：图片在电脑里到底是什么？我们走进像素世界，理解"整图二分类"在分类什么。
