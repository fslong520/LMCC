// ============================================================
// 智国学堂AI通识课程大纲
// 智国学堂 TeachZero · 出品
// 核心理念：先用后懂——先从"用AI"开始，再进化到"AI背后的知识"
// ============================================================
#import "ai-theme.typ": *

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
      align(right, text(size: 8pt, fill: rgb("#bbb"))[AI通识课程大纲]),
    )
  },
  numbering: none,
  fill: white,
)

#set text(font: ("LXGW WenKai Mono GB", "Noto Sans CJK SC"), size: 11pt, fill: black)
#set par(first-line-indent: 0em)

#content-header("1", "会用AI（应用体验篇）")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV1 · 先玩起来 · 20课时]
#v(0.8em)

#let lv1-courses = (
  ("01", "AI就在身边-认识人工智能"),
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
  ("18", "作品展示与互评"),
  ("19", "复盘-我的AI工具清单"),
  ("20", "单元闯关测验"),
)

#for (i, (num, name)) in lv1-courses.enumerate() {
  course-row(num, name, calc.rem(i, 2) == 0)
}

// ========== LV2 ==========
#pagebreak()

#content-header("2", "懂AI（原理认知篇）")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV2 · 背后的知识 · 20课时]
#v(0.8em)

#let lv2-courses = (
  ("01", "从用到懂-AI是怎么学会的"),
  ("02", "数据是AI的粮食"),
  ("03", "机器学习流程与模型-三范式与经典模型"),
  ("04", "让机器认出猫-图像识别的秘密"),
  ("05", "神经网络的直觉"),
  ("06", "文字怎么变成数字"),
  ("07", "Token之谜-AI眼中的文字"),
  ("08", "Transformer结构与预训练-超级猜词机"),
  ("09", "自注意力机制-如何找重点"),
  ("10", "预训练微调与对齐-训练三部曲"),
  ("11", "大模型简史-从统计到ChatGPT"),
  ("12", "幻觉的根源-AI为什么会胡说"),
  ("13", "大模型的超能力-越大越聪明"),
  ("14", "解码部署与评测-模型的生命周期"),
  ("15", "主流模型架构对比-模型家族地图"),
  ("16", "AI编程初探-机器怎么学会写代码"),
  ("17", "高效微调-训练我的专属模型"),
  ("18", "动手实验-看见模型的注意力"),
  ("19", "复盘-画出你心中的AI原理图"),
  ("20", "原理认知测验"),
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

#content-header("4", "思辨AI（素养未来篇）")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV4 · 与AI共处 · 20课时]
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

#feature("🎯", "先用后懂", "先从\"用AI\"开始，在真实场景中建立信心与兴趣，再深入\"AI背后的知识\"，由表及里。")
#feature("🧰", "场景驱动", "写作、绘画、办公、学习、创作……每课一个真实场景，学完就能用。")
#feature("🛠", "动手贯穿", "从提示词到API到Agent，每级都有实操项目，边做边学，做中学。")
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
      columns: (1fr, auto, 1fr, auto, 1fr, auto, 1fr),
      column-gutter: 0.5em,
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: primary-color, align(center, [
          #text(size: 16pt, weight: "bold", fill: white)[LV1]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#bbdefb"))[用AI]
        ]))
      ]),
      align(center + horizon, text(size: 20pt, fill: black)[→]),
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: success-color, align(center, [
          #text(size: 16pt, weight: "bold", fill: white)[LV2]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#c8e6c9"))[懂AI]
        ]))
      ]),
      align(center + horizon, text(size: 20pt, fill: black)[→]),
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: accent-color, align(center, [
          #text(size: 16pt, weight: "bold", fill: white)[LV3]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#ffe0b2"))[创造]
        ]))
      ]),
      align(center + horizon, text(size: 20pt, fill: black)[→]),
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: error-color, align(center, [
          #text(size: 16pt, weight: "bold", fill: white)[LV4]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#ffcdd2"))[思辨]
        ]))
      ]),
    )
  ]
))
