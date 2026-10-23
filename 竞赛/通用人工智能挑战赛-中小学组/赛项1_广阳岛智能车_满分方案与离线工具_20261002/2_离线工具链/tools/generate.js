#!/usr/bin/env node
// 任务3 路线生成器：走廊可见性图 + tick 最优
//
// 思路：可行域是「所有道路走廊的并集」，车可在走廊内任意直线行驶。
//   故取「道路折线节点 + 任务锚点」为节点集，连边当且仅当两节点间直线全程在走廊内。
//   在此图上以真实 tick 为代价搜索，即可得近似最优路线。
//
// 硬约束（不可违反）：
//   ① 抓放锚点的位置与朝向必须精确——决定 grab/release 是否被接受
//   ② 检查点须按序穿过（core.js:2306 线段穿圆判定，顺序不可乱）
//   ③ 全程不得越出走廊（clearance = width/2 - 0.44）
//
// 用法: node tools/generate.js [--out routes/candidates/T3_v1.py]
'use strict';
const fs = require('fs');
const path = require('path');
const { loadScene, dtU, tt, wrap, CM } = require('./route_lib.js');

const { dd, auth } = loadScene();
const VEH_R = 0.44;

// ---------- 走廊栅格 ----------
const RES = 0.07;
const B = dd.roads.reduce((acc, r) => {
  for (const p of r.points) {
    acc.minX = Math.min(acc.minX, p[0]); acc.maxX = Math.max(acc.maxX, p[0]);
    acc.minZ = Math.min(acc.minZ, p[1]); acc.maxZ = Math.max(acc.maxZ, p[1]);
  }
  return acc;
}, { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 });
const PAD = 1.2;
B.minX -= PAD; B.maxX += PAD; B.minZ -= PAD; B.maxZ += PAD;
const NX = Math.ceil((B.maxX - B.minX) / RES) + 1;
const NZ = Math.ceil((B.maxZ - B.minZ) / RES) + 1;
const drive = new Uint8Array(NX * NZ);
const gx = x => Math.round((x - B.minX) / RES);
const gz = z => Math.round((z - B.minZ) / RES);
const segDistPt = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};
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
        if (segDistPt(B.minX + ix * RES, B.minZ + iz * RES, ax, az, bx, bz) <= allow + 1e-9) drive[idx] = 1;
      }
    }
  }
}
const drivable = (x, z) => {
  const ix = gx(x), iz = gz(z);
  if (ix < 0 || iz < 0 || ix >= NX || iz >= NZ) return false;
  return drive[iz * NX + ix] === 1;
};
function segDrivable(ax, az, bx, bz) {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(L / (RES * 0.4)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!drivable(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
}

// ---------- 锚点序列（基线顺序，位姿不可变） ----------
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
    stops.push({ kind: k.type.slice(9), packageId: k.packageId, pos: [it.pose.x, it.pose.z], h: it.pose.h, label: `${k.type.slice(9)}(${k.packageId.replace('guangyang-', '')})` });
  }
}

// ---------- 节点集 ----------
const nodes = [];
const pushNode = (x, z, tag) => {
  for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < 0.03) { if (tag && !n.tag.includes(tag)) n.tag += ',' + tag; return n; }
  const n = { id: nodes.length, x, z, tag: tag || '' };
  nodes.push(n); return n;
};
for (const r of dd.roads) for (const p of r.points) pushNode(p[0], p[1], 'road');
stops.forEach((s, i) => { s.nodeId = pushNode(s.pos[0], s.pos[1], `stop${i}`).id; });
pushNode(dd.start.x, dd.start.z, 'start');
pushNode(dd.goal[0], dd.goal[1], 'goal');
// 包裹位置也作为节点：接近抓取点时可能需要参照
for (const p of auth.packages) if (!(p.role === 'obstacle' || p.category === 'obstacle')) pushNode(p.x, p.z, `pkg:${p.id}`);

console.log(`栅格 ${NX}x${NZ}，节点 ${nodes.length}`);

// 可见性边
const adj = nodes.map(() => []);
let ec = 0;
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-9 || L > 50) continue;
    if (!segDrivable(a.x, a.z, b.x, b.z)) continue;
    adj[i].push({ v: j, L }); adj[j].push({ v: i, L }); ec++;
  }
}
console.log(`可见性边 ${ec}`);

