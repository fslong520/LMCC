#!/usr/bin/env node
// 任务3 路线生成器 v3 —— 锚点冻结，只优化锚点之间的路径
//
// 设计取舍（基于前两次失败的教训）：
//   v1/v2 试图自己反解抓放站位，结果撞上两类硬约束：
//     ① 抓取时机敏（forward 必须落在 [0.38,1.35]，且 target 须比障碍物更近）
//     ② 混淆物投放点必须在路外（路缘净空 ≥0.2），与「路径可行驶」相冲突
//   故本版**冻结全部 12 个交互位姿为基线已验证值**（位置与朝向逐位照抄），
//   只把锚点之间的行驶路径改为走廊可见性图上的 tick 最优解。
//   检查点保持原序，终点不变。
//
// 代价模型（经真机 179 条控制指令逐条验证，转向/行驶偏差均为 0）：
//   forward(u) = max(1, ceil(u/0.025))              tick
//   turn(deg)  = ceil( max(260, deg/2.8*1000)/20 )  tick（转向期间零位移）
//
// 用法: node tools/generate3.js [--out routes/candidates/T3_v3.py]
'use strict';
const fs = require('fs');
const path = require('path');
const { dtU, tt, wrap, CM } = require('../tools/route_lib.js');
const DATA2 = path.join(__dirname, '..', 'data2');
const dd = JSON.parse(fs.readFileSync(path.join(DATA2, 'scene_task2.json'), 'utf8'));
const interDef = JSON.parse(fs.readFileSync(path.join(DATA2, 'inter_task2.json'), 'utf8'));
const auth = { packages: interDef.packages, inter: interDef };
// MARGIN 0.06：T2_v1（98.3 分、13/13、0 越界、0 碰撞）验证值。
// 曾试 0.13，反而重排路线、首段就撞上 distractor-2（12 次碰撞 / 4926 碰撞帧 / 21.2 分）——
// 提高走廊余量不等于提高安全性，它只改变可行边集合，会把路线推向障碍。
// ANCHOR_MARGIN 0.02：曾试 0.09，锚点贴边致整站不可达，被 generate2.js 静默跳过。
const VEH_R = 0.44, MARGIN = 0.06, ANCHOR_MARGIN = 0.02;
// 平台约束：转向角度必须在 1~360 度之间，<1° 的角度前端直接判非法且不中断执行，
// 会让后续指令全线错位。故所有 <1° 的转向一律不输出。
const MIN_TURN_DEG = 1.0;

// 搜索用的转向代价 = 真实 tick + 大角度罚金。
// 依据（真机 179 条指令逐条验证）：tt(deg)=ceil(max(260,deg/2.8*1000)/20)，
// 即 tt(<41.7°)=13、tt(90°)=29、tt(180°)=57。180° 仅比小转贵 4.4 倍，
// 单看 tick 会鼓励「掉头式绕路」——基线 46 次转向中仅 1 次 >120°、0 次 180°。
// 故对 >90° 加罚，让搜索偏好多个小转、避免大幅转向。
const turnCost = d => {
  if (d < MIN_TURN_DEG) return 0;
  let c = tt(d);                      // 基底用真实 tick（单一事实源），勿在此复刻公式
  if (d > 90) c += (d - 90) * 0.5;
  if (d > 120) c += (d - 120) * 1.5;
  return c;
};

// ---------- 几何精确可行域（含障碍物与包裹堆）----------
const SEGS = [];
for (const r of dd.roads) {
  const allow = r.width / 2 - VEH_R - MARGIN;
  if (allow <= 0) continue;
  for (let i = 0; i < r.points.length - 1; i++) {
    SEGS.push({ ax: r.points[i][0], az: r.points[i][1], bx: r.points[i + 1][0], bz: r.points[i + 1][1], allow });
  }
}
const segDistPt = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};
function marginAt(x, z) {
  let best = -Infinity;
  for (const s of SEGS) { const m = s.allow - segDistPt(x, z, s.ax, s.az, s.bx, s.bz); if (m > best) best = m; }
  return best;
}

