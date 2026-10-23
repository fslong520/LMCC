#!/usr/bin/env node
// 任务二「理论下界」评估：判断 124.8s 满分线是否可达。
//
// 方法：把可行域（道路走廊并集，扣除障碍与包裹堆）离散成栅格，
//       用 16 向 Dijkstra 求各停靠点之间的最短可行驶距离（纯几何距离，不含转向）。
//       再加上「转向下限（每次至少 260ms = 13 tick）」与「交互动画（固定）」，
//       得到任何合法路线都无法突破的时长下界。
//
// 用法: node tools2/lower_bound2.js
'use strict';
const fs = require('fs');
const path = require('path');

const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const interDef = JSON.parse(fs.readFileSync(path.join(D2, 'inter_task2.json'), 'utf8'));
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors2.json'), 'utf8'));
const VEH_R = 0.44, MARGIN = 0.03, RES = 0.07;

const SEGS = [];
for (const r of scene.roads) {
  const allow = r.width / 2 - VEH_R;
  if (allow <= 0) continue;
  for (let i = 0; i < r.points.length - 1; i++)
    SEGS.push({ ax: r.points[i][0], az: r.points[i][1], bx: r.points[i + 1][0], bz: r.points[i + 1][1], allow });
}
const sd = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};
const marginAt = (x, z) => {
  let b = -Infinity;
  for (const s of SEGS) { const m = s.allow - MARGIN - sd(x, z, s.ax, s.az, s.bx, s.bz); if (m > b) b = m; }
  return b;
};
const BLOCK = interDef.packages.map(p => ({ x: p.x, z: p.z, r: (p.r ?? p.radius ?? 0.28) + VEH_R + 0.005 + 0.03, id: p.id }));

// ---------- 栅格 ----------
const B = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 };
for (const s of SEGS) {
  B.minX = Math.min(B.minX, s.ax, s.bx); B.maxX = Math.max(B.maxX, s.ax, s.bx);
  B.minZ = Math.min(B.minZ, s.az, s.bz); B.maxZ = Math.max(B.maxZ, s.az, s.bz);
}
B.minX -= 0.8; B.maxX += 0.8; B.minZ -= 0.8; B.maxZ += 0.8;
const NX = Math.ceil((B.maxX - B.minX) / RES) + 1, NZ = Math.ceil((B.maxZ - B.minZ) / RES) + 1;
const gx = x => Math.round((x - B.minX) / RES), gz = z => Math.round((z - B.minZ) / RES);
const cx = i => B.minX + i * RES, cz = j => B.minZ + j * RES;

const free = new Uint8Array(NX * NZ);
let freeN = 0;
for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
  const x = cx(i), z = cz(j);
  let okk = marginAt(x, z) >= 0;
  if (okk) for (const b of BLOCK) if (Math.hypot(b.x - x, b.z - z) < b.r) { okk = false; break; }
  if (okk) { free[j * NX + i] = 1; freeN++; }
}
console.log(`栅格 ${NX} x ${NZ} = ${NX * NZ} 格，可行 ${freeN} (${(freeN / (NX * NZ) * 100).toFixed(1)}%)`);

function nearestFree(x, z) {
  let gi = Math.max(0, Math.min(NX - 1, gx(x))), gj = Math.max(0, Math.min(NZ - 1, gz(z)));
  if (free[gj * NX + gi]) return [gi, gj];
  for (let r = 1; r < 60; r++) {
    for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = gi + di, j = gj + dj;
      if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
      if (free[j * NX + i]) return [i, j];
    }
  }
  return null;
}

// 16 向
const DIRS = [];
for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; DIRS.push([Math.round(Math.cos(a) * 1000) / 1000, Math.round(Math.sin(a) * 1000) / 1000]); }

