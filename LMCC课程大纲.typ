// ============================================================
// CCF大模型能力认证（LMCC）课程大纲
// 智国学堂 TeachZero · 出品
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
      align(right, text(size: 8pt, fill: rgb("#bbb"))[LMCC 课程大纲]),
    )
  },
  numbering: none,
  fill: white,
)

#set text(font: ("LXGW WenKai Mono GB", "Noto Sans CJK SC"), size: 11pt, fill: black)
#set par(first-line-indent: 0em)

#content-header("1", "人工智能与AI基础")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV1 · 基础素养篇 · 20课时]
#v(0.8em)

#let lv1-courses = (
  ("01", "人工智能是什么"),
  ("02", "人工智能应用领域"),
  ("03", "机器学习基本概念"),
  ("04", "机器学习经典模型"),
  ("05", "深度学习入门"),
  ("06", "自然语言处理基础"),
  ("07", "大模型发展简史"),
  ("08", "大模型的超能力"),
  ("09", "提示词工程入门"),
  ("10", "思维链与推理"),
  ("11", "大模型API调用实践"),
  ("12", "Python编程基础"),
  ("13", "Python数据处理"),
  ("14", "认识Transformer"),
  ("15", "主流大模型介绍"),
  ("16", "LMCC认证概览"),
  ("17", "LMCC第一轮考点解析"),
  ("18", "综合练习与评测"),
  ("19", "阶段性项目：AI聊天机器人"),
  ("20", "单元总结与测验"),
)

#for (i, (num, name)) in lv1-courses.enumerate() {
  course-row(num, name, calc.rem(i, 2) == 0)
}

// ========== LV2 ==========
#pagebreak()

#content-header("2", "大模型核心技术")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV2 · 模型原理篇 · 20课时]
#v(0.8em)

#let lv2-courses = (
  ("01", "Transformer架构详解"),
  ("02", "自注意力机制深入"),
  ("03", "位置编码"),
  ("04", "主流模型架构对比"),
  ("05", "预训练数据处理"),
  ("06", "Tokenization技术"),
  ("07", "预训练任务与目标"),
  ("08", "Scaling Law与涌现"),
  ("09", "指令微调SFT"),
  ("10", "高效微调技术"),
  ("11", "微调实践（上）"),
  ("12", "微调实践（下）"),
  ("13", "人类对齐RLHF"),
  ("14", "对齐技术进阶"),
  ("15", "模型安全对齐"),
  ("16", "解码策略"),
  ("17", "推理加速技术"),
  ("18", "模型量化与部署"),
  ("19", "实践：模型部署"),
  ("20", "单元总结与测验"),
)

#for (i, (num, name)) in lv2-courses.enumerate() {
  course-row(num, name, calc.rem(i, 2) == 0)
}

// ========== LV3 ==========
#pagebreak()

#content-header("3", "进阶应用与开发")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV3 · 应用实战篇 · 20课时]
#v(0.8em)

#let lv3-courses = (
  ("01", "提示工程进阶"),
  ("02", "RAG技术原理"),
  ("03", "RAG实践"),
  ("04", "高级RAG技术"),
  ("05", "Function Calling"),
  ("06", "Agent架构设计"),
  ("07", "Agent开发实战"),
  ("08", "多Agent协作"),
  ("09", "复杂推理技术"),
  ("10", "代码生成与执行"),
  ("11", "LMCC第二轮编程题解析"),
  ("12", "API开发"),
  ("13", "模型评估与测试"),
  ("14", "RAG应用项目：知识库问答"),
  ("15", "Agent应用项目：自动化工作流"),
  ("16", "模型微调项目"),
  ("17", "模型评测项目"),
  ("18", "部署运维实践"),
  ("19", "综合项目：端到端AI应用"),
  ("20", "单元总结与项目展示"),
)

#for (i, (num, name)) in lv3-courses.enumerate() {
  course-row(num, name, calc.rem(i, 2) == 0)
}

// ========== LV4 ==========
#pagebreak()

#content-header("4", "伦理安全与认证冲刺")
#v(0.3em)
#text(size: 10pt, fill: rgb("#888"))[LV4 · 认证冲刺篇 · 20课时]
#v(0.8em)

#let lv4-courses = (
  ("01", "模型评测体系"),
  ("02", "主流基准测试"),
  ("03", "评测实践"),
  ("04", "模型伦理概论"),
  ("05", "模型偏见与公平"),
  ("06", "模型幻觉"),
  ("07", "模型安全"),
  ("08", "AI治理与法规"),
  ("09", "多模态模型基础"),
  ("10", "多模态应用"),
  ("11", "LMCC第一轮总复习"),
  ("12", "LMCC第一轮模拟考"),
  ("13", "第一轮真题精讲（2025）"),
  ("14", "LMCC第二轮编程准备"),
  ("15", "LMCC第二轮模拟考"),
  ("16", "第二轮真题精讲（2025）"),
  ("17", "高频考点与易错点"),
  ("18", "考试技巧与策略"),
  ("19", "综合模拟考"),
  ("20", "考前冲刺与答疑"),
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

#feature("🎯", "体系完整", "从AI基础到认证冲刺，4级80课时一站式覆盖，零基础直达认证。")
#feature("🔬", "理实并重", "每级别含实操项目。API调用、模型微调、Agent开发，学完就能用。")
#feature("📐", "紧扣考纲", "覆盖LMCC第一轮客观题与第二轮编程题全部考点，真题直击高频。")
#feature("👥", "双组通用", "青少年组（LMCC-T）与成人组（LMCC-A）一套课程，灵活适配。")

// ========== 备考路径 ==========
#v(2em)

#text(size: 18pt, weight: "bold", fill: black)[备考路径]
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
          #text(size: 9pt, fill: rgb("#bbdefb"))[基础]
        ]))
      ]),
      align(center + horizon, text(size: 20pt, fill: black)[→]),
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: success-color, align(center, [
          #text(size: 16pt, weight: "bold", fill: white)[LV2]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#c8e6c9"))[原理]
        ]))
      ]),
      align(center + horizon, text(size: 20pt, fill: black)[→]),
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: accent-color, align(center, [
          #text(size: 16pt, weight: "bold", fill: white)[LV3]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#ffe0b2"))[实战]
        ]))
      ]),
      align(center + horizon, text(size: 20pt, fill: black)[→]),
      align(center + horizon, [
        #block(width: 100%, inset: 0.6em, radius: 0pt, fill: error-color, align(center, [
          #text(size: 16pt, weight: "bold", fill: white)[LV4]
          #v(0.1em)
          #text(size: 9pt, fill: rgb("#ffcdd2"))[冲刺]
        ]))
      ]),
    )
  ]
))