// 实体障碍：障碍物（半径 0.52）+ 包裹堆（半径 0.28）
// 注意数据源：障碍物只出现在 auth.inter.packages，不在 auth.packages
const SKIN = 0.005, OBS_MARGIN = 0.06;
const ALL_PKG = auth.inter.packages;
const blockers = [];
for (const p of ALL_PKG) {
  const isObs = p.role === 'obstacle';
  blockers.push({
    x: p.x, z: p.z,
    r: (p.radius ?? (isObs ? 0.52 : 0.28)) + VEH_R + SKIN + OBS_MARGIN,
    id: p.id, isObstacle: isObs
  });
}
console.log(`实体障碍 ${blockers.length}（障碍物 ${blockers.filter(b => b.isObstacle).length}，包裹堆 ${blockers.filter(b => !b.isObstacle).length}）`);
// 允许「本段要抓取/投放的那个包裹」被忽略（贴近作业点时必须能靠近）
function blockersFor(ignoreIds) {
  const ign = new Set(ignoreIds || []);
  return blockers.filter(b => !ign.has(b.id));
}
function clearOfBlockers(x, z, bl) {
  for (const b of bl) if (Math.hypot(b.x - x, b.z - z) < b.r) return false;
  return true;
}
const drivable = (x, z) => marginAt(x, z) >= 0;
// 采样步长收紧到 0.008：曾因步长 0.03 漏过一次仅 0.0001 单位的越界，
// 而平台按 20ms 步长逐帧判定，任何超界都会扣 2.5 分。宁可多算，不可漏判。
function segDrivable(ax, az, bx, bz, margin = MARGIN, step = 0.008, ignoreIds = null) {
  const bl = ignoreIds ? blockersFor(ignoreIds) : blockers;
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(L / step));
  let worst = Infinity;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    const m = marginAt(px, pz) + (MARGIN - margin);
    if (m < worst) worst = m;
    if (m < -1e-9) return { ok: false, worst };
    if (!clearOfBlockers(px, pz, bl)) return { ok: false, worst };
  }
  return { ok: true, worst };
}

// ---------- 锚点：冻结基线交互位姿 ----------
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors2.json'), 'utf8'));
const cps = dd.checkpoints.map(c => c.position);

// 交互位姿表（冻结基线已验证值）
const grabPose = {}, relPose = {};
for (const it of anchors.interactions) (it.op === 'release' ? relPose : grabPose)[it.packageId] = { pos: [it.pose.x, it.pose.z], h: it.pose.h };

// 显式顺序（可用 GY_ORDER 覆盖；缺省为基线顺序）
// 顺序由 tools2/solve2d.js 的「顺序×路径」联合搜索给出：检查点按 0..5，包裹取放自由穿插。
const DEFAULT_ORDER = process.env.GY_ORDER || [
  'cp#0', 'cp#1', 'cp#2',
  'grab:guangyang-target-1', 'cp#3', 'cp#4', 'drop:guangyang-target-1',
  'grab:guangyang-distractor-1', 'drop:guangyang-distractor-1',
  'grab:guangyang-distractor-2', 'drop:guangyang-distractor-2',
  'cp#5',
  'grab:guangyang-target-2', 'drop:guangyang-target-2',
  'goal'
].join(',');

