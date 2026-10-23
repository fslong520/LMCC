#!/usr/bin/env node
// 调试：逐步输出每段的搜索路径、转向/前进指令与到达位置，定位位置漂移来源。
'use strict';
const fs = require('fs');
const path = require('path');
const { loadScene, dtU, tt, wrap, CM } = require('./route_lib.js');

const { dd, auth } = loadScene();
const VEH_R = 0.44, MARGIN = 0.06;

const SEGS = [];
for (const r of dd.roads) {
  const allow = r.width / 2 - VEH_R - MARGIN;
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
function segDrivable(ax, az, bx, bz, margin = MARGIN, step = 0.03) {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(L / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (marginAt(ax + (bx - ax) * t, az + (bz - az) * t) + (MARGIN - margin) < -1e-9) return false;
  }
  return true;
}

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

console.log('=== stops 表（锚点坐标来自基线）===');
stops.forEach((s, i) => console.log(`  ${String(i).padStart(2)} ${s.label.padEnd(26)} (${s.pos[0].toFixed(3)},${s.pos[1].toFixed(3)}) h=${s.h == null ? '自由' : (s.h * 180 / Math.PI).toFixed(1) + '°'}  余量 ${marginAt(s.pos[0], s.pos[1]).toFixed(4)}`));

const nodes = [];
const pushNode = (x, z, tag) => {
  for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < 0.02) { n.tag += ',' + tag; return n; }
  const n = { id: nodes.length, x, z, tag }; nodes.push(n); return n;
};
for (const r of dd.roads) for (const p of r.points) pushNode(p[0], p[1], 'road');
stops.forEach((s, i) => { s.nodeId = pushNode(s.pos[0], s.pos[1], `stop${i}`).id; });
const startNodeId = pushNode(dd.start.x, dd.start.z, 'start').id;

// 验证锚点节点坐标与锚点一致
console.log('\n=== 锚点节点校验 ===');
let anchorBad = 0;
stops.forEach((s, i) => {
  const n = nodes[s.nodeId];
  const d = Math.hypot(n.x - s.pos[0], n.z - s.pos[1]);
  if (d > 1e-9) { console.log(`  ✗ ${s.label} 节点 ${s.nodeId} 坐标 (${n.x.toFixed(3)},${n.z.toFixed(3)}) 偏离 ${d.toFixed(4)}`); anchorBad++; }
});
console.log(anchorBad === 0 ? '  全部锚点节点坐标精确' : `  ${anchorBad} 个偏离`);

const isAnchor = new Array(nodes.length).fill(false);
stops.forEach(s => { isAnchor[s.nodeId] = true; });
const adj = nodes.map(() => []);
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-9 || L > 60) continue;
    const margin = (isAnchor[i] || isAnchor[j]) ? 0 : MARGIN;
    if (!segDrivable(a.x, a.z, b.x, b.z, margin)) continue;
    adj[i].push({ v: j, L }); adj[j].push({ v: i, L });
  }
}

function search(srcId, srcH, dstId, dstH) {
  if (srcId === dstId) {
    const extra = dstH == null ? 0 : tt(Math.abs(wrap(dstH - srcH) * 180 / Math.PI));
    return { ticks: extra, path: [] };
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
      best.set(key, t); prev.set(key, { back: null, hdg: h }); push({ key, node: e.v, ticks: t });
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
        best.set(key, t); prev.set(key, { back: cur.key, hdg: h }); push({ key, node: e.v, ticks: t });
      }
    }
  }
  if (gKey === null) return null;
  const path = []; let k = gKey;
  while (k) { path.push(Number(k.split('|')[0])); const p = prev.get(k); if (!p) break; k = p.back; }
  path.reverse();
  return { ticks: gBest, path };
}

let curH = dd.start.h, curPos = [dd.start.x, dd.start.z], curNode = startNodeId;
console.log('\n=== 逐段路径与位置漂移 ===');
for (let i = 0; i < stops.length; i++) {
  const s = stops[i];
  const r = search(curNode, curH, s.nodeId, s.h);
  if (!r) { console.log(`  ${s.label} 不可达`); continue; }
  const startPos = [curPos[0], curPos[1]];
  for (const nid of r.path) {
    const n = nodes[nid];
    const L = Math.hypot(n.x - curPos[0], n.z - curPos[1]);
    if (L > 1e-4) {
      const want = Math.atan2(-(n.x - curPos[0]), -(n.z - curPos[1]));
      const dv = wrap(want - curH);
      curH = wrap(curH + dv);
      curPos = [curPos[0] - Math.sin(curH) * L, curPos[1] - Math.cos(curH) * L];
    }
  }
  if (s.h != null) curH = s.h;
  const drift = Math.hypot(curPos[0] - s.pos[0], curPos[1] - s.pos[1]);
  const flag = drift > 0.02 ? '  ← 漂移!' : '';
  console.log(`  ${String(i).padStart(2)} ${s.label.padEnd(26)} 起点(${startPos[0].toFixed(3)},${startPos[1].toFixed(3)}) 到达(${curPos[0].toFixed(3)},${curPos[1].toFixed(3)}) 目标(${s.pos[0].toFixed(3)},${s.pos[1].toFixed(3)}) 漂移 ${drift.toFixed(5)} 路径${r.path.length}跳${flag}`);
  curNode = s.nodeId;
}
