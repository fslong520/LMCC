#!/usr/bin/env node
// 走廊可见性图求解器
//
// 核心认识：任务3 的可行域是「所有道路走廊的并集」，不是路网折线本身。
//   车可在走廊内任意直线行驶，无须沿折线节点走，故几何最短路 = 走廊内可视性图最短路。
//   基线绕行比 1.45，正是「沿折线逐节点走」的代价。
//
// 代价模型（经真机 179 条控制指令逐条验证，转向/行驶偏差均为 0）：
//   forward(u)  = max(1, ceil(u / (1.25*0.02)))          tick
//   turn(deg)   = ceil( max(260, deg/2.8*1000) / 20 )    tick（转向期间零位移，纯损耗）
//
// 用法: node tools/solve_visibility.js [--json out.json]
'use strict';
const fs = require('fs');
const path = require('path');
const { loadScene, dtU, tt, wrap } = require('./route_lib.js');

const { dd, auth } = loadScene();
const VEH_R = 0.44, UPM = 8, CM = 100 / UPM;

// ---------- 走廊栅格 ----------
const RES = 0.08;
const B = dd.roads.reduce((acc, r) => {
  for (const p of r.points) {
    acc.minX = Math.min(acc.minX, p[0]); acc.maxX = Math.max(acc.maxX, p[0]);
    acc.minZ = Math.min(acc.minZ, p[1]); acc.maxZ = Math.max(acc.maxZ, p[1]);
  }
  return acc;
}, { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 });
// 向外扩一圈，容纳抓放锚点（可能略在路外）
const PAD = 1.5;
B.minX -= PAD; B.maxX += PAD; B.minZ -= PAD; B.maxZ += PAD;
const NX = Math.ceil((B.maxX - B.minX) / RES) + 1;
const NZ = Math.ceil((B.maxZ - B.minZ) / RES) + 1;
const drive = new Uint8Array(NX * NZ);   // 1 = 可行驶
const gx = x => Math.round((x - B.minX) / RES);
const gz = z => Math.round((z - B.minZ) / RES);

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

// 逐段栅格化：只扫描线段包围盒内的格
for (const r of dd.roads) {
  const allow = r.width / 2 - VEH_R;
  if (allow <= 0) continue;
  const pts = r.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const x0 = gx(Math.min(ax, bx) - allow), x1 = gx(Math.max(ax, bx) + allow);
    const z0 = gz(Math.min(az, bz) - allow), z1 = gz(Math.max(az, bz) + allow);
    for (let ix = Math.max(0, x0); ix <= Math.min(NX - 1, x1); ix++) {
      for (let iz = Math.max(0, z0); iz <= Math.min(NZ - 1, z1); iz++) {
        const idx = iz * NX + ix;
        if (drive[idx]) continue;
        const x = B.minX + ix * RES, z = B.minZ + iz * RES;
        if (segDist(x, z, ax, az, bx, bz) <= allow + 1e-9) drive[idx] = 1;
      }
    }
  }
}
let driveCount = 0; for (let i = 0; i < drive.length; i++) if (drive[i]) driveCount++;

function drivable(x, z) {
  const ix = gx(x), iz = gz(z);
  if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) return false;
  return drive[iz * NX + ix] === 1;
}
// 采样检查整条线段可行驶（含端点插值，避免栅格边界漏判）
function segDrivable(ax, az, bx, bz) {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(L / (RES * 0.5)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!drivable(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

// ---------- 节点集：道路折线节点 + 任务锚点 ----------
const nodes = [];
const pushNode = (x, z, tag) => {
  for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < 0.02) return n;
  const n = { id: nodes.length, x, z, tag };
  nodes.push(n); return n;
};
for (const r of dd.roads) for (const p of r.points) pushNode(p[0], p[1], 'road');

const cps = dd.checkpoints.map(c => c.position);
for (let i = 0; i < cps.length; i++) pushNode(cps[i][0], cps[i][1], `cp${i}`);
pushNode(dd.start.x, dd.start.z, 'start');
pushNode(dd.goal[0], dd.goal[1], 'goal');
const PKGPOS = {};
for (const p of auth.packages) {
  if (p.category === 'obstacle' || p.role === 'obstacle') continue;
  pushNode(p.x, p.z, `pkg:${p.id}`);
  PKGPOS[p.id] = [p.x, p.z];
}
console.log(`栅格 ${NX}x${NZ}，可行驶格 ${driveCount}（${(driveCount / (NX * NZ) * 100).toFixed(1)}%）`);
console.log(`节点 ${nodes.length}（道路 + 检查点 + 起点终点 + 包裹）`);

// ---------- 可见性边 ----------
const adj = nodes.map(() => []);
let edgeCount = 0;
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-9 || L > 45) continue;
    if (!segDrivable(a.x, a.z, b.x, b.z)) continue;
    adj[i].push({ v: j, L }); adj[j].push({ v: i, L });
    edgeCount++;
  }
}
console.log(`可见性边 ${edgeCount}（平均每节点 ${(edgeCount * 2 / nodes.length).toFixed(1)} 条）`);