const stops = [];
for (const tok of DEFAULT_ORDER.split(',')) {
  const t = tok.trim();
  if (t.startsWith('cp#')) {
    const i = +t.slice(3);
    stops.push({ kind: 'pass', pos: dd.checkpoints[i].position, h: null, label: t });
  } else if (t === 'goal') {
    stops.push({ kind: 'pass', pos: dd.goal, h: null, label: 'goal' });
  } else if (t.startsWith('grab:') || t.startsWith('drop:')) {
    const op = t.startsWith('grab:') ? 'grab' : 'release';
    const id = t.slice(5);
    const pose = op === 'grab' ? grabPose[id] : relPose[id];
    stops.push({ kind: op, packageId: id, pos: pose.pos, h: pose.h, label: `${op}(${id.replace('guangyang-', '')})` });
  }
}
console.log('锚点序列:', stops.map(s => s.label).join(' -> '));

// 校验：每个锚点须可行驶
console.log('=== 锚点可行性校验（冻结基线位姿）===');
let badAnchors = 0;
for (const s of stops) {
  if (s.kind === 'pass') continue;
  const m = marginAt(s.pos[0], s.pos[1]);
  if (m < 0) { console.log(`  ✗ ${s.label} 余量 ${m.toFixed(4)}（路外）`); badAnchors++; }
}
console.log(badAnchors === 0 ? '  全部锚点位于可行域内' : `  ${badAnchors} 个锚点在可行域外`);

// ---------- 节点集：道路折线节点 + 所有锚点 + 起终点 ----------
const nodes = [];
const pushNode = (x, z, tag) => {
  for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < 0.02) { n.tag += ',' + tag; return n; }
  const n = { id: nodes.length, x, z, tag };
  nodes.push(n); return n;
};
// 节点：道路折线按 SAMPLE 采样（与 solve2d.js 保持一致，否则顺序搜索的结论无法复现）
// GY_SAMPLE 缺省 0.25；GY_SPARSE=1 时只用折线顶点（旧的 160 节点图）
const SPARSE = process.env.GY_SPARSE === '1';
const SAMPLE = Number(process.env.GY_SAMPLE || 0.25);
for (const r of dd.roads) {
  const pts = r.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    if (SPARSE) { pushNode(ax, az, 'road'); pushNode(bx, bz, 'road'); continue; }
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / SAMPLE));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (marginAt(x, z) >= 0) pushNode(x, z, 'road');
    }
  }
}
stops.forEach((s, i) => { s.nodeId = pushNode(s.pos[0], s.pos[1], `stop${i}`).id; });
const startNodeId = pushNode(dd.start.x, dd.start.z, 'start').id;

console.log(`几何段 ${SEGS.length}，节点 ${nodes.length}`);

