#!/usr/bin/env node
// 任务二 顺序 × 路径 联合最优求解器
//
// 与任务三成法一致：锚点（抓放位姿）冻结为基线已验证值，走廊可见性图上以真实 tick 为代价。
// 新增：把「4 件包裹的抓放时机」也交给搜索 —— 约束为
//   ① 检查点必须按 0→5 依次经过（平台按索引判定，core.js:2306）
//   ② 每件包裹先抓后放；一次只持一件
//   ③ 目标物放仓储、混淆物放路外（各用基线已验证的释放位姿）
//
// tick 代价（真机 179 条指令逐条验证，偏差 0）：
//   forward(u) = max(1, ceil(u/0.025))
//   turn(deg)  = ceil( max(260, deg/2.8*1000)/20 )   ← 小于 41.7° 一律 13 tick，故「转向次数」比角度更值钱
//
// 用法: node tools2/solve2_order.js [--out seq.json]
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
const MIN_TURN_DEG = 1.0;

const costTurn = deg => (deg < MIN_TURN_DEG ? 0 : tt(deg));

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
  x: p.x, z: p.z,
  r: (p.r ?? p.radius ?? 0.28) + VEH_R + SKIN + OBS_MARGIN,
  id: p.id, isObstacle: p.role === 'obstacle'
}));
const blockersFor = ig => (ig ? blockers.filter(b => !ig.includes(b.id)) : blockers);
function segDrivable(ax, az, bx, bz, margin, step, ignore) {
  const bl = blockersFor(ignore);
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(L / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    if (marginAt(px, pz) + (MARGIN - margin) < -1e-9) return false;
    for (const b of bl) if (Math.hypot(b.x - px, b.z - pz) < b.r) return false;
  }
  return true;
}

// ---------- 任务点集合 ----------
const cps = scene.checkpoints.map(c => c.position);
const STORE = scene.deliveries.find(d => d.destinationRole === 'storage').destination;
const P = {};
for (const p of interDef.packages) if (p.role !== 'obstacle') P[p.id] = { pos: [p.x, p.z], role: p.role };
// 释放位姿取基线已验证值
const relPose = {};
for (const it of anchors.interactions) if (it.op === 'release') relPose[it.packageId] = { pos: [it.pose.x, it.pose.z], h: it.pose.h };
const grabPose = {};
for (const it of anchors.interactions) if (it.op === 'grab') grabPose[it.packageId] = { pos: [it.pose.x, it.pose.z], h: it.pose.h };

// 点：id -> {x,z,h|null,kind}
const POINTS = [];
const addPoint = (o) => { POINTS.push({ id: POINTS.length, ...o }); return POINTS.length - 1; };
const ID = {};
ID.start = addPoint({ x: scene.start.x, z: scene.start.z, h: scene.start.h, kind: 'start', label: 'start' });
ID.cp = cps.map((c, i) => addPoint({ x: c[0], z: c[1], h: null, kind: 'cp', idx: i, label: `cp#${i}` }));
ID.goal = addPoint({ x: scene.goal[0], z: scene.goal[1], h: null, kind: 'goal', label: 'goal' });
ID.grab = {}; ID.rel = {};
for (const id of Object.keys(P)) {
  ID.grab[id] = addPoint({ x: grabPose[id].pos[0], z: grabPose[id].pos[1], h: grabPose[id].h, kind: 'grab', pkg: id, label: `grab(${id.replace('guangyang-', '')})` });
  ID.rel[id] = addPoint({ x: relPose[id].pos[0], z: relPose[id].pos[1], h: relPose[id].h, kind: 'release', pkg: id, label: `drop(${id.replace('guangyang-', '')})` });
}
console.log(`任务点 ${POINTS.length}：`);
for (const p of POINTS) console.log(`  #${String(p.id).padStart(2)} ${p.label.padEnd(20)} (${p.x.toFixed(2)},${p.z.toFixed(2)}) h=${p.h == null ? '自由' : (p.h * 180 / Math.PI).toFixed(1) + '°'}`);

// ---------- 图 ----------
const nodes = [];
const pushNode = (x, z, tag) => {
  for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < 0.02) { if (tag) n.tags.push(tag); return n; }
  const n = { id: nodes.length, x, z, tags: tag ? [tag] : [] };
  nodes.push(n); return n;
};
for (const r of scene.roads) for (const p of r.points) pushNode(p[0], p[1], null);
for (const p of POINTS) pushNode(p.x, p.z, p.label);
const nodeOfPoint = POINTS.map(p => pushNode(p.x, p.z, null).id);
console.log(`\n图节点 ${nodes.length}`);