// ---------- tick 最优搜索（状态 = 节点 + 进入来源） ----------
const cmp = (a, b) => a - b;
function search(srcId, srcH, dstId, dstH) {
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
  const relax = (key, node, ticks, backKey, backNode, hdg) => {
    if (!best.has(key) || ticks < best.get(key) - 1e-9) {
      best.set(key, ticks); prev.set(key, { backKey, backNode, hdg });
      push({ key, node, ticks }); return true;
    }
    return false;
  };
  const s = nodes[srcId];
  for (const e of adj[srcId]) {
    const b = nodes[e.v];
    const h = Math.atan2(-(b.x - s.x), -(b.z - s.z));
    const d = Math.abs(wrap(h - srcH) * 180 / Math.PI);
    relax(`${e.v}|${srcId}`, e.v, tt(d) + dtU(e.L), null, srcId, h);
  }
  let goalBest = null, goalKey = null;
  while (pq.length) {
    const cur = pop();
    if (cur.ticks > (best.get(cur.key) ?? 1e18) + 1e-9) continue;
    if (cur.node === dstId) {
      // 末端对准目标朝向
      const p = prev.get(cur.key);
      const extra = dstH === null || dstH === undefined ? 0 : tt(Math.abs(wrap(dstH - p.hdg) * 180 / Math.PI));
      const tot = cur.ticks + extra;
      if (goalBest === null || tot < goalBest) { goalBest = tot; goalKey = cur.key; }
      continue;
    }
    const p = prev.get(cur.key);
    const hIn = p.hdg;
    const a = nodes[cur.node];
    for (const e of adj[cur.node]) {
      const b = nodes[e.v];
      const h = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      const d = Math.abs(wrap(h - hIn) * 180 / Math.PI);
      const key = `${e.v}|${cur.node}`;
      relax(key, e.v, cur.ticks + tt(d) + dtU(e.L), cur.key, cur.node, h);
    }
  }
  if (goalKey === null) return null;
  const seq = []; let k = goalKey;
  while (k) { const p = prev.get(k); if (!p) break; seq.push({ node: Number(k.split('|')[0]), hdg: p.hdg }); k = p.backKey; }
  seq.reverse();
  return { ticks: goalBest, nodes: seq.map(x => x.node), headings: seq.map(x => x.hdg) };
}

// ---------- 对基线锚点序列逐段评估 ----------
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors.json'), 'utf8'));
const tl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'timeline.json'), 'utf8'));
const key = tl.timeline.filter(i => i.type.startsWith('interact:') || i.type.startsWith('event:checkpoint') || i.type === 'event:goal_reached');
const stops = [];
for (const k of key) {
  if (k.type === 'event:checkpoint') stops.push({ pos: cps[k.index], h: null, label: `cp#${k.index}` });
  else if (k.type === 'event:goal_reached') stops.push({ pos: dd.goal, h: null, label: 'goal' });
  else {
    const it = anchors.interactions.find(i => i.op === k.type.slice(9) && i.packageId === k.packageId);
    stops.push({ pos: [it.pose.x, it.pose.z], h: it.pose.h, label: `${k.type.slice(9)}(${k.packageId.replace('guangyang-', '')})` });
  }
}

const findNode = (x, z) => { let bi = -1, bd = 1e18;
  for (const n of nodes) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; bi = n.id; } } return { id: bi, d: bd }; };

console.log('\n=== 逐段：基线 tick vs 走廊最优 tick ===\n');
let baseSum = 0, optSum = 0;
const rows = [];
let cur = { pos: [dd.start.x, dd.start.z], h: dd.start.h, label: 'start' };
let baseTicks = key[0].tick;
for (let i = 0; i < stops.length; i++) {
  const to = stops[i];
  const a = findNode(cur.pos[0], cur.pos[1]), b = findNode(to.pos[0], to.pos[1]);
  // 起终点若不在节点上，需直线接入（可见性图未含这些精确点，故此处以最近节点近似）
  const r = search(a.id, cur.h, b.id, to.h);
  const base = i === 0 ? baseTicks : key[i].tick - key[i - 1].tick;
  baseSum += base;
  const opt = r ? r.ticks : NaN;
  if (r) optSum += opt;
  rows.push({ seg: `${cur.label} -> ${to.label}`, base, opt, saved: r ? base - opt : NaN, viaNodes: r ? r.nodes.length : 0 });
  cur = { pos: to.pos, h: to.h ?? cur.h, label: to.label };
}
for (const r of rows) {
  console.log(`${r.seg.padEnd(40)} 基线 ${String(r.base).padStart(5)}  最优 ${String(r.opt).padStart(6)}  省 ${String(r.saved).padStart(6)}  经 ${r.viaNodes} 节点`);
}
console.log('─'.repeat(78));
console.log(`合计 基线 ${baseSum}  最优 ${optSum}  省 ${baseSum - optSum} tick`);
console.log(`\n基线 endTick ${tl.budget.endTick}，满分线 ${tl.budget.fullMarkLine}，需省 ${tl.budget.gap} tick`);
console.log(`走廊最优逐段合计可省 ${baseSum - optSum} tick → ${baseSum - optSum >= tl.budget.gap ? '足以达标' : '仍差 ' + (tl.budget.gap - (baseSum - optSum)) + ' tick'}`);
console.log('\n注：逐段独立最优之和是乐观下界（各段起点朝向按上段终点朝向接力，未含连续性代价）。');

if (process.argv.includes('--json')) {
  fs.writeFileSync(path.join(__dirname, '..', 'visibility_eval.json'), JSON.stringify({ rows, baseSum, optSum, gap: tl.budget.gap }, null, 1));
  console.log('已写 visibility_eval.json');
}