// 可见性边（放宽上限以容纳长直段）
// 余量策略：锚点相邻的边用 0 余量（锚点位姿是基线已验证的合法位姿，
// 投放点本就贴路缘，不能按保守余量判掉）；其余边保留 MARGIN 安全余量。
//
// 障碍集按任务进度动态维护：
//   抓走某包裹 → 该堆从世界移除；投放后 → 按落点加回。
//   接近某个锚点时，允许忽略「即将抓取/投放的那个包裹」（否则贴不上去）。
const isAnchor = new Array(nodes.length).fill(false);
stops.forEach(s => { isAnchor[s.nodeId] = true; });
// 锚点自身允许贴近其涉及的包裹：为该锚点单独定义「忽略集」= 该锚点涉及的包裹
// 方向性忽略集：图是无向的，但「包裹在不在地上」是**状态**。
//   进入 grab(X) 锚点：X 还在地上  → 入边不可忽略
//   离开 grab(X) 锚点：X 已在手中  → 出边可忽略
//   进入 release(X) 锚点：X 在手中 → 入边可忽略
//   离开 release(X) 锚点：X 已落地 → 出边不可忽略
// 此前用「边的一端是锚点即忽略」的无向规则，两个症状同源：
//   ① 去往检查点的**途经边**也放行 → 横穿仍在地面的 distractor-2 → tick 1155 首撞、
//      车被推离规划位姿、后续 8 个交互连拒（T2_v9/T2_v11 仅 2/13）；
//   ② 完全不忽略 → 去 cp#3 的边被**已在手中**的 target-1 挡死 → 3 站不可达。
const grabOut = new Map(), releaseIn = new Map();
const pushInto = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
stops.forEach(s => {
  if (!s.packageId) return;
  if (s.kind === 'grab') pushInto(grabOut, s.nodeId, s.packageId);
  else if (s.kind === 'release') pushInto(releaseIn, s.nodeId, s.packageId);
});
const anchorIgnore = grabOut;   // 兼容：仅在诊断处引用
// 站点不可达时，报告「差一点」的候选边——分清是走廊不够宽，还是实体障碍挡路。
// 只报前 5 条最接近可行的，避免刷屏。
function diagnoseUnreachable(s) {
  const ai = s.nodeId;
  const A = nodes[ai];
  if (!A) { console.log(`  [诊断] ${s.label}: 节点 ${ai} 不存在`); return; }
  console.log(`  [诊断] ${s.label}: 锚点 (${A.x.toFixed(3)},${A.z.toFixed(3)})  当前位置 (${curPos[0].toFixed(3)},${curPos[1].toFixed(3)})`);
  const cand = [];
  for (let j = 0; j < nodes.length; j++) {
    if (j === ai) continue;
    const B = nodes[j];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    if (L > 60) continue;
    // 逐段量出「最紧余量」：走廊与每个实体障碍各算一次，取最差者
    const n = Math.max(2, Math.ceil(L / 0.01));
    let worstRoad = Infinity, worstObs = { d: Infinity, id: null };
    for (let k = 0; k <= n; k++) {
      const t = k / n, px = A.x + (B.x - A.x) * t, pz = A.z + (B.z - A.z) * t;
      worstRoad = Math.max(worstRoad, marginAt(px, pz));   // 越靠 0 越险
      for (const b of blockers) {
        const d = Math.hypot(px - b.x, pz - b.z) - b.r;
        if (d < worstObs.d) worstObs = { d, id: b.id };
      }
    }
    // 复刻 segDrivable 的接受条件，给出「为什么被拒」
    const margin = (isAnchor[ai] || isAnchor[j]) ? ANCHOR_MARGIN : MARGIN;
    const roadOk = worstRoad + (MARGIN - margin) >= -1e-9;
    const obsOk = worstObs.d >= 0;
    cand.push({ j, L, worstRoad, worstObs, roadOk, obsOk, ok: roadOk && obsOk });
  }
  const bad = cand.filter(c => !c.ok).sort((a, b) => (a.ok - b.ok) || (b.L - a.L));
  if (!bad.length) { console.log(`    所有 ${cand.length} 条候选边在 segDrivable 中均通过——问题在搜索本身（朝向/代价），非几何`); return; }
  console.log(`    候选 ${cand.length} 条，其中不可行 ${bad.length}。最接近可行的 5 条:`);
  for (const c of bad.slice(0, 5)) {
    const why = [];
    if (!c.roadOk) why.push(`走廊不足 需≥${((isAnchor[ai] || isAnchor[c.j]) ? ANCHOR_MARGIN : MARGIN).toFixed(2)} 实际最差 ${c.worstRoad.toFixed(4)}`);
    if (!c.obsOk) why.push(`实体障碍 ${c.worstObs.id} 余量 ${c.worstObs.d.toFixed(4)}(负=侵入)`);
    console.log(`      ↔ node${c.j} (${nodes[c.j].x.toFixed(2)},${nodes[c.j].z.toFixed(2)}) L=${c.L.toFixed(2)}: ${why.join(' | ')}`);
  }
}
const adj = nodes.map(() => []);   // 有向：adj[i] 是从 i 出发的边
let ec = 0, ecAnchor = 0;
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-9 || L > 60) continue;
    const margin = (isAnchor[i] || isAnchor[j]) ? ANCHOR_MARGIN : MARGIN;
    // 出边 i→j：可忽略 grabOut(i)（从 i 出发时 X 已在手）与 releaseIn(j)（到 j 放下时 X 在手）。
    // 这样既不会横穿仍在地面的包裹，也不会被手中包裹挡死——两个症状同源同解。
    const ignIJ = [...(grabOut.get(i) || []), ...(releaseIn.get(j) || [])];
    const ignJI = [...(grabOut.get(j) || []), ...(releaseIn.get(i) || [])];
    if (segDrivable(a.x, a.z, b.x, b.z, margin, 0.01, ignIJ.length ? ignIJ : null).ok) {
      adj[i].push({ v: j, L }); ec++;
    }
    if (segDrivable(a.x, a.z, b.x, b.z, margin, 0.01, ignJI.length ? ignJI : null).ok) {
      adj[j].push({ v: i, L }); ec++;
    }
    if (margin === ANCHOR_MARGIN) ecAnchor++;
  }
}
console.log(`可见性边 ${ec}（有向，其中锚点相邻 ${ecAnchor} 次用 0 余量）`);