// 每个任务点允许忽略的包裹（贴近作业点时必须能靠近）
const pointIgnore = {};
for (const p of POINTS) if (p.pkg) pointIgnore[p.id] = [p.pkg];
const isPointNode = new Set(nodeOfPoint);
const nodePoints = new Map();
POINTS.forEach((p, i) => { const nid = nodeOfPoint[i]; if (!nodePoints.has(nid)) nodePoints.set(nid, []); nodePoints.get(nid).push(p.id); });

const adj = nodes.map(() => []);
let ec = 0;
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-9 || L > 60) continue;
    const anchorish = isPointNode.has(i) || isPointNode.has(j);
    const margin = anchorish ? ANCHOR_MARGIN : MARGIN;
    let ig = [];
    for (const pid of (nodePoints.get(i) || [])) if (pointIgnore[pid]) ig = ig.concat(pointIgnore[pid]);
    for (const pid of (nodePoints.get(j) || [])) if (pointIgnore[pid]) ig = ig.concat(pointIgnore[pid]);
    ig = [...new Set(ig)];
    if (!segDrivable(a.x, a.z, b.x, b.z, margin, 0.008, ig.length ? ig : null)) continue;
    adj[i].push({ v: j, L }); adj[j].push({ v: i, L }); ec++;
  }
}
console.log(`可见性边 ${ec}`);

// ---------- 单源最优 tick 搜索（状态 = 节点 + 入边来源） ----------
function searchFrom(srcNode, srcH) {
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
  const s = nodes[srcNode];
  for (const e of adj[srcNode]) {
    const b = nodes[e.v];
    const h = Math.atan2(-(b.x - s.x), -(b.z - s.z));
    const key = `${e.v}|${srcNode}`;
    const t = costTurn(Math.abs(wrap(h - srcH) * 180 / Math.PI)) + dtU(e.L);
    if (!best.has(key) || t < best.get(key) - 1e-9) {
      best.set(key, t); prev.set(key, { back: null, hdg: h });
      push({ key, node: e.v, ticks: t });
    }
  }
  while (pq.length) {
    const cur = pop();
    if (cur.ticks > (best.get(cur.key) ?? 1e18) + 1e-9) continue;
    const a = nodes[cur.node];
    for (const e of adj[cur.node]) {
      const b = nodes[e.v];
      const h = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      const key = `${e.v}|${cur.node}`;
      const p = prev.get(cur.key);
      const t = cur.ticks + costTurn(Math.abs(wrap(h - p.hdg) * 180 / Math.PI)) + dtU(e.L);
      if (!best.has(key) || t < best.get(key) - 1e-9) {
        best.set(key, t); prev.set(key, { back: cur.key, hdg: h });
        push({ key, node: e.v, ticks: t });
      }
    }
  }
  // 到各任务点的最优（含终点朝向对准）
  const out = {};
  for (let pid = 0; pid < POINTS.length; pid++) {
    const dst = POINTS[pid];
    const nid = nodeOfPoint[pid];
    let bestT = Infinity, bestKey = null;
    if (nid === srcNode) {
      const extra = dst.h == null ? 0 : costTurn(Math.abs(wrap(dst.h - srcH) * 180 / Math.PI));
      if (extra < bestT) { bestT = extra; bestKey = '__self__'; }
    }
    for (const [key, t] of best) {
      const [n, from] = key.split('|').map(Number);
      if (n !== nid) continue;
      const p = prev.get(key);
      const extra = dst.h == null ? 0 : costTurn(Math.abs(wrap(dst.h - p.hdg) * 180 / Math.PI));
      const tot = t + extra;
      if (tot < bestT) { bestT = tot; bestKey = key; }
    }
    out[pid] = bestT;
  }
  return out;
}

console.log('\n计算距离矩阵…');
const t0 = Date.now();
const DIST = [];
for (let i = 0; i < POINTS.length; i++) {
  DIST.push(searchFrom(nodeOfPoint[i], POINTS[i].h ?? 0));
}
console.log(`矩阵完成 ${Date.now() - t0} ms`);

// ---------- 序列搜索（Dijkstra over task states） ----------
// 状态：{cp 已过数, 已送达位掩码, 手持物|null, 位置 pid}
const ids = Object.keys(P);
const N = ids.length;
const idxOf = {}; ids.forEach((id, i) => idxOf[id] = i);
const FULL = (1 << N) - 1;

