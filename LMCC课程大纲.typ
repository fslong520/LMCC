// ============================================================
// 智国学堂 · 双体系 AI 课程大纲
// 覆盖：CCF大模型能力认证（LMCC）+ 人工智能奥林匹克（NOAI）
// 核心理念：先用后懂——先从"用AI"开始，再进化到"AI背后的知识"，继而亲手"做出自己的AI"
// 环境：openKylin（开放麒麟，原生 / WSL 双形态）
// ============================================================
#import "lmcc-theme.typ": *

// ========== 封面 ==========
#set page(
  paper: "a4",
  margin: (top: 0pt, bottom: 0pt, left: 0pt, right: 0pt),
  header: none,
  footer: none,
  numbering: none,
  fill: white,
)

#align(center + horizon, image("封面.png", width: 100%, height: 100%))

// ========== 内容页通用设置 ==========
#let content-header(num, title) = {
  grid(
    columns: (auto, 1fr),
    column-gutter: 0pt,
    block(
      width: 60pt,
      height: 60pt,
      radius: 0pt,
      fill: primary-color,
      align(center + horizon, [
        #text(size: 36pt, weight: "bold", fill: white)[#num]
      ])
    ),
    block(
      width: 100%,
      height: 60pt,
      inset: (left: 1em),
      fill: rgb("#f0f4f8"),
      align(left + horizon, [
        #text(size: 20pt, weight: "bold", fill: black)[#title]
      ])
    ),
  )
}

#let course-row(num, name, is-even) = {
  let bg = if is-even { rgb("#f8f9fa") } else { white }
  block(
    width: 100%,
    inset: (x: 0.8em, y: 0.45em),
    fill: bg,
    [
      #text(size: 10pt, weight: "bold", fill: primary-color)[#num]
      #h(0.6em)
      #text(size: 11pt, fill: black)[#name]
    ]
  )
}

// ========== LV1 ==========
#pagebreak()

#set page(
  paper: "a4",
  margin: (top: 2cm, bottom: 2cm, left: 2.5cm, right: 2.5cm),
  header: none,
  footer: context {
    grid(
      columns: (1fr, 1fr, 1fr),
      align(left, text(size: 8pt, fill: rgb("#bbb"))[智国学堂 TeachZero]),
      align(center, text(size: 9pt, fill: rgb("#999"))[#counter(page).display("1")]),
      align(right, text(size: 8pt, fill: rgb("#bbb"))[LMCC课程大纲]),
    )
  },
  numbering: none,
  fill: white,
)

#set text(font: ("LXGW WenKai Mono GB", "Noto Sans CJK SC"), size: 11pt, fill: black)
#set par(first-line-indent: 0em)

#content-header("1", "会用AI·应用体验篇（双主线）")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV1 · 先震撼，再学会驾驭 + 亲手搓出AI Agent · 30课时]
#v(0.4em)

#text(size: 10pt, fill: rgb("#555"))[两大核心目标：
① **驾驭AI**——学完能熟练驾驭市面上各种 AI 帮你干活；
② **搓Agent**——能用 Python 在 openKylin 里亲手搓出一个自己的 AI Agent（部署百度文心 ERNIE-4.5-0.3B 端侧模型）。]
#v(0.4em)

#block(
  width: 100%, inset: (x: 0.8em, y: 0.5em),
  fill: rgb("#fff8e1"), stroke: (left: 3pt + accent-color),
  [
    #text(size: 10.5pt, weight: "bold", fill: accent-color)["🎯 贯穿项目：我的 AI Agent"]
    #v(0.2em)
    #text(size: 10pt, fill: rgb("#555"))[双主线贯穿 30 课：A线·驭AI（用别人的AI干活）+ B线·搓Agent（学Linux/Python，一步步把AI能力搬进自己的程序）。每课都是"用AI干个活 → 学段代码 → 往自己的Agent加一块"。]
  ]
)
#v(0.8em)

#let lv1-courses = (
  ("01", "AI就在身边——被AI震撼"),
  ("02", "第一次与AI对话-把话说清楚"),
  ("03", "提示词三要素-角色任务要求"),
  ("04", "让AI帮我写作文"),
  ("05", "让AI当学习教练"),
  ("06", "让AI画画-文生图初体验"),
  ("07", "让AI做汇报-PPT与文档"),
  ("08", "让AI当翻译官"),
  ("09", "让AI做摘要-长文变要点"),
  ("10", "让AI理数据-表格会说话"),
  ("11", "提示词进阶-示例分步追问"),
  ("12", "AI工具百宝箱"),
  ("13", "多模态AI-能听会说还能看"),
  ("14", "火眼金睛-判断AI说得对不对"),
  ("15", "AI的局限-幻觉与偏见初探"),
  ("16", "用AI学AI-我的私人老师"),
  ("17", "综合实战-用AI完成一个任务"),
  ("18", "我的AI Agent-认识Linux与第一个命令"),
  ("19", "Python起步-让程序开口说话"),
  ("20", "变量·类型·运算符-让AI学会「存东西」"),
  ("21", "分支与循环-让AI会「做决定」"),
  ("22", "列表与字典-让AI会「查资料」"),
  ("23", "函数与模块-把能力「装盒子」"),
  ("24", "文件读写与异常-让AI会「记东西」"),
  ("25", "命令行与pip-管理你的AI"),
  ("26", "部署百度ERNIE-4.5-0.3B-给AI装上「大脑」"),
  ("27", "组装我的AI Agent-能对话"),
  ("28", "AI Agent进阶-加查资料与答题"),
  ("29", "作品展示-我的AI Agent首秀"),
  ("30", "复盘与闯关-驾驭AI+搓Agent双考核"),
)