// ---------- tick 最优搜索 ----------
function search(srcId, srcH, dstId, dstH) {
  if (srcId === dstId) {
    const extra = dstH == null ? 0 : turnCost(Math.abs(wrap(dstH - srcH) * 180 / Math.PI));
    return { ticks: extra, path: [srcId] };
  }
  const best = new Map(), prev = new Map(), pq = [];
  const push = it => { pq.push(it); let i = pq.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (pq[p].ticks <= pq[i].ticks) break; [pq[p], pq[i]] = [pq[i], pq[p]]; i = p; } };
  const pop = () => { const top = pq[0], last = pq.pop();
    if (pq.length) { pq[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < pq.length && pq[l].ticks < pq[m].ticks) m = l;
        if (r < pq.length && pq[r].ticks < pq[m].ticks) m = r;
        if (m === i) break; [pq[m], pq[i]] = [pq[i], pq[m]]; i = m; } }
    return top; };
  const s = nodes[srcId];
  for (const e of adj[srcId]) {
    const b = nodes[e.v];
    const h = Math.atan2(-(b.x - s.x), -(b.z - s.z));
    const key = `${e.v}|${srcId}`;
    const t = turnCost(Math.abs(wrap(h - srcH) * 180 / Math.PI)) + dtU(e.L);
    if (!best.has(key) || t < best.get(key) - 1e-9) {
      best.set(key, t); prev.set(key, { back: null, hdg: h });
      push({ key, node: e.v, ticks: t });
    }
  }
  let gBest = null, gKey = null;
  while (pq.length) {
    const cur = pop();
    if (cur.ticks > (best.get(cur.key) ?? 1e18) + 1e-9) continue;
    const p = prev.get(cur.key);
    if (cur.node === dstId) {
      const extra = dstH == null ? 0 : turnCost(Math.abs(wrap(dstH - p.hdg) * 180 / Math.PI));
      const tot = cur.ticks + extra;
      if (gBest === null || tot < gBest) { gBest = tot; gKey = cur.key; }
      continue;
    }
    const a = nodes[cur.node];
    // 作业锚点不得被「途经」：忽略状态挂在节点上，而非挂在「是否按序执行了该站」上。
    // 若 Dijkstra 把 grab(X) 锚点当普通中转，进入边需避开 X（X 不在忽略集），
    // 但离开边的忽略集含 grabOut(锚点)={X} 于是放行穿越——路径从未抓 X，X 仍在地面，
    // 即 T2_v12 line 39 撞 distractor-2（碰撞点距该锚点仅 0.286）的确切成因。
    // 故只允许「段起点」srcId 从作业锚点出发，其余到达作业锚点一律不再延展
    // （终点 dstId 已在上面 continue，不受影响）。
    if (cur.node !== srcId && (grabOut.has(cur.node) || releaseIn.has(cur.node))) continue;
    // 禁止折返到「刚经过的节点」：可见性图允许 A->B->A，
    // 该路径在 tick 模型里便宜（180° 仅 57 tick），但真实执行会原路撞上刚绕过的障碍。
    const backNode = Number(cur.key.split('|')[1]);
    for (const e of adj[cur.node]) {
      if (e.v === backNode) continue;
      const b = nodes[e.v];
      const h = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      const key = `${e.v}|${cur.node}`;
      const t = cur.ticks + turnCost(Math.abs(wrap(h - p.hdg) * 180 / Math.PI)) + dtU(e.L);
      if (!best.has(key) || t < best.get(key) - 1e-9) {
        best.set(key, t); prev.set(key, { back: cur.key, hdg: h });
        push({ key, node: e.v, ticks: t });
      }
    }
  }
  if (gKey === null) return null;
  const path = []; let k = gKey;
  while (k) { path.push(Number(k.split('|')[0])); const p = prev.get(k); if (!p) break; k = p.back; }
  path.reverse();
  return { ticks: gBest, path };
}

