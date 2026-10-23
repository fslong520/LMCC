#!/usr/bin/env node
// 任务3 路线生成器 v2 —— 几何精确 + 作业点反解
//
// 相对 v1 的两处根本修正：
//   ① 可行域判定改为几何精确（点到道路折线距离 ≤ 半宽 - 车半径 - 余量），
//      不再用栅格 round 取整，消除「判定可行却实际越界」。
//   ② 抓放不再「走到锚点」，而是反解「作业站位」：
//        站位 S = 目标 - d * u   (d = 作业距离, u = 接近方向单位向量)
//        朝向 h 使车头正对目标 → lateral ≡ 0, forward ≡ d
//      取 d = 1.0（远小于上限 1.35、远大于下限 0.38），余量充足，
//      规避基线那种 forward=1.3461 贴上限的脆弱做法。
//      投放同理：release 后落点 = S + 1.1*u，取 d = 1.0 使落点落在目标 0.1 处，
//      小于 stackSnapDistance 0.62，会被吸附到位。
//
// 用法: node tools/generate2.js [--out routes/candidates/T3_v2.py]
'use strict';
const fs = require('fs');
const path = require('path');
const { loadScene, dtU, tt, wrap, CM } = require('./route_lib.js');

const { dd, auth } = loadScene();
const VEH_R = 0.44;
const MARGIN = 0.05;        // 额外安全余量
const WORK_DIST = 1.00;     // 作业距离（站到距目标 1.0 处）
const APPROACH = 1.55;      // 准备点距目标距离

// ---------- 几何精确可行域 ----------
const SEGS = [];
for (const r of dd.roads) {
  const allow = r.width / 2 - VEH_R - MARGIN;
  if (allow <= 0) continue;
  for (let i = 0; i < r.points.length - 1; i++) {
    SEGS.push({ ax: r.points[i][0], az: r.points[i][1], bx: r.points[i + 1][0], bz: r.points[i + 1][1], allow, road: r.id });
  }
}
function segDistPt(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
// 返回到最近可行道路的余量（>0 即可行）
function marginAt(x, z) {
  let best = -Infinity;
  for (const s of SEGS) {
    const m = s.allow - segDistPt(x, z, s.ax, s.az, s.bx, s.bz);
    if (m > best) best = m;
  }
  return best;
}
const drivable = (x, z) => marginAt(x, z) >= 0;
function segDrivable(ax, az, bx, bz, step = 0.04) {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.ceil(L / step));
  let worst = Infinity;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = marginAt(ax + (bx - ax) * t, az + (bz - az) * t);
    if (m < worst) worst = m;
    if (m < 0) return { ok: false, worst };
  }
  return { ok: true, worst };
}

// ---------- 障碍物（抓取时须保证目标比它们更近） ----------
const obstacles = auth.packages.filter(p => p.role === 'obstacle' || p.category === 'obstacle').map(p => [p.x, p.z]);
const packages = auth.packages.filter(p => !(p.role === 'obstacle' || p.category === 'obstacle'));
const PKGPOS = {}; for (const p of packages) PKGPOS[p.id] = [p.x, p.z];

// ---------- 作业站位反解 ----------
// 目标 target 需要「在车前 WORK_DIST、侧向 0」。站位随接近方向 u 变化。
// 关键区分：
//   抓取：target 是包裹，站位与中途路径都必须在可行域内。
//   投放：target 是「期望落点」，落点本身允许在路外（混淆物须移出道路），
//         故不要求站位->落点的整段可行驶；只要求站位可达，落点由几何决定。
function solveWorkPose(target, opts = {}) {
  const needObstacleClear = opts.needObstacleClear !== false;
  const requirePathToTarget = opts.requirePathToTarget !== false;
  const minS = opts.minS ?? { x: -1e9, z: -1e9 }, maxS = opts.maxS ?? { x: 1e9, z: 1e9 };
  const cands = [];
  for (let k = 0; k < 720; k++) {
    const th = k * Math.PI / 360;
    const ux = Math.cos(th), uz = Math.sin(th);
    // u = 由站位指向目标的方向；S = target - WORK_DIST*u
    const S = [target[0] - WORK_DIST * ux, target[1] - WORK_DIST * uz];
    const P = [target[0] - APPROACH * ux, target[1] - APPROACH * uz];
    if (S[0] < minS.x || S[0] > maxS.x || S[1] < minS.z || S[1] > maxS.z) continue;
    if (!drivable(S[0], S[1])) continue;
    const segSP = segDrivable(S[0], S[1], P[0], P[1]);
    if (!segSP.ok) continue;
    if (requirePathToTarget) {
      // 抓取：从准备点到目标之间也须可行驶（否则车头前方有障碍）
      const segPT = segDrivable(P[0], P[1], target[0], target[1]);
      if (!segPT.ok) continue;
    }
    const h = Math.atan2(-(target[0] - S[0]), -(target[1] - S[1]));
    if (needObstacleClear) {
      let ok = true;
      for (const o of obstacles) {
        if (Math.hypot(o[0] - S[0], o[1] - S[1]) <= WORK_DIST + 0.10) { ok = false; break; }
      }
      if (!ok) continue;
    }
    const mS = marginAt(S[0], S[1]);
    cands.push({ S, P, h, u: [ux, uz], marginS: mS, marginPath: Math.min(segSP.worst, requirePathToTarget ? segSP.worst : segSP.worst) });
  }
  if (!cands.length) return null;
  cands.sort((a, b) => (b.marginS + b.marginPath) - (a.marginS + a.marginPath));
  return cands[0];
}

