#!/usr/bin/env node
// 任务二 最优序列的代价分解：把 DIST 矩阵展开成「每段的行驶/转向 tick」，
// 找出剩余浪费所在（转向次数？行驶距离？锚点选择？）。
'use strict';
const fs = require('fs');
const path = require('path');
const { dtU, tt, wrap, CM } = require('../tools/route_lib.js');
const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const interDef = JSON.parse(fs.readFileSync(path.join(D2, 'inter_task2.json'), 'utf8'));
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors2.json'), 'utf8'));
const VEH_R = 0.44, MARGIN = 0.06, ANCHOR_MARGIN = 0.02;
const costTurn = d => (d < 1 ? 0 : tt(d));

const SEGS = [];
for (const r of scene.roads) {
  const allow = r.width / 2 - VEH_R;
  if (allow <= 0) continue;
  for (let i = 0; i < r.points.length - 1; i++)
    SEGS.push({ ax: r.points[i][0], az: r.points[i][1], bx: r.points[i + 1][0], bz: r.points[i + 1][1], allow });
}
const sd = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz)); };
const marginAt = (x, z) => { let b = -Infinity;
  for (const s of SEGS) { const m = s.allow - sd(x, z, s.ax, s.az, s.bx, s.bz); if (m > b) b = m; } return b; };
const SKIN = 0.005, OBS_MARGIN = 0.06;
const blockers = interDef.packages.map(p => ({ x: p.x, z: p.z, r: (p.r ?? p.radius ?? 0.28) + VEH_R + SKIN + OBS_MARGIN, id: p.id }));
const blockersFor = ig => (ig ? blockers.filter(b => !ig.includes(b.id)) : blockers);
function segOk(ax, az, bx, bz, margin, step, ignore) {
  const bl = blockersFor(ignore);
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    if (marginAt(px, pz) + (MARGIN - margin) < -1e-9) return false;
    for (const b of bl) if (Math.hypot(b.x - px, b.z - pz) < b.r) return false;
  }
  return true;
}
const cps = scene.checkpoints.map(c => c.position);
const relPose = {}, grabPose = {};
for (const it of anchors.interactions) (it.op === 'release' ? relPose : grabPose)[it.packageId] = { pos: [it.pose.x, it.pose.z], h: it.pose.h };
const P = {};
for (const p of interDef.packages) if (p.role !== 'obstacle') P[p.id] = p;