#for (i, (num, name)) in lv1-courses.enumerate() {
  course-row(num, name, calc.rem(i, 2) == 0)
}

// ========== LV2 ==========
#pagebreak()

#content-header("2", "懂AI·原理认知篇")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV2 · 背后的知识 · 22课时（增补ML/DL考点，兼顾LMCC与NOAI）]
#v(0.8em)

#let lv2-courses = (
  ("01", "从用到懂-AI是怎么学会的"),
  ("02", "数据是AI的粮食"),
  ("03", "机器学习流程与模型-三范式与经典模型"),
  ("04", "机器学习经典模型-线性回归与逻辑回归"),
  ("05", "模型评估-混淆矩阵·精确率·召回率·F1"),
  ("06", "过拟合·正则化·交叉验证"),
  ("07", "集成学习-随机森林思想"),
  ("08", "让机器认出猫-图像识别的秘密"),
  ("09", "神经网络的直觉"),
  ("10", "感知机与反向传播"),
  ("11", "梯度下降与优化器"),
  ("12", "CNN结构与特征图计算"),
  ("13", "文字怎么变成数字"),
  ("14", "Token之谜-AI眼中的文字"),
  ("15", "Transformer结构与预训练-超级猜词机"),
  ("16", "自注意力机制-如何找重点"),
  ("17", "预训练微调与对齐-训练三部曲"),
  ("18", "大模型简史-从统计到ChatGPT"),
  ("19", "大模型的超能力-越大越聪明"),
  ("20", "解码部署与评测-模型的生命周期"),
  ("21", "主流模型架构对比-模型家族地图"),
  ("22", "复盘-画出你心中的AI原理图"),
)

#for (i, (num, name)) in lv2-courses.enumerate() {
  course-row(num, name, calc.rem(i, 2) == 0)
}

// ========== LV3 ==========
#pagebreak()

#content-header("3", "驾驭AI（创造应用篇）")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV3 · 用AI造东西 · 20课时]
#v(0.8em)

#let lv3-courses = (
  ("01", "提示工程与复杂推理-从会用走向精通"),
  ("02", "API初识-程序如何调用AI"),
  ("03", "第一次API实战-我的AI小应用"),
  ("04", "AI编程入门-让AI帮我写代码"),
  ("05", "扣子智能体与自动化-替我跑腿"),
  ("06", "检索增强生成RAG-如何读懂我的文档"),
  ("07", "搭建个人知识库-我的第二大脑"),
  ("08", "智能体与工具调用-会自己动手的AI"),
  ("09", "多Agent协作实战-打造自动助手"),
  ("10", "多模态创作-图文音视频工作流"),
  ("11", "AI音视频-配音音乐数字人"),
  ("12", "AI辅助学习-个性化学习助手"),
  ("13", "AI创作工作流-小说漫画剧本"),
  ("14", "综合项目-我的AI作品-规划"),
  ("15", "综合项目-开发与调试（一）"),
  ("16", "综合项目-打磨与评测（二）"),
  ("17", "项目展示与互评"),
  ("18", "发布与分享-作品走向世界"),
  ("19", "复盘-我的AI技能树"),
  ("20", "创造应用测验与项目总结"),
)

#for (i, (num, name)) in lv3-courses.enumerate() {
  course-row(num, name, calc.rem(i, 2) == 0)
}

// ========== LV4 ==========
#pagebreak()

#content-header("4", "思辨AI·素养未来篇")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV4 · 与AI共处 · 20课时（覆盖LMCC伦理安全 + NOAI F区）]
#v(0.8em)

#let lv4-courses = (
  ("01", "AI伦理初探-技术有对错吗"),
  ("02", "偏见从何而来-算法会歧视吗"),
  ("03", "隐私与数据-我的信息去哪了"),
  ("04", "AI安全-幻觉越狱滥用"),
  ("05", "版权之问-AI的创作归谁"),
  ("06", "AI与就业-工作会消失吗"),
  ("07", "AI与教育-如何学才不被淘汰"),
  ("08", "AI与创造-人类会被取代吗"),
  ("09", "AI治理-世界如何给AI立规矩"),
  ("10", "深度伪造与信息茧房-媒体素养"),
  ("11", "看不见的成本-能源与环境"),
  ("12", "AGI之问-强人工智能是科幻吗"),
  ("13", "伦理辩论赛-AI该不该有情感"),
  ("14", "未来职业探索-AI时代做什么"),
  ("15", "我的AI使用守则-个人宣言"),
  ("16", "结业项目-我的AI研究报告-规划"),
  ("17", "结业项目-研究与写作"),
  ("18", "结业项目-展示与答辩"),
  ("19", "大回顾-会用懂驾驭思辨"),
  ("20", "结业典礼与寄语"),
)

