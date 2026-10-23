#!/usr/bin/env node
// 平台判据对齐验证
//
// 平台 nearestRoad（core.js:1386）：按「到道路折线的距离」升序排序，取第一条路，
//   检查该路的 onRoad = distance <= width/2 - vehicleRadius。
// 我旧的 marginAt：取所有路中「净空余量最大者」。两者在岔路口处结论相反。
//
// 本脚本：输入若干候选点，同时报告两种判据，找出分歧。
// 用法: node tools2/align_roadrule.js [x,z] ...
'use strict';
const fs = require('fs');
const path = require('path');
const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const VEH_R = 0.44, EPS = 1e-9;

// 按道路分组（平台对 road 级别排序，不是 segment）
const roadGroups = scene.roads.map(r => ({
  id: r.id, width: r.width,
  clearance: r.width / 2 - VEH_R,
  segs: r.points.slice(0, -1).map((p, i) => ({ ax: p[0], az: p[1], bx: r.points[i + 1][0], bz: r.points[i + 1][1] }))
}));
function distToPolyline(x, z, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    d = Math.min(d, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return d;
}
// 平台判据
function platformOnRoad(x, z) {
  const cands = scene.roads.map(r => ({ r, d: distToPolyline(x, z, r.points) }));
  cands.sort((a, b) => a.d - b.d);
  const sel = cands[0];
  const on = sel.d <= sel.r.width / 2 - VEH_R + EPS;
  return { on, road: sel.r.id, d: sel.d, clearance: sel.r.width / 2 - VEH_R };
}
// 我旧的判据（最大净空余量）
function oldMargin(x, z) {
  let best = -Infinity, road = null;
  for (const r of scene.roads) {
    const d = distToPolyline(x, z, r.points);
    const m = r.width / 2 - VEH_R - d;
    if (m > best) { best = m; road = r.id; }
  }
  return { m: best, road };
}

const pts = process.argv.slice(2).length
  ? process.argv.slice(2).map(s => s.split(',').map(Number))
  : [
      [-1.779, -4.703],    // T2_v4 首个越界点
      [-1.767, -4.725],
      [-1.755, -4.746],
      [4.546, 5.868],
      [4.522, 5.861],
      [-9.605, -6.534],    // release(target) 锚点
      [13.7297, 0.7568],   // cp#5
    ];
console.log('点                       平台判据                            旧判据            一致?');
let diff = 0;
for (const [x, z] of pts) {
  const P = platformOnRoad(x, z);
  const O = oldMargin(x, z);
  const agree = P.on === (O.m >= 0);
  if (!agree) diff++;
  console.log(`(${x},${z})`.padEnd(20)
    + `${P.on ? '在路内' : '越界  '} 路${P.road.padEnd(20)} d=${P.d.toFixed(4)} cl=${P.clearance.toFixed(3)}`.padEnd(40)
    + `margin=${O.m.toFixed(4)}`.padEnd(20)
    + (agree ? '✓' : '✗ 分歧'));
}
console.log(`\n分歧 ${diff} / ${pts.length}`);
if (diff) console.log('→ 旧判据比平台宽松，会放行平台会判越界的点');
else console.log('→ 两判据一致');