// ---------- tick 最优搜索 ----------
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
  const relax = (key, node, ticks, backKey, hdg) => {
    if (!best.has(key) || ticks < best.get(key) - 1e-9) {
      best.set(key, ticks); prev.set(key, { backKey, hdg });
      push({ key, node, ticks }); return true;
    }
    return false;
  };
  const s = nodes[srcId];
  if (srcId === dstId) {
    const extra = dstH == null ? 0 : tt(Math.abs(wrap(dstH - srcH) * 180 / Math.PI));
    return { ticks: extra, nodes: [srcId], headings: [srcH] };
  }
  for (const e of adj[srcId]) {
    const b = nodes[e.v];
    const h = Math.atan2(-(b.x - s.x), -(b.z - s.z));
    relax(`${e.v}|${srcId}`, e.v, tt(Math.abs(wrap(h - srcH) * 180 / Math.PI)) + dtU(e.L), null, h);
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
      relax(`${e.v}|${cur.node}`, e.v, cur.ticks + tt(Math.abs(wrap(h - p.hdg) * 180 / Math.PI)) + dtU(e.L), cur.key, h);
    }
  }
  if (gKey === null) return null;
  const seq = []; let k = gKey;
  while (k) { const p = prev.get(k); if (!p) break; seq.push({ node: Number(k.split('|')[0]), hdg: p.hdg, backKey: p.backKey }); k = p.backKey; }
  seq.reverse();
  return { ticks: gBest, nodes: seq.map(x => x.node), headings: seq.map(x => x.hdg) };
}

// ---------- 生成指令 ----------
const lines = [];
let ticks = 0;
function emitTurn(want, curH) {
  const dv = wrap(want - curH);
  const deg = Math.abs(dv * 180 / Math.PI);
  if (deg <= 0.05) return { ticks: 0, h: curH };
  const t = tt(deg);
  lines.push(`robot.${dv > 0 ? 'left_angle' : 'right_angle'}(${(deg > 360 ? deg - 360 : deg).toFixed(2)})`);
  return { ticks: t, h: want };
}
function emitDrive(L) {
  if (L <= 0.001) return 0;
  const cm = L * CM;
  lines.push(`robot.forward(${cm.toFixed(2)})`);
  return dtU(L);
}

let curH = dd.start.h;
let curPos = [dd.start.x, dd.start.z];
let curNode = nodes.findIndex(n => n.tag.includes('start'));
const report = [];

for (let i = 0; i < stops.length; i++) {
  const s = stops[i];
  const r = search(curNode, curH, s.nodeId, s.h);
  if (!r) { report.push(`FAIL ${s.label}`); console.log(`  段 ${s.label} 不可达`); continue; }
  // 依序执行：转向 -> 前进
  let h = curH;
  for (let k = 0; k < r.nodes.length; k++) {
    const target = nodes[r.nodes[k]];
    const want = Math.atan2(-(target.x - curPos[0]), -(target.z - curPos[1]));
    const tn = emitTurn(want, h); ticks += tn.ticks; h = tn.h;
    const L = Math.hypot(target.x - curPos[0], target.z - curPos[1]);
    ticks += emitDrive(L);
    curPos = [target.x, target.z];
  }
  // 末端精确对准作业朝向
  if (s.h != null) { const tn = emitTurn(s.h, h); ticks += tn.ticks; h = tn.h; }
  curH = h; curNode = s.nodeId;
  if (s.kind === 'grab') { lines.push('robot.grab()'); ticks += 38; }
  else if (s.kind === 'release') { lines.push('robot.release()'); ticks += 34; }
  report.push(`${s.label}  tick=${r.ticks}`);
}

const outPath = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'routes', 'candidates', 'T3_v1.py'); })();
fs.writeFileSync(outPath, lines.join('\n') + '\n');

console.log(`\n指令 ${lines.length}（转向 ${lines.filter(l => l.includes('angle')).length}，直行 ${lines.filter(l => l.includes('forward')).length}）`);
console.log(`估算 tick ${ticks} = ${(ticks * 0.02).toFixed(2)}s（基线 10529，满分线 ${tl.budget.fullMarkLine}，差 ${ticks - tl.budget.fullMarkLine}）`);
console.log('已写', outPath);
