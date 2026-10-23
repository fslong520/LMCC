#!/usr/bin/env node
// 任务二路线生成器 v3 —— 沿用任务三验证有效的「走廊可见性图」，
// 并修掉 v1 的一处浪费：检查点只需「进入半径 1.05 内」，不必到达圆心。
//
// 做法：
//   ① 节点 = 道路折线节点 + 全部锚点 + 起点 + 每个「过点」的候选门点
//   ② 门点 = 以检查点圆心为心、半径 0.2~0.95 的圆上、且位于走廊内的采样点
//      （圆心本身也作为候选，用于必须直穿的情形）
//   ③ 连边 = 两节点直线全程在走廊内（含余量）且不侵入障碍/包裹堆
//   ④ 代价 = tt(转角) + dtU(距离)（经真机逐条验证的 tick 模型）
//   ⑤ 搜索到「过点」时，取所有门点中最省 tick 的那个
//
// 用法: node tools2/generate2c.js [--out routes2/candidates/T2_v3.py]
'use strict';
const fs = require('fs');
const path = require('path');
const { dtU, tt, wrap, CM } = require('../tools/route_lib.js');

const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const interDef = JSON.parse(fs.readFileSync(path.join(D2, 'inter_task2.json'), 'utf8'));
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors2.json'), 'utf8'));
const VEH_R = 0.44;
const MARGIN = 0.06, ANCHOR_MARGIN = 0.02;

// ---------- 走廊几何 ----------
const SEGS = [];
for (const r of scene.roads) {
  const allow = r.width / 2 - VEH_R;
  if (allow <= 0) continue;
  for (let i = 0; i < r.points.length - 1; i++)
    SEGS.push({ ax: r.points[i][0], az: r.points[i][1], bx: r.points[i + 1][0], bz: r.points[i + 1][1], allow });
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
const SKIN = 0.005, OBS_MARGIN = 0.06;
const blockers = interDef.packages.map(p => ({
  x: p.x, z: p.z, r: (p.r ?? p.radius ?? 0.28) + VEH_R + SKIN + OBS_MARGIN, id: p.id, isObs: p.role === 'obstacle'
}));
console.log(`实体障碍 ${blockers.length}（障碍物 ${blockers.filter(b => b.isObs).length}，包裹堆 ${blockers.filter(b => !b.isObs).length}）`);
const blockersFor = ignore => ignore ? blockers.filter(b => !ignore.includes(b.id)) : blockers;
const clearOf = (x, z, bl) => { for (const b of bl) if (Math.hypot(b.x - x, b.z - z) < b.r) return false; return true; };
function segDrivable(ax, az, bx, bz, margin = MARGIN, step = 0.008, ignore = null) {
  const bl = blockersFor(ignore);
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(L / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    if (marginAt(px, pz) + (MARGIN - margin) < -1e-9) return false;
    if (!clearOf(px, pz, bl)) return false;
  }
  return true;
}

// ---------- 锚点序列 ----------
const cps = scene.checkpoints.map(c => c.position);
const mergedSeq = [...anchors.events.map(e => ({ tick: e.tick, k: 'e', e })),
                   ...anchors.interactions.map(it => ({ tick: it.tick, k: 'i', it }))]
  .sort((a, b) => a.tick - b.tick);
const stops = [];
for (const m of mergedSeq) {
  if (m.k === 'e') {
    if (m.e.type === 'checkpoint') stops.push({ kind: 'pass', pos: cps[m.e.index], h: null, label: `cp#${m.e.index}`, tick: m.e.tick, radius: scene.checkpointRadius });
    else if (m.e.type === 'goal_reached') stops.push({ kind: 'pass', pos: scene.goal, h: null, label: 'goal', tick: m.e.tick, radius: scene.goalRadius });
  } else {
    stops.push({ kind: m.it.op, packageId: m.it.packageId, pos: [m.it.pose.x, m.it.pose.z], h: m.it.pose.h,
      label: `${m.it.op}(${String(m.it.packageId).replace('guangyang-', '')})`, tick: m.it.tick });
  }
}
console.log('锚点序列:', stops.map(s => s.label).join(' -> '));

// ---------- 节点集 ----------
const nodes = [];
const pushNode = (x, z, tag) => {
  for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < 0.02) { n.tag += ',' + tag; return n; }
  const n = { id: nodes.length, x, z, tag };
  nodes.push(n); return n;
};
for (const r of scene.roads) for (const p of r.points) pushNode(p[0], p[1], 'road');
const startNode = pushNode(scene.start.x, scene.start.z, 'start');

// 每个停靠点：锚点本体 + （过点的）候选门点
for (let i = 0; i < stops.length; i++) {
  const s = stops[i];
  s.nodeIds = [pushNode(s.pos[0], s.pos[1], `stop${i}:core`).id];
  if (s.kind === 'pass') {
    // 门点：圆环上位于走廊内的采样点。半径取 0.35/0.65/0.95（都在 1.05 判定半径内）
    for (const rad of [0.35, 0.65, 0.95]) {
      for (let k = 0; k < 72; k++) {
        const a = k * Math.PI / 36;
        const px = s.pos[0] + rad * Math.cos(a), pz = s.pos[1] + rad * Math.sin(a);
        if (marginAt(px, pz) < 0) continue;
        s.nodeIds.push(pushNode(px, pz, `stop${i}:gate${rad}`).id);
      }
    }
  }
}
console.log(`节点 ${nodes.length}（含门点）`);

