#!/usr/bin/env node
// 任务二顺序敏感性：固定「检查点按序」约束，检验不同包裹穿插策略下的可行距离。
// 只做「直线可达性」粗筛（两点直线是否全程在走廊内且不撞障碍），
// 再用走廊图求实际可行驶距离。
'use strict';
const fs = require('fs');
const path = require('path');
const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const interDef = JSON.parse(fs.readFileSync(path.join(D2, 'inter_task2.json'), 'utf8'));
const VEH_R = 0.44, MARGIN = 0.05;
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
  for (const s of SEGS) { const m = s.allow - MARGIN - sd(x, z, s.ax, s.az, s.bx, s.bz); if (m > b) b = m; } return b; };
const BLOCK = interDef.packages.map(p => ({ x: p.x, z: p.z, r: (p.r ?? p.radius ?? 0.28) + VEH_R + 0.005 + 0.04, id: p.id }));
function straightOk(a, b, ignore) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.ceil(L / 0.01));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    if (marginAt(x, z) < 0) return false;
    for (const bl of BLOCK) { if (ignore && ignore.includes(bl.id)) continue;
      if (Math.hypot(bl.x - x, bl.z - z) < bl.r) return false; }
  }
  return true;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cps = scene.checkpoints.map(c => c.position);
const goal = scene.goal, start = [scene.start.x, scene.start.z];
const STORE = scene.deliveries.find(d => d.destinationRole === 'storage').destination;
const P = {};
for (const p of interDef.packages) if (p.role !== 'obstacle') P[p.id] = { pos: [p.x, p.z], role: p.role };

// 最优顺序（来自 DP）
const order = [
  ['start', start, null],
  ['cp#0', cps[0], null],
  ['cp#1', cps[1], null],
  ['cp#2', cps[2], null],
  ['grab(target-1)', P['guangyang-target-1'].pos, null],
  ['cp#3', cps[3], null],
  ['cp#4', cps[4], null],
  ['drop(target-1)', STORE, null],
  ['grab(distractor-1)', P['guangyang-distractor-1'].pos, null],
  ['drop(distractor-1)', P['guangyang-distractor-1'].pos, 'guangyang-distractor-1'],
  ['grab(distractor-2)', P['guangyang-distractor-2'].pos, null],
  ['drop(distractor-2)', P['guangyang-distractor-2'].pos, 'guangyang-distractor-2'],
  ['cp#5', cps[5], null],
  ['grab(target-2)', P['guangyang-target-2'].pos, null],
  ['drop(target-2)', STORE, null],
  ['goal', goal, null]
];
console.log('=== 最优顺序的直线可达性 ===');
let sumStraight = 0, sumViaRoad = 0, straightOkCount = 0;
for (let i = 1; i < order.length; i++) {
  const [na, pa, ia] = order[i - 1], [nb, pb, ib] = order[i];
  const d = dist(pa, pb);
  sumStraight += d;
  const okk = straightOk(pa, pb, ib ? [ib] : null);
  if (okk) straightOkCount++;
  console.log(`  ${(na + ' -> ' + nb).padEnd(38)} 直线 ${d.toFixed(2).padStart(6)}u  ${okk ? '✅ 可直行' : '❌ 需绕行'}`);
}
console.log(`\n直线合计 ${sumStraight.toFixed(2)}u，其中可直行的段 ${straightOkCount}/${order.length - 1}`);
const dtU = u => Math.max(1, Math.ceil(u / 0.025));
console.log(`\n若全部可直行：行驶 ${dtU(sumStraight)} tick = ${(dtU(sumStraight) * 0.02).toFixed(1)}s`);
console.log(`加转向 15×13=195 + 交互 288 => ${dtU(sumStraight) + 483} tick = ${((dtU(sumStraight) + 483) * 0.02).toFixed(1)}s`);
console.log(`满分线 124.8s（6240 tick）`);
