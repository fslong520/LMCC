#!/usr/bin/env node
// 任务二路线生成器 v2 —— 走廊栅格 A* + 转向感知代价
//
// 相对 v1（节点可见性图）的改进：
//   v1 的节点集只有「道路折线节点 + 锚点」，路径被迫经过折线节点，
//   而实际可行域是整条走廊，可在走廊内任意点转折。故 v1 有几段比基线还差。
//   v2 改为在走廊栅格上做 A*，方向用 16 向（22.5° 步长），
//   代价 = dtU(距离) + tt(转角)，直接以 tick 为目标；
//   再把栅格路径用 Douglas-Peucker 简化成直线段（保走廊内）。
//
// 锚点冻结为基线已验证的抓放位姿；检查点按序；障碍与包裹堆参与判定。
// 用法: node tools2/generate2b.js [--out routes2/candidates/T2_v2.py]
'use strict';
const fs = require('fs');
const path = require('path');
const { dtU, tt, wrap, CM } = require('../tools/route_lib.js');

const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const interDef = JSON.parse(fs.readFileSync(path.join(D2, 'inter_task2.json'), 'utf8'));
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors2.json'), 'utf8'));
const VEH_R = 0.44, MARGIN = 0.05;

// ---------- 走廊几何 ----------
const SEGS = [];
for (const r of scene.roads) {
  const allow = r.width / 2 - VEH_R;
  if (allow <= 0) continue;
  for (let i = 0; i < r.points.length - 1; i++)
    SEGS.push({ ax: r.points[i][0], az: r.points[i][1], bx: r.points[i + 1][0], bz: r.points[i + 1][1], allow });
}
const segDistPt = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};
// 到最近可行道路的余量（>0 即可行）；含 MARGIN 安全余量
function marginAt(x, z) {
  let best = -Infinity;
  for (const s of SEGS) { const m = s.allow - MARGIN - segDistPt(x, z, s.ax, s.az, s.bx, s.bz); if (m > best) best = m; }
  return best;
}
// 障碍与包裹堆
const BLOCK = interDef.packages.map(p => ({
  x: p.x, z: p.z, r: (p.r ?? p.radius ?? 0.28) + VEH_R + 0.005 + 0.05, id: p.id, role: p.role
}));
function clearBlock(x, z, ignore) {
  for (const b of BLOCK) {
    if (ignore && ignore.includes(b.id)) continue;
    if (Math.hypot(b.x - x, b.z - z) < b.r) return false;
  }
  return true;
}
function ok(x, z, ignore) { return marginAt(x, z) >= 0 && clearBlock(x, z, ignore); }

// ---------- 栅格 ----------
const RES = 0.10;
const B = { minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9 };
for (const s of SEGS) {
  B.minX = Math.min(B.minX, s.ax, s.bx); B.maxX = Math.max(B.maxX, s.ax, s.bx);
  B.minZ = Math.min(B.minZ, s.az, s.bz); B.maxZ = Math.max(B.maxZ, s.az, s.bz);
}
B.minX -= 1; B.maxX += 1; B.minZ -= 1; B.maxZ += 1;
const NX = Math.ceil((B.maxX - B.minX) / RES) + 1, NZ = Math.ceil((B.maxZ - B.minZ) / RES) + 1;
const gx = x => Math.round((x - B.minX) / RES), gz = z => Math.round((z - B.minZ) / RES);
const cellX = i => B.minX + i * RES, cellZ = j => B.minZ + j * RES;
console.log(`栅格 ${NX}x${NZ} 分辨率 ${RES}u`);

// ---------- 锚点序列 ----------
const cps = scene.checkpoints.map(c => c.position);
const mergedSeq = [...anchors.events.map(e => ({ tick: e.tick, k: 'e', e })),
                   ...anchors.interactions.map(it => ({ tick: it.tick, k: 'i', it }))]
  .sort((a, b) => a.tick - b.tick);
const stops = [];
for (const m of mergedSeq) {
  if (m.k === 'e') {
    if (m.e.type === 'checkpoint') stops.push({ kind: 'pass', pos: cps[m.e.index], h: null, label: `cp#${m.e.index}`, tick: m.e.tick });
    else if (m.e.type === 'goal_reached') stops.push({ kind: 'pass', pos: scene.goal, h: null, label: 'goal', tick: m.e.tick });
  } else {
    stops.push({ kind: m.it.op, packageId: m.it.packageId, pos: [m.it.pose.x, m.it.pose.z], h: m.it.pose.h,
      label: `${m.it.op}(${String(m.it.packageId).replace('guangyang-', '')})`, tick: m.it.tick });
  }
}
console.log('锚点序列:', stops.map(s => s.label).join(' -> '));