// ---------- 可见性边 ----------
const isAnchorNode = new Array(nodes.length).fill(false);
const nodeIgnore = new Map();
for (const s of stops) {
  const ig = s.packageId ? [s.packageId] : null;
  for (const id of s.nodeIds) { isAnchorNode[id] = true; if (ig) { if (!nodeIgnore.has(id)) nodeIgnore.set(id, new Set()); ig.forEach(x => nodeIgnore.get(id).add(x)); } }
}
const adj = nodes.map(() => []);
let ec = 0;
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-9 || L > 60) continue;
    const margin = (isAnchorNode[i] || isAnchorNode[j]) ? ANCHOR_MARGIN : MARGIN;
    const ig = new Set();
    if (nodeIgnore.has(i)) for (const x of nodeIgnore.get(i)) ig.add(x);
    if (nodeIgnore.has(j)) for (const x of nodeIgnore.get(j)) ig.add(x);
    const ignore = ig.size ? [...ig] : null;
    if (!segDrivable(a.x, a.z, b.x, b.z, margin, 0.008, ignore)) continue;
    adj[i].push({ v: j, L }); adj[j].push({ v: i, L }); ec++;
  }
}
console.log(`可见性边 ${ec}`);

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

// ---------- 生成 ----------
const lines = [];
let curH = scene.start.h, curPos = [scene.start.x, scene.start.z];
let curNode = startNode.id;
const problems = [], segReport = [];
const MIN_TURN_DEG = 1.0;

function emitTurnTo(want) {
  const dv = wrap(want - curH);
  const deg = Math.abs(dv * 180 / Math.PI);
  if (deg < MIN_TURN_DEG) return;
  if (deg > 360) { lines.push(`robot.${dv > 0 ? 'left_angle' : 'right_angle'}(180.0000)`); curH = wrap(curH + (dv > 0 ? Math.PI : -Math.PI)); return; }
  lines.push(`robot.${dv > 0 ? 'left_angle' : 'right_angle'}(${deg.toFixed(4)})`);
  curH = wrap(curH + dv);
}
function emitForward(L) {
  if (L <= 1e-4) return;
  lines.push(`robot.forward(${(L * CM).toFixed(4)})`);
  curPos = [curPos[0] - Math.sin(curH) * L, curPos[1] - Math.cos(curH) * L];
}

for (let i = 0; i < stops.length; i++) {
  const s = stops[i];
  // 对「过点」在多个门点中取最省 tick 者
  let best = null;
  for (const nid of s.nodeIds) {
    const r = search(curNode, curH, nid, s.h);
    if (!r) continue;
    // 过点无朝向要求，但需把「到达门点」的代价算入；此处 r.ticks 已含转向
    if (!best || r.ticks < best.ticks) best = { ...r, nodeId: nid };
  }
  if (!best) { problems.push(`${s.label} 不可达`); continue; }
  for (const nid of best.path) {
    const n = nodes[nid];
    const L = Math.hypot(n.x - curPos[0], n.z - curPos[1]);
    if (L > 1e-4) {
      emitTurnTo(Math.atan2(-(n.x - curPos[0]), -(n.z - curPos[1])));
      emitForward(L);
    }
  }
  if (s.h != null) emitTurnTo(s.h);
  if (s.kind === 'grab') lines.push('robot.grab()');
  else if (s.kind === 'release') lines.push('robot.release()');
  const base = i === 0 ? stops[0].tick : s.tick - stops[i - 1].tick;
  segReport.push({ label: `-> ${s.label}`, base, opt: best.ticks });
  curNode = best.nodeId;
}

// ---------- 统计与自检 ----------
let finalTicks = 0;
const illegal = [];
lines.forEach((l, i) => {
  let m;
  if ((m = l.match(/^robot\.forward\(([\d.]+)\)$/))) finalTicks += dtU(+m[1] / CM);
  else if ((m = l.match(/^robot\.(left_angle|right_angle)\(([\d.]+)\)$/))) { const d = +m[2]; finalTicks += tt(d); if (d < 1 || d > 360) illegal.push(`line ${i + 1}: ${l}`); }
  else if (l === 'robot.grab()') finalTicks += 38;
  else if (l === 'robot.release()') finalTicks += 34;
});
const outPath = (() => { const k = process.argv.indexOf('--out'); return k >= 0 ? process.argv[k + 1] : path.join(__dirname, '..', 'routes2', 'candidates', 'T2_v3.py'); })();
fs.writeFileSync(outPath, lines.join('\n') + '\n');

console.log('\n=== 逐段对比 ===');
for (const r of segReport) console.log(`  ${r.label.padEnd(34)} 基线 ${String(r.base).padStart(5)}  最优 ${String(r.opt).padStart(5)}  省 ${String(r.base - r.opt).padStart(5)}`);
const bSum = segReport.reduce((s, r) => s + r.base, 0), oSum = segReport.reduce((s, r) => s + r.opt, 0);
console.log('─'.repeat(70));
console.log(`  ${'合计'.padEnd(34)} 基线 ${String(bSum).padStart(5)}  最优 ${String(oSum).padStart(5)}  省 ${String(bSum - oSum).padStart(5)}`);
const FULL = Math.round(124.8 / 0.02);
console.log(`\n指令 ${lines.length}（转向 ${lines.filter(l => l.includes('angle')).length}，直行 ${lines.filter(l => l.includes('forward')).length}）`);
console.log(`估算 tick ${finalTicks} = ${(finalTicks * 0.02).toFixed(2)}s（基线 8256，满分线 ${FULL}，差 ${finalTicks - FULL}）`);
if (illegal.length) console.log(`❌ 非法转向 ${illegal.length} 处: ${illegal.slice(0, 3).join('; ')}`);
else console.log('✅ 全部转向角度均在 1~360 度内');
if (problems.length) console.log('问题:', problems.join('; '));
console.log('已写', outPath);
