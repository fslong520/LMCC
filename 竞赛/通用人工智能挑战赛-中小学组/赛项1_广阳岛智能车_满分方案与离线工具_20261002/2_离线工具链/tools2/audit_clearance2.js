#!/usr/bin/env node
// 严格复核越界：完全复刻平台的 nearestRoad 判据（core.js:1386）。
//   clearance = width/2 - vehicleRadius
//   onRoad    = (到该道路折线距离 <= clearance + EPSILON)
//   候选按「到道路折线的距离」升序排序，取第一个 onRoad 者；无 onRoad 者取最近者。
//   判定越界当且仅当所选道路的 onRoad 为 false。
// 平台扣分：事件 -2.5 每次，另按越界持续时间 -0.42/秒。
'use strict';
const fs = require('fs');
const path = require('path');
const { runProgram } = require('./replay2.js');

const DATA_DIR = process.env.GY_DATA_DIR ? (path.isAbsolute(process.env.GY_DATA_DIR)?process.env.GY_DATA_DIR:path.join(__dirname,'..',process.env.GY_DATA_DIR)) : path.join(__dirname, '..', 'data2');
const dd = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'scene_task2.json'), 'utf8'));
const VEH_R = 0.44, EPS = 1e-9;

function distToPolyline(x, z, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    const dd2 = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
    if (dd2 < d) d = dd2;
  }
  return d;
}
function nearestRoad(x, z) {
  const cands = dd.roads.map(r => {
    const distance = distToPolyline(x, z, r.points);
    const clearance = r.width / 2 - VEH_R;
    return { road: r, distance, clearance, onRoad: distance <= clearance + EPS };
  });
  cands.sort((a, b) => a.distance - b.distance);
  const onRoad = cands.filter(c => c.onRoad);
  return onRoad[0] || cands[0];
}

const route = process.argv[2];
if (!route) { console.error('用法: GY_DATA_DIR=data2 node tools2/audit_clearance2.js <route.py>'); process.exit(2); }
const out = runProgram(fs.readFileSync(route, 'utf8'));
const frames = out.trajectory.filter(f => Number.isFinite(f.x));

const violations = [];
let worst = { slack: -Infinity };
for (const f of frames) {
  const m = nearestRoad(f.x, f.z);
  const slack = m.clearance - m.distance;      // <0 即越界
  if (slack > worst.slack) worst = { slack, x: f.x, z: f.z, tick: f.tick, road: m.road?.id, dist: m.distance, cl: m.clearance };
  if (!m.onRoad) violations.push({ tick: f.tick, x: +f.x.toFixed(4), z: +f.z.toFixed(4), slack: +slack.toFixed(4), road: m.road?.id, dist: +m.distance.toFixed(4), clearance: +m.clearance.toFixed(4) });
}

console.log(`文件 ${path.basename(route)}   轨迹帧 ${frames.length}`);
console.log(`最小裕量（<0 即越界）: ${worst.slack.toFixed(4)} 在 tick ${worst.tick} (${worst.x.toFixed(3)},${worst.z.toFixed(3)}) 路 ${worst.road}`);
console.log(`  该点: 到路心 ${worst.dist.toFixed(4)}  允许 ${worst.cl.toFixed(4)}`);
console.log(`越界帧数: ${violations.length}`);
if (violations.length) {
  let eps = 0, prev = -999;
  for (const v of violations) { if (v.tick - prev > 10) eps++; prev = v.tick; }
  console.log(`合并为 ${eps} 次越界事件（平台每次 -2.5 分）`);
  console.log('越界点（前 12）:');
  for (const v of violations.slice(0, 12)) console.log(`  tick ${v.tick} (${v.x},${v.z}) 到路心 ${v.dist} 允许 ${v.clearance} 超 ${(-v.slack).toFixed(4)} 路 ${v.road}`);
}