const POINTS = [];
const addPoint = o => { POINTS.push({ id: POINTS.length, ...o }); return POINTS.length - 1; };
const ID = {};
ID.start = addPoint({ x: scene.start.x, z: scene.start.z, h: scene.start.h, kind: 'start', label: 'start' });
ID.cp = cps.map((c, i) => addPoint({ x: c[0], z: c[1], h: null, kind: 'cp', label: `cp#${i}` }));
ID.goal = addPoint({ x: scene.goal[0], z: scene.goal[1], h: null, kind: 'goal', label: 'goal' });
ID.grab = {}; ID.rel = {};
for (const id of Object.keys(P)) {
  ID.grab[id] = addPoint({ x: grabPose[id].pos[0], z: grabPose[id].pos[1], h: grabPose[id].h, kind: 'grab', pkg: id, label: `grab(${id.replace('guangyang-', '')})` });
  ID.rel[id] = addPoint({ x: relPose[id].pos[0], z: relPose[id].pos[1], h: relPose[id].h, kind: 'release', pkg: id, label: `drop(${id.replace('guangyang-', '')})` });
}
const nodes = [];
const pushNode = (x, z, tag) => {
  for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < 0.02) { if (tag) n.tags.push(tag); return n; }
  const n = { id: nodes.length, x, z, tags: tag ? [tag] : [] }; nodes.push(n); return n;
};
for (const r of scene.roads) for (const p of r.points) pushNode(p[0], p[1], null);
for (const p of POINTS) pushNode(p.x, p.z, p.label);
const nodeOfPoint = POINTS.map(p => pushNode(p.x, p.z, null).id);
const pointIgnore = {}; for (const p of POINTS) if (p.pkg) pointIgnore[p.id] = [p.pkg];
const isPointNode = new Set(nodeOfPoint);
const nodePoints = new Map();
POINTS.forEach((p, i) => { const nid = nodeOfPoint[i]; if (!nodePoints.has(nid)) nodePoints.set(nid, []); nodePoints.get(nid).push(p.id); });
const adj = nodes.map(() => []);
for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
  const a = nodes[i], b = nodes[j];
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  if (L < 1e-9 || L > 60) continue;
  const anchorish = isPointNode.has(i) || isPointNode.has(j);
  const margin = anchorish ? ANCHOR_MARGIN : MARGIN;
  let ig = [];
  for (const pid of (nodePoints.get(i) || [])) if (pointIgnore[pid]) ig = ig.concat(pointIgnore[pid]);
  for (const pid of (nodePoints.get(j) || [])) if (pointIgnore[pid]) ig = ig.concat(pointIgnore[pid]);
  ig = [...new Set(ig)];
  if (!segOk(a.x, a.z, b.x, b.z, margin, 0.008, ig.length ? ig : null)) continue;
  adj[i].push({ v: j, L }); adj[j].push({ v: i, L });
}
// 单源最优，同时记录每段的「距离/转向/路径」
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
    if (!best.has(key) || t < best.get(key) - 1e-9) { best.set(key, t); prev.set(key, { back: null, hdg: h, L: e.L }); push({ key, node: e.v, ticks: t }); }
  }
  while (pq.length) {
    const cur = pop();
    if (cur.ticks > (best.get(cur.key) ?? 1e18) + 1e-9) continue;
    const a = nodes[cur.node], p = prev.get(cur.key);
    for (const e of adj[cur.node]) {
      const b = nodes[e.v];
      const h = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      const key = `${e.v}|${cur.node}`;
      const t = cur.ticks + costTurn(Math.abs(wrap(h - p.hdg) * 180 / Math.PI)) + dtU(e.L);
      if (!best.has(key) || t < best.get(key) - 1e-9) { best.set(key, t); prev.set(key, { back: cur.key, hdg: h, L: e.L }); push({ key, node: e.v, ticks: t }); }
    }
  }
  const out = {};
  for (let pid = 0; pid < POINTS.length; pid++) {
    const dst = POINTS[pid], nid = nodeOfPoint[pid];
    let bestT = Infinity, bestKey = null, selfH = null;
    if (nid === srcNode) {
      const extra = dst.h == null ? 0 : costTurn(Math.abs(wrap(dst.h - srcH) * 180 / Math.PI));
      if (extra < bestT) { bestT = extra; bestKey = '__self__'; }
    }
    for (const [key, t] of best) {
      const [n] = key.split('|').map(Number);
      if (n !== nid) continue;
      const p = prev.get(key);
      const extra = dst.h == null ? 0 : costTurn(Math.abs(wrap(dst.h - p.hdg) * 180 / Math.PI));
      const tot = t + extra;
      if (tot < bestT) { bestT = tot; bestKey = key; }
    }
    out[pid] = { ticks: bestT, key: bestKey };
  }
  return { dist: out, best, prev };
}
const RES = [];
for (let i = 0; i < POINTS.length; i++) RES.push(searchFrom(nodeOfPoint[i], POINTS[i].h ?? 0));
const DIST = RES.map(r => Object.fromEntries(Object.entries(r.dist).map(([k, v]) => [k, v.ticks])));

