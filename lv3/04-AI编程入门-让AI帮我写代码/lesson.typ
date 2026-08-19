#import "../../lmcc-theme.typ": *

#show: lmcc-theme.with(
  level: "驾驭AI（创造应用篇）",
  lesson: "04",
  title: "AI编程入门-让AI帮我写代码",
  date: "2026年",
)

= AI编程入门-让AI帮我写代码

== 〇、回顾（5分钟）

回顾LV3-03的API调用实战，引出本课主题：用AI辅助编程，快速掌握Python基础。

== 一、导入（10分钟）

=== 1.1 为什么学Python

- Python是AI时代首选语言：简洁、生态丰富、AI库众多
- 本课目标：掌握Python基础语法，能用AI辅助编写简单程序
- 学习路径：变量→数据类型→分支→循环→函数

=== 1.2 AI辅助编程的优势

- AI可以快速生成代码框架
- AI可以帮助调试错误
- AI可以解释复杂代码逻辑

== 二、核心内容（25分钟）

=== 2.1 Python基础语法（IPO模式）

**IPO模式**：Input（输入）→ Process（处理）→ Output（输出）

```python
# 输入
name = input("请输入你的名字：")
# 处理
greeting = f"你好，{name}！欢迎来到AI世界"
# 输出
print(greeting)
```

**变量与赋值**：
- 变量是存储数据的"盒子"
- 赋值用`=`号（不是数学等号）
- 变量名规则：字母、数字、下划线，不能数字开头

```python
# 变量示例
health = 100  # 血量
name = "小明"  # 名字
is_alive = True  # 状态
```

=== 2.2 数据类型

| 类型 | 说明 | 示例 |
|------|------|------|
| int | 整数 | `100`, `-5` |
| float | 浮点数 | `3.14`, `-0.5` |
| str | 字符串 | `"hello"`, `'AI'` |
| bool | 布尔值 | `True`, `False` |
| list | 列表 | `[1, 2, 3]` |

```python
# 类型转换
age = int(input("请输入年龄："))
height = float(input("请输入身高："))
score = str(95)  # 转字符串
```

=== 2.3 分支结构

**if-else判断**：让程序做决定

```python
# 基础判断
score = int(input("请输入分数："))
if score >= 90:
    print("优秀！")
elif score >= 60:
    print("及格")
else:
    print("需要努力")
```

**比较运算符**：`==`, `!=`, `>`, `<`, `>=`, `<=`

**逻辑运算符**：`and`, `or`, `not`

=== 2.4 循环结构

**for循环**：知道循环次数时使用

```python
# 基础for循环
for i in range(5):
    print(f"第{i+1}次循环")

# 遍历列表
tools = ["ChatGPT", "Midjourney", "Stable Diffusion"]
for tool in tools:
    print(f"AI工具：{tool}")
```

**while循环**：不知道循环次数时使用

```python
# while循环
health = 100
while health > 0:
    damage = int(input("受到伤害："))
    health -= damage
    print(f"剩余血量：{health}")
```

**循环控制**：`break`（跳出循环）, `continue`（跳过本次）

=== 2.5 函数基础

**函数定义与调用**：

```python
# 定义函数
def greet(name):
    """打招呼函数"""
    return f"你好，{name}！"

# 调用函数
message = greet("小明")
print(message)
```

**常用内置函数**：
- `print()` - 输出
- `input()` - 输入
- `len()` - 长度
- `range()` - 范围
- `int()`, `float()`, `str()` - 类型转换

== 三、实操练习（30分钟）

=== 3.1 AI编程实战：用AI写小游戏

**任务**：用AI辅助编写一个简单的文字冒险游戏

```python
# AI辅助生成的代码框架
def adventure_game():
    print("=== AI冒险游戏 ===")
    name = input("请输入角色名：")
    health = 100
    
    while health > 0:
        print(f"\n当前血量：{health}")
        action = input("选择行动（1.攻击 2.防御 3.逃跑）：")
        
        if action == "1":
            damage = 10
            health -= damage
            print(f"你受到{damage}点伤害")
        elif action == "2":
            print("防御成功，无伤害")
        elif action == "3":
            print("逃跑成功！")
            break
        else:
            print("无效选择")
    
    print("游戏结束")

# 运行游戏
adventure_game()
```

**学习要点**：
1. 用AI生成代码框架
2. 理解代码逻辑
3. 修改参数测试效果
4. 调试错误

=== 3.2 调试技巧

**常见错误类型**：
- 语法错误：代码写法错误
- 运行时错误：程序执行中出错
- 逻辑错误：程序能运行但结果不对

**AI调试方法**：
1. 将错误信息发给AI
2. 描述期望行为
3. 让AI解释原因并提供修复方案

== 四、课后作业（10分钟）

1. 完成AI冒险游戏的扩展：添加更多场景和选择
2. 用AI辅助编写一个简单的计算器程序
3. 尝试用AI解释一段复杂代码的逻辑

== 五、扩展阅读

- Python官方教程：https://docs.python.org/zh-cn/3/tutorial/
- AI编程助手对比：GitHub Copilot vs ChatGPT Code Interpreter
- 下节预告：LV3-05 扣子智能体与自动化-替我跑腿
