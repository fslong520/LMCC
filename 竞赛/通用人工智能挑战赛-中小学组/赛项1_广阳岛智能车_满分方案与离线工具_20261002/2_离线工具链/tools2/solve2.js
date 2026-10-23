#!/usr/bin/env node
// 任务二走廊可见性图下界评估：判断 124.8s 满分线是否可达。
'use strict';
const fs = require('fs');
const path = require('path');
const DT = 0.02, NOM = 1.25, MAXANG = 2.8;
const dtU = u => Math.max(1, Math.ceil(u / (NOM * DT)));
const tt = deg => Math.ceil(Math.max(0.26, (deg * Math.PI / 180) / MAXANG / DT));
const wrap = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

const scene = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data2', 'scene_task2.json'), 'utf8'));
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors2.json'), 'utf8'));
const VEH_R = 0.44, MARGIN = 0.06;

const SEGS = [];
for (const r of scene.roads) {
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
const marginAt = (x, z) => { let b = -Infinity;
  for (const s of SEGS) { const m = s.allow - segDistPt(x, z, s.ax, s.az, s.bx, s.bz); if (m > b) b = m; } return b; };

// 障碍（含包裹堆）
const ALL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data2', 'inter_task2.json'), 'utf8')).packages;
const blockers = ALL.map(p => ({ x: p.x, z: p.z, r: (p.r ?? p.radius ?? 0.28) + VEH_R + 0.005 + 0.06, id: p.id, isObs: p.role === 'obstacle' }));

function segOk(ax, az, bx, bz, margin = MARGIN, step = 0.01, ignore = null) {
  const bl = ignore ? blockers.filter(b => !ignore.includes(b.id)) : blockers;
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    if (marginAt(px, pz) + (MARGIN - margin) < -1e-9) return false;
    for (const b of bl) if (Math.hypot(b.x - px, b.z - pz) < b.r) return false;
  }
  return true;
}

// 锚点序列（基线顺序）
const cps = scene.checkpoints.map(c => c.position);
const stops = [];
for (const e of anchors.events) {
  if (e.type === 'checkpoint') stops.push({ kind: 'pass', pos: cps[e.index], h: null, label: `cp#${e.index}` });
  else if (e.type === 'goal_reached') stops.push({ kind: 'pass', pos: scene.goal, h: null, label: 'goal' });
}
// 把交互插回正确位置：按 tick 排序
const interEvents = anchors.interactions.map((it, i) => ({ ...it, tick: null }));
const timeline = [];
for (const e of anchors.events) timeline.push({ tick: e.tick, type: 'event', e });
// 交互的 tick 需要从重放拿；这里用 anchors 的顺序与事件 tick 交叉
// 简化：直接按事件顺序重建完整序列
const seq = [];
const allEv = [...anchors.events];
// 交互不在此列（events 只含 task 事件），故用 interactions 的位姿单独处理
console.log('=== 任务二场景 ===');
console.log('道路', scene.roads.length, '检查点', cps.length, '障碍/包裹', blockers.length);
console.log('效率满分线 124.8s =', Math.round(124.8 / DT), 'tick');
console.log('\n检查点顺序:');
cps.forEach((c, i) => console.log(`  cp#${i} (${c[0]},${c[1]}) 余量 ${marginAt(c[0], c[1]).toFixed(4)}`));
console.log('\n交互锚点:');
for (const it of anchors.interactions) {
  console.log(`  ${it.op.padEnd(7)} ${String(it.packageId).replace('guangyang-', '').padEnd(16)} (${it.pose.x.toFixed(3)},${it.pose.z.toFixed(3)}) h=${(it.pose.h * 180 / Math.PI).toFixed(1)}° 余量 ${marginAt(it.pose.x, it.pose.z).toFixed(4)} fwd=${it.forward} lat=${it.lateral}`);
}
console.log('\n包裹/障碍位置:');
for (const p of ALL) console.log(`  ${p.id.padEnd(28)} ${String(p.role).padEnd(11)} (${p.x},${p.z}) r=${p.radius}`);
