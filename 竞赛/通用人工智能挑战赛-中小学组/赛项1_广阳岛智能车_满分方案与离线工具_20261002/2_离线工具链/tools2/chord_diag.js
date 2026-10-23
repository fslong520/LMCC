'use strict';
// 诊断：对 ord15 每腿检查「首尾直线弦」是否可行（走廊 margin + 活跃阻挡者），
// 区分「绕行是几何强制」 vs 「图/搜索漏了直边」。
const fs = require('fs'), path = require('path');
const { CM, dtU } = require('../tools/route_lib.js');
const dir = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(dir, 'scene_task2.json'), 'utf8'));
const inter = JSON.parse(fs.readFileSync(path.join(dir, 'inter_task2.json'), 'utf8'));
const VEH_R = 0.44;

const sd = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz)); };
const SEGS = [];
for (const r of scene.roads) { const allow = r.width / 2 - VEH_R; if (allow <= 0) continue;
  for (let i = 0; i < r.points.length - 1; i++)
    SEGS.push({ ax: r.points[i][0], az: r.points[i][1], bx: r.points[i + 1][0], bz: r.points[i + 1][1], allow }); }
const marginAt = (x, z) => { let b = -Infinity; for (const s of SEGS) b = Math.max(b, s.allow - sd(x, z, s.ax, s.az, s.bx, s.bz)); return b; };
const blockers = inter.packages.map(p => ({ x: p.x, z: p.z, r: (p.r ?? p.radius ?? 0.28) + VEH_R + 0.005 + 0.002, id: p.id }));

// 重建路线顶点
const lines = fs.readFileSync(process.argv[2] || 'routes2/candidates/T2_ord15.py', 'utf8').trim().split('\n');
let x = scene.start.x, z = scene.start.z, h = scene.start.h;
const V = [{ x, z, h, op: 'start' }];
for (const l of lines) {
  let m;
  if ((m = l.match(/^robot\.forward\(([-\d.]+)\)$/))) { const L = Math.abs(+m[1]) / CM;
    x -= Math.sin(h) * L; z -= Math.cos(h) * L; V.push({ x, z, h, op: 'f' }); }
  else if ((m = l.match(/^robot\.(left_angle|right_angle)\(([-\d.]+)\)$/))) {
    h += (m[1] === 'left_angle' ? 1 : -1) * (+m[2]) * Math.PI / 180; V.push({ x, z, h, op: 't' }); }
  else if (l === 'robot.grab()') V.push({ x, z, h, op: 'grab' });
  else if (l === 'robot.release()') V.push({ x, z, h, op: 'rel' });
}
// 按交互切腿 + 腿内先直线弦（跳过首腿内的 cp 绕行——弦只取腿首尾）
const legs = [];
let cur = [V[0]];
for (let i = 1; i < V.length; i++) {
  cur.push(V[i]);
  if (V[i].op === 'grab' || V[i].op === 'rel') { legs.push(cur); cur = [V[i]]; }
}
if (cur.length > 1) legs.push(cur);

// 各腿期间的活跃阻挡者（近似：按 seq 语义手工推 done/hold 会太脆——
// 这里直接打印弦的走廊最小 margin 与「被哪些包裹挡」，供人工判断）
const label = (g) => {
  const a = g[0], b = g[g.length - 1];
  return `(${a.x.toFixed(1)},${a.z.toFixed(1)})[${a.op}] -> (${b.x.toFixed(1)},${b.z.toFixed(1)})[${b.op}]`;
};
for (const g of legs) {
  const a = g[0], b = g[g.length - 1];
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(2, Math.ceil(L / 0.002));
  let minM = Infinity, worst = null;
  const hit = new Set();
  for (let k = 0; k <= n; k++) {
    const t = k / n, px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
    const m = marginAt(px, pz);
    if (m < minM) { minM = m; worst = t; }
    for (const bl of blockers) if (Math.hypot(bl.x - px, bl.z - pz) < bl.r) hit.add(bl.id.replace('guangyang-', ''));
  }
  let travel = 0;
  for (let i = 1; i < g.length; i++) if (g[i].op === 'f' || g[i - 1].op === 't') {}
  for (let i = 1; i < g.length; i++) { const gi = g[i]; if (gi.op === 'f') { /* 找前一个非turn点 */ } }
  // 行程：直接用 forward 指令
  console.log(`${label(g)}  弦长 ${L.toFixed(2)}  弦minMargin ${minM.toFixed(4)}@${worst.toFixed(2)}  弦挡者 ${[...hit].join(',') || '无'}`);
}
