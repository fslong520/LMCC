#!/usr/bin/env node
// 逐指令对照：重放器记录「哪条 forward 被真实仿真阻塞」，与图的判定对比。
// 分歧 = 图认为可行、仿真实际撞到 —— 即候选越界/抓取失败的根因。
// 用法: GY_DATA_DIR=data2 GY_FULL=full_task2.json node tools2/blockedcheck.js <route.py>
'use strict';
const fs = require('fs');
const path = require('path');
const { runProgram, parseProgram } = require('./replay2.js');

const D2 = process.env.GY_DATA_DIR ? path.join(__dirname, '..', process.env.GY_DATA_DIR) : path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const VEH_R = 0.44, MARGIN = 0.06, ANCHOR_MARGIN = 0.02;

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

const route = process.argv[2];
const out = runProgram(fs.readFileSync(route, 'utf8'));
const ops = parseProgram(fs.readFileSync(route, 'utf8'));

// 重放轨迹中被阻塞的帧
const blocked = out.trajectory.filter(f => f.blocked && f.collision);
console.log(`阻塞帧 ${blocked.length}（涉及 ${out.trace.length} 次交互）`);
const byCollider = {};
for (const f of blocked) { const k = f.collision.colliderId; byCollider[k] = (byCollider[k] || 0) + 1; }
for (const [k, v] of Object.entries(byCollider)) console.log(`  ${k}: ${v} 帧`);

// 开环重算，逐条 forward 对照
let h = scene.start.h, x = scene.start.x, z = scene.start.z;
let bad = 0, checked = 0;
console.log('\nline  开环直线段                       图判定  射线最近碰撞  判定');
for (const op of ops) {
  if (op.kind === 'turn') { h = ((h + op.dir * op.deg * Math.PI / 180 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; continue; }
  if (op.kind === 'grab' || op.kind === 'release') continue;
  const L = op.cm * 8 / 100;
  const nx = x + -Math.sin(h) * L, nz = z + -Math.cos(h) * L;
  // 图判定（复刻 generate2：走廊余量 + 包裹堆半径 0.785）
  const n = Math.max(2, Math.ceil(L / 0.01));
  let graphOk = true;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (marginAt(x + (nx - x) * t, z + (nz - z) * t) + MARGIN < -1e-9) { graphOk = false; break; }
  }
  // 射线最近碰撞（含全部静态包裹/障碍，半径 +0.44+0.005）
  let nearest = Infinity, who = '-';
  for (const c of fullColliders()) {
    const dx = nx - x, dz = nz - z, LL = Math.hypot(dx, dz);
    if (LL < 1e-9) continue;
    const ux = dx / LL, uz = dz / LL;
    const px = x - c.x, pz = z - c.z;
    const R = VEH_R + c.r;
    const proj = px * ux + pz * uz;
    const d2 = px * px + pz * pz - R * R;
    let hit = Infinity;
    if (d2 >= -1e-9 && d2 <= 1e-9) hit = proj < 0 ? 0 : Infinity;
    else if (d2 > 1e-9 && proj < 0) { const disc = proj * proj - d2; if (disc > 1e-9) hit = Math.max(0, -proj - Math.sqrt(disc)); }
    else hit = Infinity;
    if (hit < nearest) { nearest = hit; who = c.id; }
  }
  checked++;
  const rayOk = nearest >= L - 1e-9;
  if (graphOk !== rayOk) {
    bad++;
    console.log(`${String(op.line).padStart(5)} (${x.toFixed(2)},${z.toFixed(2)})->(${nx.toFixed(2)},${nz.toFixed(2)})  ${graphOk}  ${nearest === Infinity ? '无' : nearest.toFixed(4) + '(' + who + ')'}  ${graphOk ? '图可→射线撞 ✗' : '图不可→射线通'}`);
  }
  x = nx; z = nz;
}
function fullColliders() {
  const arr = [];
  for (const c of (require(path.join(D2, 'world_task2.json')).colliders || [])) if (String(c.id).startsWith('object:')) arr.push({ id: c.id, x: c.x, z: c.z, r: c.radius });
  for (const p of require(path.join(D2, 'inter_task2.json')).packages) arr.push({ id: p.id, x: p.x, z: p.z, r: p.radius });
  return arr;
}
console.log(`\n对照 ${checked} 条 forward，分歧 ${bad} 条`);
if (bad === 0) console.log('✅ 图判定与射线判定一致');
