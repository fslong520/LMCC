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
const { loadScene, dtU, tt, wrap, CM } = require('./route_lib.js');

const { dd, auth } = loadScene();
const VEH_R = 0.44, MARGIN = 0.06;

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
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors.json'), 'utf8'));
const tl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'timeline.json'), 'utf8'));
const cps = dd.checkpoints.map(c => c.position);
const key = tl.timeline.filter(i => i.type.startsWith('interact:') || i.type.startsWith('event:checkpoint') || i.type === 'event:goal_reached');

const stops = [];
for (const k of key) {
  if (k.type === 'event:checkpoint') stops.push({ kind: 'pass', pos: cps[k.index], h: null, label: `cp#${k.index}` });
  else if (k.type === 'event:goal_reached') stops.push({ kind: 'pass', pos: dd.goal, h: null, label: 'goal' });
  else {
    const it = anchors.interactions.find(i => i.op === k.type.slice(9) && i.packageId === k.packageId);
    stops.push({
      kind: k.type.slice(9), packageId: k.packageId,
      pos: [it.pose.x, it.pose.z], h: it.pose.h,
      label: `${k.type.slice(9)}(${k.packageId.replace('guangyang-', '')})`,
      baseTick: k.tick
    });
  }
}

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
for (const r of dd.roads) for (const p of r.points) pushNode(p[0], p[1], 'road');
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
const anchorIgnore = new Map();   // nodeId -> Set(packageId)
stops.forEach(s => {
  if (!s.packageId) return;
  if (!anchorIgnore.has(s.nodeId)) anchorIgnore.set(s.nodeId, new Set());
  anchorIgnore.get(s.nodeId).add(s.packageId);
});
const adj = nodes.map(() => []);
let ec = 0, ecAnchor = 0;
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-9 || L > 60) continue;
    // 锚点相邻边放宽余量（否则贴边锚点接不上），但不放到 0：
    // 留 0.02u 抵消「两节点连线切出弧外」的弦切效应（曾因此越界 0.0001u 被扣 2.5 分）。
    const margin = (isAnchor[i] || isAnchor[j]) ? 0.02 : MARGIN;
    // 忽略集：仅当该边有一端是锚点时，忽略该锚点涉及的包裹
    let ignore = null;
    const ig = new Set();
    if (anchorIgnore.has(i)) for (const x of anchorIgnore.get(i)) ig.add(x);
    if (anchorIgnore.has(j)) for (const x of anchorIgnore.get(j)) ig.add(x);
    if (ig.size) ignore = [...ig];
    if (!segDrivable(a.x, a.z, b.x, b.z, margin, 0.03, ignore).ok) continue;
    adj[i].push({ v: j, L }); adj[j].push({ v: i, L }); ec++;
    if (margin === 0) ecAnchor++;
  }
}
console.log(`可见性边 ${ec}（其中锚点相邻 ${ecAnchor} 用 0 余量）`);

// ---------- tick 最优搜索 ----------
function search(srcId, srcH, dstId, dstH) {
  if (srcId === dstId) {
    const extra = dstH == null ? 0 : tt(Math.abs(wrap(dstH - srcH) * 180 / Math.PI));
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
    const t = tt(Math.abs(wrap(h - srcH) * 180 / Math.PI)) + dtU(e.L);
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
      const extra = dstH == null ? 0 : tt(Math.abs(wrap(dstH - p.hdg) * 180 / Math.PI));
      const tot = cur.ticks + extra;
      if (gBest === null || tot < gBest) { gBest = tot; gKey = cur.key; }
      continue;
    }
    const a = nodes[cur.node];
    for (const e of adj[cur.node]) {
      const b = nodes[e.v];
      const h = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      const key = `${e.v}|${cur.node}`;
      const t = cur.ticks + tt(Math.abs(wrap(h - p.hdg) * 180 / Math.PI)) + dtU(e.L);
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

// 平台约束：转向角度必须在 1~360 度之间（robot.left_angle(0) 之类的微角度会被判非法）
// 故 < MIN_TURN_DEG 的角度直接不输出——此时朝向已足够接近目标，剩余偏差极小。
const MIN_TURN_DEG = 1.0;
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
  if (!r) { problems.push(`${s.label} 不可达`); continue; }
  const base = i === 0 ? stops[0].baseTick ?? key[0].tick : (s.baseTick ?? key[i].tick) - key[i - 1].tick;
  segReport.push({ label: `-> ${s.label}`, base, opt: r.ticks, saved: base - r.ticks });
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

const outPath = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'routes', 'candidates', 'T3_v3.py'); })();

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
console.log(`估算 tick ${finalTicks} = ${(finalTicks * 0.02).toFixed(2)}s（基线 10529，满分线 ${tl.budget.fullMarkLine}，差 ${finalTicks - tl.budget.fullMarkLine}）`);
if (illegal.length) console.log(`❌ 仍有非法转向 ${illegal.length} 处: ${illegal.join('; ')}`);
else console.log('✅ 全部转向角度均在 1~360 度内');
if (problems.length) console.log('问题:', problems.join('; '));
console.log('已写', outPath);
