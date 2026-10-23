# LMCC 广阳岛任务3 路线优化

在不改变任务顺序与作业位姿的前提下，把「逐路网节点绕行」改为「道路走廊内直线行驶」，
使任务3 路线从 98 分提升到 100 分，并减少转向与倒车。

## 结果

| 指标 | 基线 | 本方案 | 变化 |
|---|---|---|---|
| 分数 | 98.0 | **100.0** | +2.0 |
| 用时 | 210.5 s | **196.0 s** | −14.5 s |
| 转向次数 | 70 | **57** | −13 |
| 总转角 | 5049.7° | **4053.7°** | −995.9° |
| 倒车 | 94.1 cm | **0 cm** | −94.1 cm |
| 越界 | 0 | 0 | — |
| 被拒交互 | 0 | 0 | — |
| 完成任务 | 18/18 | 18/18 | — |

均为 `tools/replay.js` 离线重放结果。100 分构成：task 40 + rules 25 + autonomous 15 + efficiency 20。
效率满分线为 196.8 s，本方案 196.0 s 达标。

## 核心发现

1. **可行域是走廊并集，不是路网折线。** 基线沿道路折线逐节点行驶，绕行比达 1.45；
   实际车可在走廊（宽 `width/2 − 0.44`）内任意直线行驶。
2. **转向耗时正比角度，且转向期间零位移**，是纯损耗。
   `turn_angle` 按 `角度 / 2.8 rad/s` 计时，下限 260 ms。
3. **障碍物只在 `auth.inter.packages` 里**，`auth.packages` 仅 6 个包裹、不含 3 个障碍物。
   用错数据源会漏判碰撞（本项目曾因此失败两次）。
4. **抓取选中规则**（`core.js:3047-3133`）：候选按「到车距离」升序，取第一个进入抓取锥者。
   若障碍物比目标物更近且落入锥内，会被判 `not_grabbable`。
5. **混淆物投放点必须在路外**：路缘净空 ≥ 0.2 单位（`placementRule: road-edge-clearance`）。

## 时长模型（经真机 179 条控制指令逐条验证，偏差为 0）

```
forward(u)  = max(1, ceil(u / (1.25 * 0.02)))        tick      (1 tick = 20 ms)
turn(deg)   = ceil(max(260, deg / 2.8 * 1000) / 20)  tick
交互 grab   = 24 + 14 tick（前置 + 后置动画）
交互 release= 13 + 21 tick
```

验证证据：`real_inputs.json` 中 `forward(27.41)→88`、`left_angle(90)→29`、
`forward(106.95)→343`，与模型逐条一致；转向步累计偏差 `-4.26e-14` tick。

## 目录结构

```
data/                    场景数据（来自平台的权威定义）
  auth_scene.json        场景与交互定义（含权障碍物清单）
  scene_task3.json       地图、道路、检查点、交付要求
  full_task3.json        规则与评分定义
  world_task3.json       世界碰撞体
tools/
  replay.js              离线重放器（真相来源）
  core.js                平台仿真内核（只读副本）
  vision-pixel-core.js   内核依赖（只读副本）
  route_lib.js           tick 代价模型与路网图
  extract_anchors.js     导出作业锚点与事件顺序
  timeline.js            导出指令/交互/事件时间线
  verify_timing.js       用真机记录校验时长模型
  check_route.js         重放一个路线并打印完整指标
  generate3.js           路线生成器（走廊可见性图 + tick 最优）
  solve_visibility.js    逐段下界评估（判断还有多少可压缩空间）
  debug_path.js          逐步输出各段路径与位置漂移，用于排障
routes/
  baseline/T3_baseline_98.0.py   云端记录 98.0 分基线
  candidates/T3_best_100.py      本方案（100 分）
  candidates/T3_v1..v4.py        迭代中间产物（含已修正的缺陷，仅作记录）
```

> 迭代记录：v1/v2 未纳入实体障碍（读错数据源，障碍物只在 `inter.packages`），
> v3/v4 修正数据源但余量策略有误，v5 起通过。排障过程见 `debug_path.js`。
> `tools/generate.js`、`tools/generate2.js` 是被 `generate3.js` 取代的早期版本，保留供对照。

## 复现

```bash
cd tools

# 1. 校验时长模型（需真机记录 real_inputs.json）
node verify_timing.js ../routes/baseline/T3_baseline_98.0.py /path/to/real_inputs.json

# 2. 重放基线
node replay.js ../routes/baseline/T3_baseline_98.0.py

# 3. 重放本方案
node replay.js ../routes/candidates/T3_best_100.py

# 4. 重新生成路线
node --max-old-space-size=6144 generate3.js --out ../routes/candidates/T3_new.py
```

## 生成器要点

- **锚点冻结**：12 个抓放位姿逐位照抄基线（基线已被平台接受），只重算锚点之间的路径。
- **节点集**：道路折线节点 + 全部锚点 + 起点终点。
- **连边条件**：两节点间直线全程满足
  ① 在走廊内（`width/2 − 0.44 − 余量`）；
  ② 不侵入任何障碍物或包裹堆（`半径 + 0.44 + skin + 余量`）。
  锚点相邻边放宽余量并忽略该锚点涉及的包裹，否则贴不上作业点。
- **搜索**：Dijkstra，状态为 `(节点, 进入来源)`，代价 `tt(转角) + dtU(距离)`。
- **检查点顺序**不可变（`core.js:2306` 按索引顺序做线段穿圆判定）。

## 注意事项

- `data/` 与 `tools/core.js`、`tools/vision-pixel-core.js` 是平台定义与内核的副本，
  仅供离线复现；**不要修改**，否则重放结论失效。
- 离线重放通过不等于平台成绩；上线前需在平台调试模式复跑一次。
