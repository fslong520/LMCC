#!/usr/bin/env node
// 复核重放轨迹的越界点：用 core.js:1386 的原样语义
//   clearance_i = width_i/2 - 0.44
//   onRoad      = ∃ 路 i: dist_i <= clearance_i + EPS   （各路走廊的并集）
// 目的：定位 validate_emitted（0 次）与 replay（15 次）为何矛盾。
// 用法: node tools2/diag_offroad.js <route.py>
'use strict';
const fs = require('fs');
const path = require('path');
const { runProgram } = require('./replay2.js');

const D2 = path.join(__dirname, '..', 'data2');
// 必须与 replay2.js 同一份数据：replay2 默认读 full_task3.json（见其 :15），
// 若此处硬读 scene_task2.json 而不带 GY_DATA_DIR/GY_FULL，会拿任务二的路配任务三的轨迹，
// 结果全错（曾误报 T2_v1 有 11 次越界，实为 0 次）。
const full = JSON.parse(fs.readFileSync(
  path.join(D2, process.env.GY_FULL || 'full_task2.json'), 'utf8'));
const scene = full.config || JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const VEH_R = 0.44, EPS = 1e-9;

function distPoly(x, z, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    d = Math.min(d, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return d;
}
// 平台语义：任一路满足即在路内；返回最近的那条（按平台排序取第一个 onRoad）
function nearestRoad(x, z) {
  const c = scene.roads.map(r => {
    const distance = distPoly(x, z, r.points);
    const clearance = Math.max(0, r.width) / 2 - VEH_R;
    return { id: r.id, distance, clearance, onRoad: distance <= clearance + EPS };
  });
  c.sort((a, b) => a.distance - b.distance);
  const on = c.filter(v => v.onRoad);
  return on[0] || c[0];
}
// 仅最近路语义（validate_emitted 用的）
function nearestOnly(x, z) {
  let bd = Infinity, bc = 0, bid = '';
  for (const r of scene.roads) {
    const d = distPoly(x, z, r.points);
    if (d < bd) { bd = d; bc = Math.max(0, r.width) / 2 - VEH_R; bid = r.id; }
  }
  return { id: bid, distance: bd, clearance: bc, onRoad: bd <= bc + EPS };
}

const route = process.argv[2];
if (!route) { console.error('用法: node tools2/diag_offroad.js <route.py>'); process.exit(2); }
const out = runProgram(fs.readFileSync(route, 'utf8'));
const frames = (out.trajectory || []).filter(f => Number.isFinite(f.x));
console.log(`\n${path.basename(route)}  轨迹帧 ${frames.length}`);

const badPlatform = [], badNearest = [];
let worst = { slack: Infinity };
for (const f of frames) {
  const m = nearestRoad(f.x, f.z);
  const slack = m.clearance - m.distance;
  if (slack < worst.slack) worst = { slack, x: f.x, z: f.z, tick: f.tick, road: m.id, dist: m.distance, cl: m.clearance };
  if (!m.onRoad) badPlatform.push({ tick: f.tick, x: +f.x.toFixed(3), z: +f.z.toFixed(3), over: +(-slack).toFixed(4), road: m.id });
  const n = nearestOnly(f.x, f.z);
  if (!n.onRoad) badNearest.push({ tick: f.tick, road: n.id });
}
// 合并连续帧为事件
function episodes(list) {
  let e = 0, prev = -999;
  for (const v of list) { if (v.tick - prev > 10) e++; prev = v.tick; }
  return e;
}
console.log(`平台并集判据: 越界帧 ${badPlatform.length} → 事件 ${episodes(badPlatform)}`);
console.log(`仅最近路判据: 越界帧 ${badNearest.length} → 事件 ${episodes(badNearest)}`);
console.log(`最小裕量 ${worst.slack.toFixed(4)} @ tick ${worst.tick} (${worst.x.toFixed(3)},${worst.z.toFixed(3)}) 路 ${worst.road} dist=${worst.dist.toFixed(4)} cl=${worst.cl.toFixed(4)}`);
if (badPlatform.length) {
  console.log('\n越界事件（每 10 tick 内合并，取首帧）:');
  let prev = -999;
  for (const v of badPlatform) { if (v.tick - prev > 10) console.log(`  tick ${v.tick} (${v.x},${v.z}) 超 ${v.over} 路 ${v.road}`); prev = v.tick; }
}