// ---------- 锚点序列（顺序与朝向需求来自基线） ----------
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors.json'), 'utf8'));
const tl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'timeline.json'), 'utf8'));
const cps = dd.checkpoints.map(c => c.position);
const key = tl.timeline.filter(i => i.type.startsWith('interact:') || i.type.startsWith('event:checkpoint') || i.type === 'event:goal_reached');

const stops = [];
for (const k of key) {
  if (k.type === 'event:checkpoint') stops.push({ kind: 'pass', pos: cps[k.index], h: null, label: `cp#${k.index}` });
  else if (k.type === 'event:goal_reached') stops.push({ kind: 'pass', pos: dd.goal, h: null, label: 'goal' });
  else {
    const op = k.type.slice(9);           // grab | release
    const target = op === 'grab' ? PKGPOS[k.packageId] : null;
    stops.push({ kind: op, packageId: k.packageId, target, label: `${op}(${k.packageId.replace('guangyang-', '')})` });
  }
}

// 为每个交互解算作业姿态
const workPoses = [];
for (const s of stops) {
  if (s.kind === 'pass') { workPoses.push(null); continue; }
  // 抓取：目标为包裹本身
  // 投放：目标为「期望落点」，取基线的投放落点（已被 delivered 判定接受）
  let tgt;
  if (s.kind === 'grab') tgt = PKGPOS[s.packageId];
  else {
    const it = anchors.interactions.find(i => i.op === 'release' && i.packageId === s.packageId);
    tgt = it ? [it.pose.x + 1.1 * -Math.sin(it.pose.h), it.pose.z + 1.1 * -Math.cos(it.pose.h)] : null;
  }
  if (!tgt) { workPoses.push(null); continue; }
  const wp = solveWorkPose(tgt, { needObstacleClear: s.kind === 'grab' });
  workPoses.push(wp ? { ...wp, tgt } : null);
  if (!wp) console.log(`  警告：${s.label} 未找到作业站位`);
}

// ---------- 节点集 ----------
const nodes = [];
const pushNode = (x, z, tag) => {
  for (const n of nodes) if (Math.hypot(n.x - x, n.z - z) < 0.03) { n.tag += ',' + tag; return n; }
  const n = { id: nodes.length, x, z, tag };
  nodes.push(n); return n;
};
for (const r of dd.roads) for (const p of r.points) pushNode(p[0], p[1], 'road');
for (const s of stops) if (s.kind === 'pass') s.nodeId = pushNode(s.pos[0], s.pos[1], s.label).id;
stops.forEach((s, i) => {
  const wp = workPoses[i];
  if (wp) { s.nodeId = pushNode(wp.P[0], wp.P[1], `prep:${s.label}`).id; s.workNodeId = pushNode(wp.S[0], wp.S[1], `work:${s.label}`).id; }
});
pushNode(dd.start.x, dd.start.z, 'start');
pushNode(dd.goal[0], dd.goal[1], 'goal');

console.log(`几何段 ${SEGS.length}，节点 ${nodes.length}`);

// 可见性边
const adj = nodes.map(() => []);
let ec = 0;
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-9 || L > 40) continue;
    if (!segDrivable(a.x, a.z, b.x, b.z).ok) continue;
    adj[i].push({ v: j, L }); adj[j].push({ v: i, L }); ec++;
  }
}
console.log(`可见性边 ${ec}`);