function dij(si, sj) {
  const INF = 1e18, N = NX * NZ;
  const d = new Float64Array(N).fill(INF);
  const s = sj * NX + si; d[s] = 0;
  // 二叉堆
  const heap = [s], key = new Float64Array(N); key[s] = 0;
  const pos = new Int32Array(N).fill(-1); pos[s] = 0;
  const swap = (a, b) => { const t = heap[a]; heap[a] = heap[b]; heap[b] = t; pos[heap[a]] = a; pos[heap[b]] = b; };
  const push = u => { heap.push(u); let i = heap.length - 1; pos[u] = i;
    while (i > 0) { const p = (i - 1) >> 1; if (key[heap[p]] <= key[heap[i]]) break; swap(p, i); i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); pos[top] = -1;
    if (heap.length) { heap[0] = last; pos[last] = 0; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && key[heap[l]] < key[heap[m]]) m = l;
        if (r < heap.length && key[heap[r]] < key[heap[m]]) m = r;
        if (m === i) break; swap(m, i); i = m; } }
    return top; };
  while (heap.length) {
    const u = pop();
    const i = u % NX, j = (u - i) / NX;
    for (const [dx, dz] of DIRS) {
      const ni = i + Math.round(dx), nj = j + Math.round(dz);   // 每步 1 格
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const v = nj * NX + ni;
      if (!free[v]) continue;
      const L = Math.hypot(cx(ni) - cx(i), cz(nj) - cz(j));
      const nc = d[u] + L;
      if (nc < d[v] - 1e-9) {
        d[v] = nc; key[v] = nc;
        if (pos[v] === -1) push(v); else { let k = pos[v]; while (k > 0) { const p = (k - 1) >> 1; if (key[heap[p]] <= key[heap[k]]) break; swap(p, k); k = p; } }
      }
    }
  }
  return d;
}

// ---------- 停靠点序列 ----------
const cps = scene.checkpoints.map(c => c.position);
const mergedSeq = [...anchors.events.map(e => ({ tick: e.tick, k: 'e', e })),
                   ...anchors.interactions.map(it => ({ tick: it.tick, k: 'i', it }))]
  .sort((a, b) => a.tick - b.tick);
const stops = [{ pos: [scene.start.x, scene.start.z], label: 'start' }];
for (const m of mergedSeq) {
  if (m.k === 'e') {
    if (m.e.type === 'checkpoint') stops.push({ pos: cps[m.e.index], label: `cp#${m.e.index}` });
    else if (m.e.type === 'goal_reached') stops.push({ pos: scene.goal, label: 'goal' });
  } else stops.push({ pos: [m.it.pose.x, m.it.pose.z], label: `${m.it.op}(${String(m.it.packageId).replace('guangyang-', '')})` });
}

console.log('\n=== 栅格最短可行驶距离（纯距离）===');
let sum = 0;
const cache = new Map();
for (let i = 1; i < stops.length; i++) {
  const a = stops[i - 1], b = stops[i];
  const fa = nearestFree(a.pos[0], a.pos[1]), fb = nearestFree(b.pos[0], b.pos[1]);
  if (!fa || !fb) { console.log(`  ${a.label} -> ${b.label} 不可达`); continue; }
  const key = fa[0] + ',' + fa[1];
  let d = cache.get(key);
  if (!d) { d = dij(fa[0], fa[1]); cache.set(key, d); }
  const dist = d[fb[1] * NX + fb[0]];
  const total = dist + Math.hypot(cx(fa[0]) - a.pos[0], cz(fa[1]) - a.pos[1]) + Math.hypot(cx(fb[0]) - b.pos[0], cz(fb[1]) - b.pos[1]);
  sum += total;
  console.log(`  ${(a.label + ' -> ' + b.label).padEnd(46)} ${total.toFixed(2).padStart(7)}u  ${(total * 12.5).toFixed(1).padStart(7)}cm`);
}
const dtU = u => Math.max(1, Math.ceil(u / 0.025));
const driveTicks = dtU(sum);
const minTurns = stops.length - 1, turnFloor = minTurns * 13;
const INTER = 288;
const lb = driveTicks + turnFloor + INTER;
console.log(`\n栅格最短合计 ${sum.toFixed(2)}u = ${(sum * 12.5).toFixed(1)}cm -> 行驶下界 ${driveTicks} tick`);
console.log(`基线行驶 172.8u = 2160.0cm -> 6947 tick（实测）`);
console.log(`\n理论下界 = 行驶 ${driveTicks} + 转向下限(${minTurns}次×13) ${turnFloor} + 交互 ${INTER} = ${lb} tick = ${(lb * 0.02).toFixed(1)}s`);

const eff = d => { const f = 124.8, o = 120, t = 24, m = 600;
  if (d <= f) return 20; if (d >= m) return 0;
  const raw = Math.max(0, Math.min(1, (m - d) / (m - o))); const mf = (m - o) / (m - f);
  const dec = Math.exp(-(d - f) / t);
  return Math.round(20 * Math.max(0, Math.min(1, raw * (1 + (mf - 1) * dec))) * 10) / 10; };
console.log(`下界 ${(lb * 0.02).toFixed(1)}s -> 效率分上限 ${eff(lb * 0.02)} -> 总分上限 ${(100 - (20 - eff(lb * 0.02))).toFixed(1)}`);
console.log(lb <= 6240 ? '✅ 下界低于满分线 124.8s，100 分理论可达' : '❌ 下界高于满分线 124.8s，100 分不可达');