#for (i, (num, name)) in lv4-courses.enumerate() {
  course-row(num, name, calc.rem(i, 2) == 0)
}

// ========== LV5 ==========
#pagebreak()

#content-header("5", "冲NOAI·算法冲刺篇（选学）")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV5 · 面向NOAI竞赛 · 18课时（ML/DL建模 + 真题）]
#v(0.8em)

#let lv5-courses = (
  ("01", "NOAI全景-赛制/题型/真题巡礼"),
  ("02", "机器学习建模实战-分类/回归"),
  ("03", "深度学习建模-PyTorch入门"),
  ("04", "CNN图像分类实战"),
  ("05", "数据清洗与探索实战"),
  ("06", "模型调优-GridSearchCV/超参"),
  ("07", "大模型应用（RAG）冲刺"),
  ("08", "数学强化-概率统计重难点"),
  ("09", "数学强化-线代/微积分重难点"),
  ("10", "初赛真题模拟（纸笔）"),
  ("11", "复赛真题模拟（上机建模）"),
  ("12", "综合项目-端到端AI建模"),
  ("13", "NOAI备赛-时间管理与策略"),
  ("14", "真题复盘-初赛考点精讲"),
  ("15", "真题复盘-复赛建模精讲"),
  ("16", "冲刺模拟（一）-水平测试"),
  ("17", "冲刺模拟（二）-上机实战"),
  ("18", "赛前总动员-心态与技巧"),
)

#for (i, (num, name)) in lv5-courses.enumerate() {
  course-row(num, name, calc.rem(i, 2) == 0)
}

// ========== 课程特色 ==========
#pagebreak()

#content-header("★", "课程特色")
#v(1em)

#let feature(icon, title, desc) = {
  block(
    width: 100%,
    inset: (x: 1em, y: 0.8em),
    radius: 0pt,
    stroke: (left: 3pt + primary-color),
    fill: rgb("#f8f9fa"),
    [
      #text(size: 22pt)[#icon]
      #h(0.8em)
      #text(size: 16pt, weight: "bold", fill: black)[#title]
      #v(0.3em)
      #pad(left: 2.8em)[
        #text(size: 11pt, fill: rgb("#555"))[#desc]
      ]
    ]
  )
  v(0.6em)
}

#feature("🎯", "先用后懂", "先从\"用AI\"开始，在真实场景中建立信心与兴趣，再深入\"AI背后的知识\"，继而亲手\"做出自己的AI\"，由表及里。")
#feature("🔗", "双体系兼顾", "一条路径覆盖LMCC考纲12模块 + NOAI六大考区——学完既能考级，也能冲奖。")
#feature("🌀", "双主线贯穿", "LV1以\"驭AI(应用)\"与\"搓Agent(动手)\"双主线贯穿30课：用别人AI干活 + 亲手写出自己的AI。")
#feature("🛠", "动手造AI", "LV1结课，孩子在自己的openKylin上部署百度文心ERNIE-4.5-0.3B，做成能对话/查资料/答题的\"自己的AI Agent\"。")
#feature("🖥", "国产环境", "以openKylin（开放麒麟）为学习环境——原生桌面 或 WSL 双形态，与考场Linux一致，契合国产/政企生态。")
#feature("🌏", "通识素养", "伦理、安全、隐私、未来——培养AI时代独立思考的公民素养。")

// ========== 学习路径 ==========
#v(2em)

#text(size: 18pt, weight: "bold", fill: black)[学习路径]
#v(0.5em)

#align(center, block(
  width: 100%,
  inset: 1.2em,
  radius: 0pt,
  stroke: 1.5pt + primary-color,
  [
    #grid(
      columns: (1fr, auto, 1fr, auto, 1fr, auto, 1fr, auto, 1fr),
      column-gutter: 0.5em,
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: primary-color, align(center, [
          #text(size: 15pt, weight: "bold", fill: white)[LV1]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#bbdefb"))[用AI·搓Agent]
        ]))
      ]),
      align(center + horizon, text(size: 20pt, fill: black)[→]),
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: success-color, align(center, [
          #text(size: 15pt, weight: "bold", fill: white)[LV2]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#c8e6c9"))[懂AI]
        ]))
      ]),
      align(center + horizon, text(size: 20pt, fill: black)[→]),
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: accent-color, align(center, [
          #text(size: 15pt, weight: "bold", fill: white)[LV3]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#ffe0b2"))[驾驭AI]
        ]))
      ]),
      align(center + horizon, text(size: 20pt, fill: black)[→]),
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: error-color, align(center, [
          #text(size: 15pt, weight: "bold", fill: white)[LV4]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#ffcdd2"))[思辨]
        ]))
      ]),
      align(center + horizon, text(size: 20pt, fill: black)[→]),
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: rgb("#5e35b1"), align(center, [
          #text(size: 15pt, weight: "bold", fill: white)[LV5]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#d1c4e9"))[冲NOAI]
        ]))
      ]),
    )
  ]
))