// ---------- 生成指令 ----------
const lines = [];
let ticks = 0, curH = dd.start.h;
let curPos = [dd.start.x, dd.start.z];
let curNode = startNodeId;
const problems = [];
const segReport = [];

function emitTurnTo(want) {
  const dv = wrap(want - curH);
  const deg = Math.abs(dv * 180 / Math.PI);
  if (deg < MIN_TURN_DEG) return;          // 低于平台下限，跳过（不改变 curH，后续按实际朝向推进）
  if (deg > 360) { lines.push(`robot.${dv > 0 ? 'left_angle' : 'right_angle'}(180.0000)`); ticks += tt(180); curH = wrap(curH + (dv > 0 ? Math.PI : -Math.PI)); return; }
  lines.push(`robot.${dv > 0 ? 'left_angle' : 'right_angle'}(${deg.toFixed(4)})`);
  ticks += tt(deg); curH = wrap(curH + dv);
}
function emitForward(L) {
  if (L <= 1e-4) return;
  lines.push(`robot.forward(${(L * CM).toFixed(4)})`);
  ticks += dtU(L);
  curPos = [curPos[0] - Math.sin(curH) * L, curPos[1] - Math.cos(curH) * L];
}

// 段起点接入：锚点可能不在端点节点上（此处锚点即节点，故无需额外接入）
for (let i = 0; i < stops.length; i++) {
  const s = stops[i];
  const r = search(curNode, curH, s.nodeId, s.h);
  if (!r) { problems.push(`${s.label} 不可达`); diagnoseUnreachable(s); continue; }
  segReport.push({ label: `-> ${s.label}`, base: 0, opt: r.ticks, saved: 0 });
  for (const nid of r.path) {
    const n = nodes[nid];
    const L = Math.hypot(n.x - curPos[0], n.z - curPos[1]);
    if (L > 1e-4) {
      emitTurnTo(Math.atan2(-(n.x - curPos[0]), -(n.z - curPos[1])));
      emitForward(L);
    }
  }
  if (s.h != null) emitTurnTo(s.h);
  else if (r.path.length) {
    // 无朝向要求时保持当前朝向即可
  }
  if (s.kind === 'grab') { lines.push('robot.grab()'); ticks += 38; }
  else if (s.kind === 'release') { lines.push('robot.release()'); ticks += 34; }
  curNode = s.nodeId;
}

const outPath = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'routes', 'candidates', 'T2_v1.py'); })();