// 分解某段：沿最优路径统计转向次数/转角/距离
function decompose(fromPid, toPid) {
  const dst = POINTS[toPid], nid = nodeOfPoint[toPid];
  const r = RES[fromPid];
  const rec = r.dist[toPid];
  if (!Number.isFinite(rec.ticks)) return null;
  if (rec.key === '__self__') return { turns: 0, turnDeg: 0, dist: 0, ticks: rec.ticks };
  let turns = 0, turnDeg = 0, dist = 0;
  let k = rec.key;
  while (k) {
    const p = r.prev.get(k);
    if (!p) break;
    dist += p.L;
    k = p.back;
  }
  // 转向需按路径重算
  const pts = [];
  k = rec.key;
  while (k) { pts.push(Number(k.split('|')[0])); const p = r.prev.get(k); if (!p) break; k = p.back; }
  pts.reverse();
  let h = POINTS[fromPid].h ?? 0;
  for (let i = 0; i < pts.length; i++) {
    const a = i === 0 ? nodes[nodeOfPoint[fromPid]] : nodes[pts[i - 1]];
    const b = nodes[pts[i]];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-9) continue;
    const want = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    const d = Math.abs(wrap(want - h) * 180 / Math.PI);
    if (d >= 1) { turns++; turnDeg += d; }
    h = want;
  }
  if (dst.h != null) { const d = Math.abs(wrap(dst.h - h) * 180 / Math.PI); if (d >= 1) { turns++; turnDeg += d; } }
  return { turns, turnDeg: +turnDeg.toFixed(1), dist: +dist.toFixed(2), ticks: rec.ticks };
}

// 读最优序列
const seq = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seq2.json'), 'utf8'));
console.log('=== 最优序列逐段分解 ===');
console.log('段                                     行驶u   转向次  转角°   行驶tick 转向tick  合计');
let sumD = 0, sumT = 0, sumTurns = 0, sumDeg = 0, sumTicks = 0;
for (let i = 1; i < seq.seq.length; i++) {
  const a = seq.seq[i - 1].pid, b = seq.seq[i].pid;
  const d = decompose(a, b);
  if (!d) { console.log(`  ${POINTS[a].label} -> ${POINTS[b].label}  不可达`); continue; }
  const driveTicks = dtU(d.dist);
  const turnTicks = d.ticks - driveTicks;
  sumD += d.dist; sumT += turnTicks; sumTurns += d.turns; sumDeg += d.turnDeg; sumTicks += d.ticks;
  console.log(`${(POINTS[a].label + ' -> ' + POINTS[b].label).padEnd(38)} ${d.dist.toFixed(2).padStart(6)} ${String(d.turns).padStart(6)} ${String(d.turnDeg).padStart(7)} ${String(driveTicks).padStart(9)} ${String(turnTicks).padStart(8)} ${String(d.ticks).padStart(8)}`);
}
// 末段回终点
const last = seq.seq[seq.seq.length - 1].pid;
const dg = decompose(last, ID.goal);
if (dg) {
  const dt = dtU(dg.dist), tt2 = dg.ticks - dt;
  sumD += dg.dist; sumT += tt2; sumTurns += dg.turns; sumDeg += dg.turnDeg; sumTicks += dg.ticks;
  console.log(`${(POINTS[last].label + ' -> goal').padEnd(38)} ${dg.dist.toFixed(2).padStart(6)} ${String(dg.turns).padStart(6)} ${String(dg.turnDeg).padStart(7)} ${String(dt).padStart(9)} ${String(tt2).padStart(8)} ${String(dg.ticks).padStart(8)}`);
}
console.log('─'.repeat(96));
console.log(`${'合计'.padEnd(38)} ${sumD.toFixed(2).padStart(6)} ${String(sumTurns).padStart(6)} ${sumDeg.toFixed(0).padStart(7)} ${String(dtU(sumD)).padStart(9)} ${String(sumT).padStart(8)} ${String(sumTicks).padStart(8)}`);
console.log(`\n行驶 ${dtU(sumD)} tick（${sumD.toFixed(2)}u = ${(sumD * CM).toFixed(1)}cm）`);
console.log(`转向 ${sumTurns} 次 / ${sumDeg.toFixed(0)}° / ${sumT} tick`);
console.log(`交互 288 tick`);
const total = sumTicks + 288;
console.log(`合计 ${total} tick = ${(total * 0.02).toFixed(2)}s   (满分线 124.8s = 6240 tick，差 ${total - 6240})`);
console.log(`\n基线：行驶 6947 + 转向 1021 + 交互 288 = 8256 tick`);
console.log(`本方案相对基线：行驶 ${dtU(sumD) - 6947} tick，转向 ${sumT - 1021} tick，合计 ${total - 8256} tick = ${((total - 8256) * 0.02).toFixed(1)}s`);
