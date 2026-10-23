#!/usr/bin/env node
// 测量「不可达」的拒因：对每个 stop，枚举锚点节点的候选边，
// 逐条报告被拒时触碰到的 blocker（id / 实际距离 / 用的阈值）。
// 目的：分清是「我改的锚点包裹硬阈值」过严，还是本来就不可达。
// 用法: GY_DATA_DIR=data2 GY_FULL=full_task2.json node tools2/diag_reject.js [stopLabel]
'use strict';
const fs = require('fs');
const path = require('path');

// 复用 generate2 的构造逻辑：直接以子进程方式让它打印，这里改为内联关键几何
const D2 = path.join(__dirname, '..', 'data2');
const full = JSON.parse(fs.readFileSync(path.join(D2, process.env.GY_FULL || 'full_task2.json'), 'utf8'));
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const inter = full.inter;
const VEH_R = 0.44, SKIN = 0.005, OBS_MARGIN = 0.06, MARGIN = 0.06;
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors2.json'), 'utf8'));

const blockers = (inter.packages || []).map(p => {
  const isObs = p.role === 'obstacle';
  const rad = p.radius ?? (isObs ? 0.52 : 0.28);
  return { id: p.id, x: p.x, z: p.z, rFull: rad + VEH_R + SKIN + OBS_MARGIN, rHard: rad + VEH_R + SKIN, role: p.role };
});

console.log('锚点与最近 blocker 的距离：');
const list = Array.isArray(anchors) ? anchors : Object.entries(anchors).map(([k, v]) => ({ id: k, ...v }));
for (const a of list) {
  const ax = a.x ?? a.pos?.[0] ?? a.position?.x;
  const az = a.z ?? a.pos?.[1] ?? a.position?.z;
  if (ax === undefined || az === undefined) continue;
  const near = blockers.map(b => ({ id: b.id, d: Math.hypot(ax - b.x, az - b.z), rFull: b.rFull, rHard: b.rHard }))
    .sort((p, q) => p.d - q.d).slice(0, 2);
  const n = near[0];
  const verdict = n ? (n.d < n.rHard ? '💥锚点在硬阈值内' : (n.d < n.rFull ? '⚠️仅超软阈值(可用硬阈值)' : 'ok')) : '?';
  console.log(`  ${(a.id || a.label || '?').padEnd(26)} (${ax.toFixed(3)},${az.toFixed(3)}) 最近 ${n ? n.id : '-'} d=${n ? n.d.toFixed(3) : '-'} 硬=${n ? n.rHard.toFixed(3) : '-'} 软=${n ? n.rFull.toFixed(3) : '-'} ${verdict}`);
}
console.log('\nblocker 阈值:');
for (const b of blockers) console.log(`  ${b.id.padEnd(26)} role=${String(b.role).padEnd(11)} 软=${b.rFull.toFixed(3)} 硬=${b.rHard.toFixed(3)}`);