// ---------- 16 向 A* ----------
const DIRS = [];
for (let k = 0; k < 16; k++) {
  const a = k * Math.PI / 8;
  DIRS.push({ dx: Math.cos(a), dz: Math.sin(a), ang: a });
}
// 状态：格点 + 进入方向索引
function astar(from, fromH, to, toH, ignore) {
  const si = gx(from[0]), sj = gz(from[1]);
  const ti = gx(to[0]), tj = gz(to[1]);
  const key = (i, j, d) => (j * NX + i) * 17 + d;   // d=16 表示起始无方向
  const best = new Map(), prev = new Map();
  const pq = [];
  const push = it => { pq.push(it); let i = pq.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (pq[p].g + pq[p].h <= pq[i].g + pq[i].h) break; [pq[p], pq[i]] = [pq[i], pq[p]]; i = p; } };
  const pop = () => { const top = pq[0], last = pq.pop();
    if (pq.length) { pq[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < pq.length && pq[l].g + pq[l].h < pq[m].g + pq[m].h) m = l;
        if (r < pq.length && pq[r].g + pq[r].h < pq[m].g + pq[m].h) m = r;
        if (m === i) break; [pq[m], pq[i]] = [pq[i], pq[m]]; i = m; } }
    return top; };
  const hCost = (i, j) => dtU(Math.hypot(cellX(i) - to[0], cellZ(j) - to[1]));
  const startKey = key(si, sj, 16);
  best.set(startKey, 0); prev.set(startKey, null);
  push({ i: si, j: sj, d: 16, g: 0, h: hCost(si, sj), key: startKey });

  const seen = new Set();
  let goalKey = null;
  const STEP = 2;                       // 每步跨 2 格 = 0.2u，减少状态数
  while (pq.length) {
    const cur = pop();
    if (cur.g > (best.get(cur.key) ?? 1e18) + 1e-9) continue;
    if (cur.i === ti && cur.j === tj) { goalKey = cur.key; break; }
    if (seen.has(cur.key)) continue;
    seen.add(cur.key);
    for (let di = 0; di < 16; di++) {
      const D = DIRS[di];
      // 只允许方向索引差为 1、2、-1、-2 的转向（含直行），避免原地掉头
      const step = STEP;
      const ni = cur.i + Math.round(D.dx * step), nj = cur.j + Math.round(D.dz * step);
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const nx = cellX(ni), nz = cellZ(nj);
      const L = Math.hypot(nx - cellX(cur.i), nz - cellZ(cur.j));
      if (L < 1e-9) continue;
      // 整段采样检查
      let bad = false;
      const n = Math.max(2, Math.ceil(L / (RES * 0.6)));
      for (let t = 0; t <= n; t++) {
        const u = t / n;
        if (!ok(cellX(cur.i) + (nx - cellX(cur.i)) * u, cellZ(cur.j) + (nz - cellZ(cur.j)) * u, ignore)) { bad = true; break; }
      }
      if (bad) continue;
      // 转向代价
      let turnDeg;
      if (cur.d === 16) turnDeg = Math.abs(wrap(D.ang - fromH) * 180 / Math.PI);
      else turnDeg = Math.abs(wrap(D.ang - DIRS[cur.d].ang) * 180 / Math.PI);
      const g = cur.g + tt(turnDeg) + dtU(L);
      const k2 = key(ni, nj, di);
      if (g < (best.get(k2) ?? 1e18) - 1e-9) {
        best.set(k2, g); prev.set(k2, { i: cur.i, j: cur.j, d: cur.d, key: cur.key });
        push({ i: ni, j: nj, d: di, g, h: hCost(ni, nj), key: k2 });
      }
    }
  }
  if (goalKey === null) return null;
  // 回溯
  const path = []; let k = goalKey;
  while (k !== null && k !== undefined) {
    const idx = Math.floor(k / 17), d = k % 17;
    path.push({ i: idx % NX, j: Math.floor(idx / NX), d });
    const p = prev.get(k); if (!p) break; k = p.key;
  }
  path.reverse();
  // 转成点列
  const pts = path.map(p => [cellX(p.i), cellZ(p.j)]);
  // 末端对准作业朝向
  const totalTurn = toH == null ? 0 : tt(Math.abs(wrap(toH - DIRS[path[path.length - 1].d]?.ang ?? fromH) * 180 / Math.PI));
  return { ticks: best.get(goalKey) + totalTurn, pts, extraTurn: totalTurn };
}

// ---------- Douglas-Peucker 简化（保走廊内） ----------
function segOk(ax, az, bx, bz, ignore, step = 0.02) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!ok(ax + (bx - ax) * t, az + (bz - az) * t, ignore)) return false;
  }
  return true;
}
function simplify(pts, ignore, tol = 0.03) {
  const dp = (lo, hi) => {
    if (hi <= lo + 1) return [lo];
    const ax = pts[lo][0], az = pts[lo][1], bx = pts[hi][0], bz = pts[hi][1];
    const seg = Math.hypot(bx - ax, bz - az);
    let worst = -1, wi = lo + 1;
    for (let k = lo + 1; k < hi; k++) {
      const px = pts[k][0], pz = pts[k][1];
      let d;
      if (seg < 1e-9) d = Math.hypot(px - ax, pz - az);
      else { const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / (seg * seg)));
        d = Math.hypot(px - (ax + t * (bx - ax)), pz - (az + t * (bz - az))); }
      if (d > worst) { worst = d; wi = k; }
    }
    if (worst > tol || !segOk(pts[lo][0], pts[lo][1], pts[hi][0], pts[hi][1], ignore)) return dp(lo, wi).concat(dp(wi, hi));
    return [lo];
  };
  return dp(0, pts.length - 1).map(k => pts[k]).concat([pts[pts.length - 1]]);
}

