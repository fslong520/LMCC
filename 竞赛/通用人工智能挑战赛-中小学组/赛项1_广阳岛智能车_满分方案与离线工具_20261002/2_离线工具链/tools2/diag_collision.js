#!/usr/bin/env node
// 定位碰撞：找出首次碰撞帧，报告该点到各实体障碍的距离与阈值，
// 判断是「图里没这条障碍」还是「图忽略了它（锚点 ignore 集）」还是「路径本就不该走这」。
// 用法: GY_DATA_DIR=data2 GY_FULL=full_task2.json node tools2/diag_collision.js <route.py>
'use strict';
const fs = require('fs');
const path = require('path');
const { runProgram, parseProgram } = require('./replay2.js');
const { dtU, tt, CM } = require('../tools/route_lib.js');

const D2 = path.join(__dirname, '..', 'data2');
const full = JSON.parse(fs.readFileSync(path.join(D2, process.env.GY_FULL || 'full_task2.json'), 'utf8'));
const inter = full.inter;
const VEH_R = 0.44, SKIN = 0.005, OBS_MARGIN = 0.06;

// 与 generate2.js 同构的实体障碍
const blockers = (inter.packages || []).map(p => {
  const isObs = p.role === 'obstacle';
  const rad = p.radius ?? (isObs ? 0.52 : 0.28);
  return { id: p.id, role: p.role, x: p.x, z: p.z, rad,
           hard: rad + VEH_R + SKIN,        // 物理碰撞阈值（无 margin）
           soft: rad + VEH_R + SKIN + OBS_MARGIN };  // 规划避让阈值
});

const route = process.argv[2];
if (!route) { console.error('用法: node tools2/diag_collision.js <route.py>'); process.exit(2); }
const out = runProgram(fs.readFileSync(route, 'utf8'));
const traj = out.trajectory.filter(f => Number.isFinite(f.x));
const ops = parseProgram(fs.readFileSync(route, 'utf8'));

// 逐 tick 反推当前指令序号：按指令耗时累计
function tickOfOp() {
  const map = []; let t = 0;
  for (const o of ops) {
    let d = 0;
    if (o.kind === 'drive') d = dtU(o.cm / CM);
    else if (o.kind === 'turn') d = tt(o.deg);
    else if (o.kind === 'grab') d = 38; else if (o.kind === 'release') d = 34;
    for (let k = 0; k < d; k++) map.push({ i: o, line: o.line, phase: k });
    t += d;
  }
  return map;
}
const tmap = tickOfOp();

const hit = traj.find(f => (f.collisionCount || 0) > 0);
if (!hit) { console.log(`\n${path.basename(route)}: 无碰撞`); process.exit(0); }

console.log(`\n${path.basename(route)}  首碰 tick ${hit.tick} @ (${hit.x.toFixed(3)},${hit.z.toFixed(3)})`);
const op = tmap[Math.min(hit.tick, tmap.length - 1)];
if (op) console.log(`  当前指令 line ${op.line}: ${JSON.stringify(op.i)}`);

const near = blockers
  .map(b => ({ ...b, d: Math.hypot(hit.x - b.x, hit.z - b.z) }))
  .sort((a, b) => a.d - b.d)
  .slice(0, 4);
console.log('  最近实体:');
for (const n of near) {
  const st = n.d < n.hard ? '💥硬碰撞' : (n.d < n.soft ? '⚠️越规划阈' : 'ok');
  console.log(`    ${n.id.padEnd(26)} role=${String(n.role).padEnd(11)} d=${n.d.toFixed(3)} 硬=${n.hard.toFixed(3)} 软=${n.soft.toFixed(3)} ${st}`);
}

// 统计全程碰撞帧与涉及实体
let frames = 0; const involved = new Map();
for (const f of traj) {
  if (!(f.collisionCount > 0)) continue;
  frames++;
  for (const b of blockers) if (Math.hypot(f.x - b.x, f.z - b.z) < b.hard) involved.set(b.id, (involved.get(b.id) || 0) + 1);
}
console.log(`  碰撞帧 ${frames}`);
if (involved.size) console.log('  涉及实体:', [...involved].map(([k, v]) => `${k}×${v}`).join(', '));