// ---------- tick 最优搜索 ----------
function search(srcId, srcH, dstId, dstH) {
  if (srcId === dstId) {
    const extra = dstH == null ? 0 : tt(Math.abs(wrap(dstH - srcH) * 180 / Math.PI));
    return { ticks: extra, path: [srcId] };
  }
  const best = new Map(), prev = new Map(), pq = [];
  const push = it => { pq.push(it); let i = pq.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (pq[p].ticks <= pq[i].ticks) break; [pq[p], pq[i]] = [pq[i], pq[p]]; i = p; } };
  const pop = () => { const top = pq[0], last = pq.pop();
    if (pq.length) { pq[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < pq.length && pq[l].ticks < pq[m].ticks) m = l;
        if (r < pq.length && pq[r].ticks < pq[m].ticks) m = r;
        if (m === i) break; [pq[m], pq[i]] = [pq[i], pq[m]]; i = m; } }
    return top; };
  const s = nodes[srcId];
  for (const e of adj[srcId]) {
    const b = nodes[e.v];
    const h = Math.atan2(-(b.x - s.x), -(b.z - s.z));
    const key = `${e.v}|${srcId}`;
    const t = tt(Math.abs(wrap(h - srcH) * 180 / Math.PI)) + dtU(e.L);
    if (!best.has(key) || t < best.get(key) - 1e-9) {
      best.set(key, t); prev.set(key, { back: null, hdg: h });
      push({ key, node: e.v, ticks: t });
    }
  }
  let gBest = null, gKey = null;
  while (pq.length) {
    const cur = pop();
    if (cur.ticks > (best.get(cur.key) ?? 1e18) + 1e-9) continue;
    const p = prev.get(cur.key);
    if (cur.node === dstId) {
      const extra = dstH == null ? 0 : tt(Math.abs(wrap(dstH - p.hdg) * 180 / Math.PI));
      const tot = cur.ticks + extra;
      if (gBest === null || tot < gBest) { gBest = tot; gKey = cur.key; }
      continue;
    }
    const a = nodes[cur.node];
    for (const e of adj[cur.node]) {
      const b = nodes[e.v];
      const h = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      const key = `${e.v}|${cur.node}`;
      const t = cur.ticks + tt(Math.abs(wrap(h - p.hdg) * 180 / Math.PI)) + dtU(e.L);
      if (!best.has(key) || t < best.get(key) - 1e-9) {
        best.set(key, t); prev.set(key, { back: cur.key, hdg: h });
        push({ key, node: e.v, ticks: t });
      }
    }
  }
  if (gKey === null) return null;
  const path = []; let k = gKey;
  while (k) { path.push(Number(k.split('|')[0])); k = prev.get(k).back; }
  path.reverse();
  return { ticks: gBest, path };
}

// ---------- 生成 ----------
const lines = [];
let ticks = 0, curH = dd.start.h;
let curPos = [dd.start.x, dd.start.z];
const startNode = nodes.findIndex(n => n.tag.includes('start'));
let curNode = startNode;
const problems = [];

function emitTurnTo(want) {
  const dv = wrap(want - curH);
  const deg = Math.abs(dv * 180 / Math.PI);
  if (deg <= 0.02) return;
  lines.push(`robot.${dv > 0 ? 'left_angle' : 'right_angle'}(${deg.toFixed(4)})`);
  ticks += tt(deg); curH = want;
}
function emitForward(L) {
  if (L <= 1e-4) return;
  lines.push(`robot.forward(${(L * CM).toFixed(4)})`);
  ticks += dtU(L);
  curPos = [curPos[0] - Math.sin(curH) * L, curPos[1] - Math.cos(curH) * L];
}

for (let i = 0; i < stops.length; i++) {
  const s = stops[i];
  const wp = workPoses[i];
  if (s.kind === 'pass') {
    const r = search(curNode, curH, s.nodeId, null);
    if (!r) { problems.push(`${s.label} 不可达`); continue; }
    for (const nid of r.path) {
      const n = nodes[nid];
      emitTurnTo(Math.atan2(-(n.x - curPos[0]), -(n.z - curPos[1])));
      emitForward(Math.hypot(n.x - curPos[0], n.z - curPos[1]));
    }
    curNode = s.nodeId;
  } else {
    if (!wp) { problems.push(`${s.label} 无作业姿态`); continue; }
    // ① 走到准备点
    const r = search(curNode, curH, s.nodeId, null);
    if (!r) { problems.push(`${s.label} 准备点不可达`); continue; }
    for (const nid of r.path) {
      const n = nodes[nid];
      emitTurnTo(Math.atan2(-(n.x - curPos[0]), -(n.z - curPos[1])));
      emitForward(Math.hypot(n.x - curPos[0], n.z - curPos[1]));
    }
    // ② 从准备点沿接近方向走到作业站位
    const S = wp.S;
    emitTurnTo(Math.atan2(-(S[0] - curPos[0]), -(S[1] - curPos[1])));
    emitForward(Math.hypot(S[0] - curPos[0], S[1] - curPos[1]));
    // ③ 精确对准目标
    emitTurnTo(wp.h);
    // ④ 交互
    lines.push(s.kind === 'grab' ? 'robot.grab()' : 'robot.release()');
    ticks += s.kind === 'grab' ? 38 : 34;
    curNode = s.workNodeId;
  }
}

const outPath = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'routes', 'candidates', 'T3_v2.py'); })();
fs.writeFileSync(outPath, lines.join('\n') + '\n');

console.log(`\n指令 ${lines.length}（转向 ${lines.filter(l => l.includes('angle')).length}，直行 ${lines.filter(l => l.includes('forward')).length}）`);
console.log(`估算 tick ${ticks} = ${(ticks * 0.02).toFixed(2)}s（基线 10529，满分线 ${tl.budget.fullMarkLine}，差 ${ticks - tl.budget.fullMarkLine}）`);
if (problems.length) console.log('问题:', problems.join('; '));
console.log('已写', outPath);
