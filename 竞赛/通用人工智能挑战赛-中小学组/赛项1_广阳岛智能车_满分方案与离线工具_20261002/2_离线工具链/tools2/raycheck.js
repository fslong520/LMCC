#!/usr/bin/env node
// 同构复核：用平台内核的射线判定，检查「图判为可行」的每条边在真实仿真中是否可行。
// 目标：找出图判定与仿真的分歧点 —— 这是候选越界与抓取失败的根因。
// 用法: node tools2/raycheck.js [route.py]
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../tools/core.js');

const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const full = JSON.parse(fs.readFileSync(path.join(D2, 'full_task2.json'), 'utf8'));
const simDef = full.sim, WORLD = full.world;
const VEH_R = 0.44, MARGIN = 0.06, ANCHOR_MARGIN = 0.02;

// 构建碰撞体（注意 id 必须唯一，上一版此处崩了）
const colliders = [];
for (const c of (WORLD.colliders || [])) if (String(c.id).startsWith('object:')) colliders.push({ ...c });
for (const p of full.packages) colliders.push({ id: `stack:${p.id}`, type: 'circle', x: p.x, z: p.z, radius: 0.28 });
const world = { ...WORLD, colliders };

// 射线判定（平台内核同构）：从 origin 沿 dir 单位向量，直到被半径 R 的圆挡住
const rayCircle = (ox, oz, dx, dz, cx, cz, R) => {
  const px = ox - cx, pz = oz - cz;
  const proj = px * dx + pz * dz;
  const dist2 = px * px + pz * pz - R * R;
  if (dist2 < -1e-9) return 0;
  if (dist2 <= 1e-9) return proj < 0 ? 0 : Infinity;
  if (proj >= 0) return Infinity;
  const disc = proj * proj - dist2;
  if (disc <= 1e-9) return Infinity;
  return Math.max(0, -proj - Math.sqrt(disc));
};
// 车沿直线行驶的可用距离（碰撞）——R = 车半径 + 障碍半径
function rayHit(ax, az, bx, bz) {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 1e-9) return Infinity;
  const dx = (bx - ax) / L, dz = (bz - az) / L;
  let nearest = L;
  for (const c of colliders) {
    const hit = rayCircle(ax, az, dx, dz, c.x, c.z, VEH_R + c.radius);
    if (hit < nearest) nearest = hit;
  }
  return nearest;
}

// 图的边判定（复刻 generate2.js 的判据）
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
function graphOk(ax, az, bx, bz, margin, step) {
  const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (marginAt(ax + (bx - ax) * t, az + (bz - az) * t) + (MARGIN - margin) < -1e-9) return false;
  }
  return true;
}

const route = process.argv[2] || path.join(__dirname, '..', 'routes2', 'candidates', 'T2_v1.py');
const { parseProgram } = require('./replay2.js');
const ops = parseProgram(fs.readFileSync(route, 'utf8'));

// 开环执行，逐段检查两种判据
let h = scene.start.h, x = scene.start.x, z = scene.start.z;
console.log(`复核 ${path.basename(route)}（共 ${ops.length} 指令）`);
console.log('    指令                       图判定   射线判定  分歧');
let divergences = 0, graphTrue = 0, rayBlocks = 0;
for (const op of ops) {
  if (op.kind !== 'drive') {
    if (op.kind === 'turn') h = ((h + op.dir * op.deg * Math.PI / 180 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    else if (op.kind === 'grab') break;   // 到第一次抓取为止
    continue;
  }
  const L = op.cm * UPM_() / 100;
  const nx = x + -Math.sin(h) * L, nz = z + -Math.cos(h) * L;
  const g = graphOk(x, z, nx, nz, MARGIN, 0.01);
  const hit = rayHit(x, z, nx, nz);
  const rayOk = hit >= L - 1e-9;
  if (g) graphTrue++;
  if (g && !rayOk) {
    rayBlocks++;
    divergences++;
    console.log(`  line ${String(op.line).padStart(3)}  (${x.toFixed(3)},${z.toFixed(3)})->(${nx.toFixed(3)},${nz.toFixed(3)})  可行  射线 ${hit.toFixed(4)} < ${L.toFixed(4)}  ✗ 分歧`);
  }
  x = nx; z = nz;
}
console.log(`\n图判为可行的行驶: ${graphTrue}`);
console.log(`其中射线判定会撞: ${rayBlocks}`);
console.log(divergences ? '❌ 存在图与仿真不一致 —— 这就是越界/抓取失败的根因' : '✅ 两种判定一致');

function UPM_() { return Number(scene.upm) || 8; }