function solveSequence() {
  const keyOf = (s) => `${s.cp}|${s.done}|${s.hold || '-'}|${s.at}`;
  const best = new Map(), prev = new Map(), pq = [];
  const push = it => { pq.push(it); let i = pq.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (pq[p].t <= pq[i].t) break; [pq[p], pq[i]] = [pq[i], pq[p]]; i = p; } };
  const pop = () => { const top = pq[0], last = pq.pop();
    if (pq.length) { pq[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < pq.length && pq[l].t < pq[m].t) m = l;
        if (r < pq.length && pq[r].t < pq[m].t) m = r;
        if (m === i) break; [pq[m], pq[i]] = [pq[i], pq[m]]; i = m; } }
    return top; };
  const s0 = { cp: 0, done: 0, hold: null, at: ID.start };
  best.set(keyOf(s0), 0); prev.set(keyOf(s0), null);
  push({ ...s0, t: 0, key: keyOf(s0) });
  let goalState = null;
  while (pq.length) {
    const cur = pop();
    const k = cur.key;
    if (cur.t > (best.get(k) ?? 1e18) + 1e-9) continue;
    if (cur.cp >= cps.length && cur.done === FULL && cur.hold === null) {
      // 回终点
      const tt2 = DIST[cur.at][ID.goal];
      const tot = cur.t + tt2;
      if (!goalState || tot < goalState.t) goalState = { ...cur, t: tot, key: k };
      continue;
    }
    const moves = [];
    // 过下一个检查点
    if (cur.cp < cps.length) moves.push({ to: ID.cp[cur.cp], ncp: cur.cp + 1, ndone: cur.done, nhold: cur.hold });
    // 放下
    if (cur.hold) {
      moves.push({ to: ID.rel[cur.hold], ncp: cur.cp, ndone: cur.done | (1 << idxOf[cur.hold]), nhold: null });
    }
    // 拾取
    if (!cur.hold) {
      for (const id of ids) {
        if (cur.done & (1 << idxOf[id])) continue;
        moves.push({ to: ID.grab[id], ncp: cur.cp, ndone: cur.done, nhold: id });
      }
    }
    for (const m of moves) {
      const d = DIST[cur.at][m.to];
      if (!Number.isFinite(d)) continue;
      const nt = cur.t + d;
      const ns = { cp: m.ncp, done: m.ndone, hold: m.nhold, at: m.to };
      const nk = keyOf(ns);
      if (nt < (best.get(nk) ?? 1e18) - 1e-9) {
        best.set(nk, nt); prev.set(nk, { from: k, move: m, at: cur.at });
        push({ ...ns, t: nt, key: nk });
      }
    }
  }
  if (!goalState) return null;
  // 回溯
  const seq = [];
  let k = goalState.key;
  while (k) {
    const p = prev.get(k);
    const [cp, done, hold, at] = k.split('|');
    seq.push({ pt: Number(at), cp: +cp, done: +done, hold: hold === '-' ? null : hold });
    if (!p) break;
    k = p.from;
  }
  seq.reverse();
  return { ticks: goalState.t, seq };
}

const t1 = Date.now();
const sol = solveSequence();
console.log(`序列搜索 ${Date.now() - t1} ms`);
if (!sol) { console.log('无可行序列'); process.exit(1); }

console.log(`\n=== 最优序列（总行驶+转向 ${sol.ticks} tick）===`);
for (const s of sol.seq) {
  console.log(`  ${POINTS[s.pt].label.padEnd(22)} cp已过=${s.cp} 手持=${s.hold ? s.hold.replace('guangyang-', '') : '空'}`);
}
const INT = 4 * (24 + 14 + 13 + 21);   // 4抓4放动画 = 288
const total = sol.ticks + INT;
const FULL_LINE = Math.round(124.8 / 0.02);
console.log(`\n行驶+转向 ${sol.ticks} + 交互动画 ${INT} = ${total} tick = ${(total * 0.02).toFixed(2)}s`);
console.log(`满分线 124.8s = ${FULL_LINE} tick`);
console.log(total <= FULL_LINE ? `✅ 低于满分线 ${FULL_LINE - total} tick` : `❌ 超出满分线 ${total - FULL_LINE} tick`);

const outPath = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'seq2.json'); })();
fs.writeFileSync(outPath, JSON.stringify({ ticks: sol.ticks, total, seq: sol.seq.map(s => ({ label: POINTS[s.pt].label, pid: s.pt, cp: s.cp, done: s.done, hold: s.hold })) }, null, 1));
console.log('已写', outPath);
