// ============================================================
// CCF大模型能力认证（LMCC）课程主题 — 智国学堂 TeachZero
// 用法： #import "../../lmcc-theme.typ": *
//        #show: lmcc-theme.with(
//          level: "LV1", lesson: "01",
//          title: "认识人工智能", date: "2026-09"
//        )
// ============================================================

// ========== 色彩定义 ==========
#let primary-color  = rgb("#1a5fb4")   // 深蓝（CCF品牌色）
#let accent-color   = rgb("#e66100")   // 橙色（强调）
#let success-color  = rgb("#26a269")   // 绿色（通过/正确）
#let warning-color  = rgb("#e5a50a")   // 黄色（警告）
#let error-color    = rgb("#c01c28")   // 红色（错误）
#let bg-light       = rgb("#f6f5f4")  // 浅灰背景
#let border-color   = rgb("#deddda")  // 边框色
#let text-color     = rgb("#2e3436")  // 正文色
#let heading-color  = rgb("#1a5fb4")  // 标题色
#let brand-color    = rgb("#5797c3")  // 智国学堂品牌色

// ========== 页面设置 ==========
#set page(
  paper: "a4",
  margin: (top: 2.5cm, bottom: 2cm, left: 2.5cm, right: 2.5cm),
  header: context {
    []
  },
  footer: context {
    align(right, text(size: 8pt, fill: rgb("#aaa"), "智国学堂 TeachZero · LMCC"))
  },
  numbering: "1",
  number-align: center,
)

#set text(
  font: ("Noto Serif CJK SC", "Noto Sans CJK SC"),
  size: 11pt,
  fill: text-color,
  lang: "zh",
)

// ========== 标题层级 ==========
// Typst 0.13 移除了 set heading 的 fill/align 参数，
// 颜色和对齐由下方 show heading 规则单独控制
#set heading(
  numbering: "1.1",
)

#show heading.where(level: 1): it => {
  v(1em)
  block(
    inset: (bottom: 0.3em),
    stroke: (bottom: 2pt + primary-color),
    fill: none,
    text(size: 20pt, weight: "bold", fill: heading-color, it.body)
  )
  v(0.5em)
}

#show heading.where(level: 2): it => {
  v(0.6em)
  text(size: 15pt, weight: "bold", fill: primary-color, it.body)
  v(0.3em)
}

#show heading.where(level: 3): it => {
  text(size: 12pt, weight: "bold", fill: primary-color, it.body)
}

// ========== 段落 ==========
// Typst 0.13 移除了 set paragraph，参数迁移如下
#set par(leading: 0.65em, first-line-indent: 2em)

// ========== 代码块 ==========
#show raw: it => {
  if it.block {
    block(
      fill: bg-light,
      inset: 12pt,
      radius: 4pt,
      stroke: 0.5pt + border-color,
      above: 0.6em,
      below: 0.6em,
      it.body.text(
        size: 9.5pt,
        family: "JuliaMono, 'JetBrains Mono', 'Fira Code', 'Courier New'",
      )
    )
  } else {
    text(size: 9.5pt, fill: rgb("#c01c28"), it.body)
  }
}

// ========== 列表 ==========
#set list(
  body-indent: 1.5em,
  spacing: 0.3em,
)

// ========== 链接 ==========
#show link: it => text(fill: primary-color, deco: underline, it.body)

// ============================================================
// 工具函数
// ============================================================

/// 学习目标框
#let objective(body) = {
  block(
    fill: rgb(216, 232, 248),
    inset: 12pt,
    radius: 4pt,
    stroke: 1pt + primary-color,
    above: 0.8em,
    below: 0.8em,
    [
      *📌 学习目标* \
      #body
    ]
  )
}

/// 核心概念框
#let key-concept(title, body) = {
  block(
    fill: rgb(230, 245, 230),
    inset: 12pt,
    radius: 4pt,
    stroke: 1pt + success-color,
    above: 0.8em,
    below: 0.8em,
    [
      *💡 #title* \
      #body
    ]
  )
}

/// 实操提示框
#let practice(body) = {
  block(
    fill: rgb(255, 245, 220),
    inset: 12pt,
    radius: 4pt,
    stroke: 1pt + accent-color,
    above: 0.8em,
    below: 0.8em,
    [
      *🛠 实操环节* \
      #body
    ]
  )
}

/// 警告/注意框
#let warning(body) = {
  block(
    fill: rgb(252, 235, 235),
    inset: 12pt,
    radius: 4pt,
    stroke: 1pt + error-color,
    above: 0.8em,
    below: 0.8em,
    [
      *⚠️ 注意* \
      #body
    ]
  )
}

/// 题目环境
#let problem(number, body) = {
  v(0.5em)
  text(size: 11pt, weight: "bold", fill: primary-color, [
    第 #number 题
  ])
  body
  v(0.5em)
}

/// 答案环境
#let solution(body) = {
  block(
    fill: bg-light,
    inset: 10pt,
    radius: 4pt,
    stroke: (left: 3pt + success-color),
    above: 0.5em,
    below: 0.5em,
    [
      *解* #body
    ]
  )
}

/// 定义环境
#let definition(body) = {
  block(
    inset: (left: 1em, top: 0.3em, bottom: 0.3em),
    stroke: (left: 3pt + primary-color),
    above: 0.5em,
    below: 0.5em,
    [ #body ]
  )
}

// ============================================================
// 封面模板
// ============================================================
#let cover(level, lesson, title, date, subtitle: none) = {
  v(2em)
  // 智国学堂品牌标识
  v(0.3em)
  align(center, text(size: 13pt, weight: "bold", fill: brand-color, "智国学堂 TeachZero"))
  v(1.5em)
  align(center, text(size: 12pt, fill: primary-color, weight: "bold", level))
  v(0.5em)
  align(center, text(size: 28pt, weight: "bold", fill: heading-color, title))
  v(0.5em)
  if subtitle != none {
    align(center, text(size: 14pt, fill: rgb("#777"), subtitle))
    v(0.5em)
  }
  align(center, text(size: 11pt, fill: rgb("#999"), "第 " + lesson + " 课"))
  v(2em)
  align(center, text(size: 11pt, fill: rgb("#888"), date))
  v(1em)
  align(center, text(size: 10pt, fill: rgb("#aaa"), "CCF大模型能力认证（LMCC）课程体系"))
  v(8em)
}

// ============================================================
// 整体模板（show 规则）
// ============================================================
#let lmcc-theme(
  level: "LV1",
  lesson: "01",
  title: "课程标题",
  date: "2026年9月",
  subtitle: none,
  body,
) = {
  // 封面
  cover(level, lesson, title, date, subtitle: subtitle)
  pagebreak()
  
  // 正文
  set page(numbering: "1")
  body
}
