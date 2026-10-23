#!/usr/bin/env node
// 发射后校验：开环执行「已生成的指令」，得到**真实**行驶折线，
// 沿它按平台判据逐点检查，并统计「被丢弃的转向角累积量」。
// 目的：回答「规划判可行的路径，执行时为何越界」——寻找生成器的静默偏差。
// 用法: node tools2/validate_emitted.js [route.py]
'use strict';
const fs = require('fs');
const path = require('path');
const { parseProgram } = require('./replay2.js');
const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const VEH_R = 0.44, EPS = 1e-9;
const wrap = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

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
// 平台判据：按距离取最近路，检查该路净空
function onRoad(x, z) {
  let bd = Infinity, bclear = 0, brid = '';
  for (const r of scene.roads) {
    const d = distPoly(x, z, r.points);
    if (d < bd) { bd = d; bclear = r.width / 2 - VEH_R; brid = r.id; }
  }
  return { ok: bd <= bclear + EPS, slack: bclear - bd, road: brid };
}

const route = process.argv[2] || path.join(__dirname, '..', 'routes2', 'candidates', 'T2_v1.py');
const ops = parseProgram(fs.readFileSync(route, 'utf8'));
let h = scene.start.h, x = scene.start.x, z = scene.start.z;
let skipped = 0, skippedDeg = 0;
const pts = [[x, z]];
let worst = { slack: Infinity };
const viol = [];
for (const op of ops) {
  if (op.kind === 'turn') {
    const dv = wrap(op.dir * op.deg * Math.PI / 180);
    h = wrap(h + dv);
    continue;
  }
  if (op.kind !== 'drive') continue;
  const L = op.cm * 8 / 100;
  const nx = x + -Math.sin(h) * L, nz = z + -Math.cos(h) * L;
  const n = Math.max(2, Math.ceil(L / 0.01));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const px = x + (nx - x) * t, pz = z + (nz - z) * t;
    const r = onRoad(px, pz);
    if (r.slack < worst.slack) worst = { slack: r.slack, x: px, z: pz, road: r.road, line: op.line };
    if (!r.ok) { viol.push({ line: op.line, x: px, z: pz, slack: r.slack, road: r.road }); break; }
  }
  x = nx; z = nz; pts.push([x, z]);
}
// 顺带统计生成器丢弃的微角度（生成器里 <1° 直接不输出）
const src = fs.readFileSync(route, 'utf8');
const lineTurns = src.split('\n').map(l => l.trim()).filter(l => /left_angle|right_angle/.test(l));

console.log(`校验 ${path.basename(route)}：${ops.length} 指令，${pts.length - 1} 段直行`);
console.log(`最紧裕量 ${worst.slack.toFixed(4)} @ (${worst.x.toFixed(3)},${worst.z.toFixed(3)}) 路 ${worst.road}${worst.line ? ' line' + worst.line : ''}`);
const byLine = new Map();
for (const v of viol) { if (!byLine.has(v.line)) byLine.set(v.line, v); }
if (viol.length) {
  console.log(`\n❌ 越界段 ${byLine.size} 个：`);
  for (const [ln, v] of byLine) console.log(`  line ${ln}  (${v.x.toFixed(3)},${v.z.toFixed(3)})  超出 ${(-v.slack).toFixed(4)}  路 ${v.road}`);
} else {
  console.log('\n✅ 全程在走廊内（平台判据）');
}
console.log(`\n微角度转向指令数 ${lineTurns.length}`);