// ---------- 后处理：消除平台不接受的微角度转向 ----------
// 平台前端要求转向角度在 1~360 度之间（core.js 仿真内核只校验 >0 与 ≤360，
// 不含 1 度下限，故纯离线重放不会报错——本项目的重放器已补上该校验）。
// 微角度产生于「路径末段朝向」与「作业锚点朝向」的细微差，量级通常 <1°。
// 策略：直接丢弃该转向（不改变当前朝向）。因偏差 <1°，后续位移偏差在厘米以下；
// 弃用后须经重放器验证越界与分数，不可只凭估算。
function dropSmallTurns(src) {
  const out = [];
  let dropped = 0;
  for (const l of src) {
    const m = l.match(/^robot\.(left_angle|right_angle)\(([\d.]+)\)$/);
    if (m) {
      const d = +m[2];
      if (d < 1) { dropped++; continue; }                  // 微角度：丢弃
      if (d > 360) {                                        // 超上限：拆成 180+余角
        let rest = d;
        while (rest > 360) { out.push(`robot.${m[1]}(${(rest > 180 ? 180 : rest).toFixed(4)})`); rest -= 180; }
        if (rest >= 1) out.push(`robot.${m[1]}(${rest.toFixed(4)})`);
        continue;
      }
      out.push(`robot.${m[1]}(${d.toFixed(4)})`);
      continue;
    }
    out.push(l);
  }
  return { out, dropped };
}

const { out: merged, dropped: droppedCount } = dropSmallTurns(lines);
// 重算 tick
let finalTicks = 0;
for (const l of merged) {
  let m;
  if ((m = l.match(/^robot\.forward\(([\d.]+)\)$/))) finalTicks += dtU(+m[1] / CM);
  else if ((m = l.match(/^robot\.(left_angle|right_angle)\(([\d.]+)\)$/))) finalTicks += tt(+m[2]);
  else if (l === 'robot.grab()') finalTicks += 38;
  else if (l === 'robot.release()') finalTicks += 34;
}
// 站点不可达即中止：此前 `continue` 会静默跳过该站，照样写出文件，
// 但抓放序列已断——下游包裹永远不释放，后续 grab 全被拒（T2_v8 因此 2/13、15 次越界）。
if (problems.length) {
  console.error(`❌ 中止，不写文件：${problems.join('; ')}`);
  process.exit(1);
}
fs.writeFileSync(outPath, merged.join('\n') + '\n');

// 合法性自检
const illegal = merged.map((l, i) => {
  const m = l.match(/^robot\.(left_angle|right_angle)\(([\d.]+)\)$/);
  if (!m) return null;
  const d = +m[2];
  return (d < 1 || d > 360) ? `line ${i + 1}: ${l}` : null;
}).filter(Boolean);

console.log('\n=== 逐段对比 ===');
for (const r of segReport) console.log(`  ${r.label.padEnd(42)} 基线 ${String(r.base).padStart(5)}  最优 ${String(r.opt).padStart(5)}  省 ${String(r.saved).padStart(5)}`);
const baseSum = segReport.reduce((s, r) => s + r.base, 0), optSum = segReport.reduce((s, r) => s + r.opt, 0);
console.log('─'.repeat(80));
console.log(`  ${'合计'.padEnd(42)} 基线 ${String(baseSum).padStart(5)}  最优 ${String(optSum).padStart(5)}  省 ${String(baseSum - optSum).padStart(5)}`);

console.log(`\n指令 ${merged.length}（转向 ${merged.filter(l => l.includes('angle')).length}，直行 ${merged.filter(l => l.includes('forward')).length}）`);
console.log(`微角度处理：丢弃 ${droppedCount} 处（原始 ${lines.length} → ${merged.length} 行）`);
const FULL_LINE = Math.round(124.8 / 0.02);
console.log(`估算 tick ${finalTicks} = ${(finalTicks * 0.02).toFixed(2)}s（基线 8256，满分线 ${FULL_LINE}，差 ${finalTicks - FULL_LINE}）`);
if (illegal.length) console.log(`❌ 仍有非法转向 ${illegal.length} 处: ${illegal.join('; ')}`);
else console.log('✅ 全部转向角度均在 1~360 度内');
if (problems.length) console.log('问题:', problems.join('; '));
console.log('已写', outPath);