// ---------- 生成 ----------
const lines = [];
let curH = scene.start.h, curPos = [scene.start.x, scene.start.z];
const problems = [], segReport = [];
const MIN_TURN_DEG = 1.0;

function emitTurnTo(want) {
  const dv = wrap(want - curH);
  const deg = Math.abs(dv * 180 / Math.PI);
  if (deg < MIN_TURN_DEG) return;
  if (deg > 360) { lines.push(`robot.${dv > 0 ? 'left_angle' : 'right_angle'}(180.0000)`); curH = wrap(curH + (dv > 0 ? Math.PI : -Math.PI)); return; }
  lines.push(`robot.${dv > 0 ? 'left_angle' : 'right_angle'}(${deg.toFixed(4)})`);
  curH = wrap(curH + dv);
}
function emitForward(L) {
  if (L <= 1e-4) return;
  lines.push(`robot.forward(${(L * CM).toFixed(4)})`);
  curPos = [curPos[0] - Math.sin(curH) * L, curPos[1] - Math.cos(curH) * L];
}

for (let i = 0; i < stops.length; i++) {
  const s = stops[i];
  // 该段允许忽略的包裹（即将抓取/投放者，否则贴不上去）
  const ignore = s.packageId ? [s.packageId] : null;
  const r = astar(curPos, curH, s.pos, s.h, ignore);
  if (!r) { problems.push(`${s.label} 不可达`); continue; }
  const simple = simplify(r.pts, ignore);
  let ticks = 0;
  for (let k = 0; k < simple.length; k++) {
    const p = simple[k];
    const L = Math.hypot(p[0] - curPos[0], p[1] - curPos[1]);
    if (L > 1e-4) {
      emitTurnTo(Math.atan2(-(p[0] - curPos[0]), -(p[1] - curPos[1])));
      emitForward(L);
    }
  }
  if (s.h != null) emitTurnTo(s.h);
  if (s.kind === 'grab') lines.push('robot.grab()');
  else if (s.kind === 'release') lines.push('robot.release()');
  const base = i === 0 ? stops[0].tick : s.tick - stops[i - 1].tick;
  segReport.push({ label: `-> ${s.label}`, base, opt: r.ticks });
}

// ---------- tick 统计与合法性自检 ----------
let finalTicks = 0;
const illegal = [];
lines.forEach((l, i) => {
  let m;
  if ((m = l.match(/^robot\.forward\(([\d.]+)\)$/))) finalTicks += dtU(+m[1] / CM);
  else if ((m = l.match(/^robot\.(left_angle|right_angle)\(([\d.]+)\)$/))) {
    const d = +m[2]; finalTicks += tt(d);
    if (d < 1 || d > 360) illegal.push(`line ${i + 1}: ${l}`);
  }
  else if (l === 'robot.grab()') finalTicks += 38;
  else if (l === 'robot.release()') finalTicks += 34;
});

const outPath = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'routes2', 'candidates', 'T2_v2.py'); })();
fs.writeFileSync(outPath, lines.join('\n') + '\n');

console.log('\n=== 逐段对比 ===');
for (const r of segReport) console.log(`  ${r.label.padEnd(34)} 基线 ${String(r.base).padStart(5)}  最优 ${String(r.opt).padStart(5)}  省 ${String(r.base - r.opt).padStart(5)}`);
const bSum = segReport.reduce((s, r) => s + r.base, 0), oSum = segReport.reduce((s, r) => s + r.opt, 0);
console.log('─'.repeat(70));
console.log(`  ${'合计'.padEnd(34)} 基线 ${String(bSum).padStart(5)}  最优 ${String(oSum).padStart(5)}  省 ${String(bSum - oSum).padStart(5)}`);
const FULL = Math.round(124.8 / 0.02);
console.log(`\n指令 ${lines.length}（转向 ${lines.filter(l => l.includes('angle')).length}，直行 ${lines.filter(l => l.includes('forward')).length}）`);
console.log(`估算 tick ${finalTicks} = ${(finalTicks * 0.02).toFixed(2)}s（基线 8256，满分线 ${FULL}，差 ${finalTicks - FULL}）`);
if (illegal.length) console.log(`❌ 非法转向 ${illegal.length} 处: ${illegal.slice(0, 3).join('; ')}`);
else console.log('✅ 全部转向角度均在 1~360 度内');
if (problems.length) console.log('问题:', problems.join('; '));
console.log('已写', outPath);
