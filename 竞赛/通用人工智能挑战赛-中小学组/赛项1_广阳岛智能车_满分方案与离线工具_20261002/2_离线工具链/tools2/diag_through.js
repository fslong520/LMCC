#!/usr/bin/env node
// 找出「穿过指定包裹」的指令段，并判定该段在图构建时是否被方向性忽略集放行。
// 用法: GY_DATA_DIR=data2 GY_FULL=full_task2.json node tools2/diag_through.js <route.py> <pkgId>
'use strict';
const fs = require('fs');
const path = require('path');
const { runProgram, parseProgram } = require('./replay2.js');
const { dtU, tt, CM } = require('../tools/route_lib.js');

const D2 = path.join(__dirname, '..', 'data2');
const full = JSON.parse(fs.readFileSync(path.join(D2, process.env.GY_FULL || 'full_task2.json'), 'utf8'));
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const VEH_R = 0.44, SKIN = 0.005, OBS_MARGIN = 0.06;
const pk = (full.inter.packages || []).map(p => {
  const isObs = p.role === 'obstacle';
  const rad = p.radius ?? (isObs ? 0.52 : 0.28);
  return { id: p.id, x: p.x, z: p.z, rFull: rad + VEH_R + SKIN + OBS_MARGIN, rHard: rad + VEH_R + SKIN, role: p.role };
});
const args = process.argv.slice(2);
const route = args[0];
const wantId = args[1] || 'guangyang-distractor-2';
const target = pk.find(p => p.id === wantId);
if (!route || !target) { console.error('用法: node tools2/diag_through.js <route.py> <pkgId>'); process.exit(2); }

console.log(`\n包裹 ${target.id} @ (${target.x.toFixed(3)},${target.z.toFixed(3)})  软阈值 ${target.rFull.toFixed(3)} 硬 ${target.rHard.toFixed(3)}`);
console.log(`角色 ${target.role}\n`);

const out = runProgram(fs.readFileSync(route, 'utf8'));
const traj = out.trajectory.filter(f => Number.isFinite(f.x));

// 逐帧算距离，按「< 软阈值」分组为事件
const evs = [];
let cur = null;
for (const f of traj) {
  const d = Math.hypot(f.x - target.x, f.z - target.z);
  if (d < target.rFull) {
    if (!cur) { cur = { start: f.tick, end: f.tick, min: d, at: { x: f.x, z: f.z } }; evs.push(cur); }
    else { cur.end = f.tick; if (d < cur.min) { cur.min = d; cur.at = { x: f.x, z: f.z }; } }
  } else cur = null;
}
if (!evs.length) { console.log('✅ 全程未接近该包裹'); process.exit(0); }

// 逐条指令的 tick 区间（与平台同式）
const ops = parseProgram(fs.readFileSync(route, 'utf8'));
const bounds = [];
let t = 0;
for (const o of ops) {
  let d = 0;
  if (o.kind === 'drive') d = dtU(o.cm / CM);
  else if (o.kind === 'turn') d = tt(o.deg);
  else if (o.kind === 'grab') d = 38; else if (o.kind === 'release') d = 34;
  bounds.push({ o, from: t, to: t + d }); t += d;
}
const which = tick => {
  for (let i = 0; i < bounds.length; i++) if (tick >= bounds[i].from && tick < bounds[i].to) return i;
  return bounds.length - 1;
};

console.log(`接近事件 ${evs.length} 次（首次侵入即被平台记为碰撞）：`);
for (const e of evs.slice(0, 8)) {
  const i = which(e.start), j = which(e.end);
  const seg = bounds[i]?.o;
  console.log(`  tick ${e.start}~${e.end}  最小距 ${e.min.toFixed(3)} @ (${e.at.x.toFixed(2)},${e.at.z.toFixed(2)})`);
  for (let k = i; k <= Math.min(j, bounds.length - 1); k++) {
    const b = bounds[k];
    console.log(`    line ${b.o.line ?? '?'} ${JSON.stringify(b.o)}  [${b.from},${b.to})`);
  }
}

// 报告交互序列，判断该包裹此时是否应在手中
console.log('\n交互时序:');
for (const it of (full.inter?.packages || []).length ? [] : []) {}
const trace = out.trace || [];
for (const tr of trace) console.log(`  line ${tr.line} ${tr.op} ${tr.accepted ? '✅' : '❌ ' + tr.reason} ${tr.pkg || ''} tick ${tr.tick}`);
