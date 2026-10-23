#!/usr/bin/env node
// 任务二 闭环生成器：与重放器共用同一仿真内核，边执行边取真实位姿。
//
// 为什么必须闭环：开环推算（自己用 sin/cos 累加）与重放器实际执行存在偏差，
//   前几版候选因此出现「路径走到一半撞包裹堆被阻塞，位置漂移 1.5u」，
//   抓取锥判定随之失败（behind/side/far）。闭环可彻底消除这类不符。
//
// 做法：每一步都用 sim.pose 的真实值反解转向角与前进距离；
//   路径由走廊可见性图给出（节点序列），执行时按真实位姿逐点修正。
//
// 用法: node tools2/emit_closed.js [--out routes2/candidates/T2_closed.py]
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../tools/core.js');
const { dtU, tt, wrap, CM } = require('../tools/route_lib.js');

const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const full = JSON.parse(fs.readFileSync(path.join(D2, 'full_task2.json'), 'utf8'));
const interDef = full.inter;
const simDef = full.sim;
const WORLD = full.world;
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors2.json'), 'utf8'));

const UPM = 8, STEP_MS = 20, NOM = 1.25, MAX_ANG = 2.8;
const VEH_R = 0.44, MARGIN = 0.06, ANCHOR_MARGIN = 0.05, MIN_TURN_DEG = 1.0;
const costTurn = d => (d < MIN_TURN_DEG ? 0 : tt(d));

// ---------- 走廊几何 ----------
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
const SKIN = 0.005, OBS_MARGIN = 0.06;
const blockers = interDef.packages.map(p => ({ x: p.x, z: p.z, r: (p.r ?? p.radius ?? 0.28) + VEH_R + SKIN + OBS_MARGIN, id: p.id }));
const blockersFor = ig => (ig ? blockers.filter(b => !ig.includes(b.id)) : blockers);
function segOk(ax, az, bx, bz, margin, step, ignore) {
  const bl = blockersFor(ignore);
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    if (marginAt(px, pz) + (MARGIN - margin) < -1e-9) return false;
    for (const b of bl) if (Math.hypot(b.x - px, b.z - pz) < b.r) return false;
  }
  return true;
}

// ---------- 任务点 ----------
const cps = scene.checkpoints.map(c => c.position);
const relPose = {}, grabPose = {};
for (const it of anchors.interactions) (it.op === 'release' ? relPose : grabPose)[it.packageId] = { pos: [it.pose.x, it.pose.z], h: it.pose.h };
const P = {};
for (const p of interDef.packages) if (p.role !== 'obstacle') P[p.id] = p;

const POINTS = [];
const addPoint = o => { POINTS.push({ id: POINTS.length, ...o }); return POINTS.length - 1; };
const ID = { cp: [], grab: {}, rel: {} };
ID.start = addPoint({ x: scene.start.x, z: scene.start.z, h: scene.start.h, kind: 'start', label: 'start' });
ID.goal = addPoint({ x: scene.goal[0], z: scene.goal[1], h: null, kind: 'goal', label: 'goal' });
for (const id of Object.keys(P)) {
  ID.grab[id] = addPoint({ x: grabPose[id].pos[0], z: grabPose[id].pos[1], h: grabPose[id].h, kind: 'grab', pkg: id, label: `grab(${id.replace('guangyang-', '')})` });
  ID.rel[id] = addPoint({ x: relPose[id].pos[0], z: relPose[id].pos[1], h: relPose[id].h, kind: 'release', pkg: id, label: `drop(${id.replace('guangyang-', '')})` });
}
for (let i = 0; i < cps.length; i++) ID.cp.push(addPoint({ x: cps[i][0], z: cps[i][1], h: null, kind: 'cp', idx: i, label: `cp#${i}` }));

// ---------- 图 ----------
const nodes = [];
const nodeAt = new Map();
const nkey = (x, z) => `${Math.round(x * 50)},${Math.round(z * 50)}`;
const pushNode = (x, z, tag) => {
  const k = nkey(x, z);
  if (nodeAt.has(k)) { const n = nodeAt.get(k); if (tag) n.tags.push(tag); return n; }
  const n = { id: nodes.length, x, z, tags: tag ? [tag] : [] };
  nodes.push(n); nodeAt.set(k, n); return n;
};
for (const r of scene.roads) {
  const pts = r.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.25));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (marginAt(x, z) >= 0) pushNode(x, z, null);
    }
  }
}
const nodeOfPoint = POINTS.map(p => pushNode(p.x, p.z, p.label).id);
const pointIgnore = {};
for (const p of POINTS) if (p.pkg) pointIgnore[p.id] = [p.pkg];
const isTaskNode = new Set(nodeOfPoint);
const nodePoints = new Map();
POINTS.forEach((p, i) => { const nid = nodeOfPoint[i]; if (!nodePoints.has(nid)) nodePoints.set(nid, []); nodePoints.get(nid).push(p.id); });
const adj = nodes.map(() => []);
for (let i = 0; i < nodes.length; i++) {
  const a = nodes[i];
  for (let j = i + 1; j < nodes.length; j++) {
    const b = nodes[j];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-9 || L > 14) continue;
    const margin = (isTaskNode.has(i) || isTaskNode.has(j)) ? ANCHOR_MARGIN : MARGIN;
    let ig = [];
    for (const pid of (nodePoints.get(i) || [])) if (pointIgnore[pid]) ig = ig.concat(pointIgnore[pid]);
    for (const pid of (nodePoints.get(j) || [])) if (pointIgnore[pid]) ig = ig.concat(pointIgnore[pid]);
    ig = [...new Set(ig)];
    if (!segOk(a.x, a.z, b.x, b.z, margin, 0.01, ig.length ? ig : null)) continue;
    adj[i].push({ v: j, L }); adj[j].push({ v: i, L });
  }
}
console.log(`节点 ${nodes.length}，边 ${adj.reduce((s, a) => s + a.length, 0) / 2}`);

// ---------- 路径搜索（禁止折返） ----------
function searchPath(srcNode, srcH, dstNode) {
  if (srcNode === dstNode) return { ticks: 0, path: [srcNode] };
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
  const s = nodes[srcNode];
  for (const e of adj[srcNode]) {
    const b = nodes[e.v];
    const h = Math.atan2(-(b.x - s.x), -(b.z - s.z));
    const key = `${e.v}|${srcNode}`;
    const t = costTurn(Math.abs(wrap(h - srcH) * 180 / Math.PI)) + dtU(e.L);
    if (!best.has(key) || t < best.get(key) - 1e-9) { best.set(key, t); prev.set(key, { back: null, hdg: h }); push({ key, node: e.v, ticks: t }); }
  }
  let gBest = null, gKey = null;
  while (pq.length) {
    const cur = pop();
    if (cur.ticks > (best.get(cur.key) ?? 1e18) + 1e-9) continue;
    if (cur.node === dstNode) { if (gBest === null || cur.ticks < gBest) { gBest = cur.ticks; gKey = cur.key; } continue; }
    const a = nodes[cur.node], p = prev.get(cur.key);
    const backNode = Number(cur.key.split('|')[1]);
    for (const e of adj[cur.node]) {
      if (e.v === backNode) continue;
      const b = nodes[e.v];
      const h = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      const key = `${e.v}|${cur.node}`;
      const t = cur.ticks + costTurn(Math.abs(wrap(h - p.hdg) * 180 / Math.PI)) + dtU(e.L);
      if (!best.has(key) || t < best.get(key) - 1e-9) { best.set(key, t); prev.set(key, { back: cur.key, hdg: h }); push({ key, node: e.v, ticks: t }); }
    }
  }
  if (gKey === null) return null;
  const path = []; let k = gKey;
  while (k) { path.push(Number(k.split('|')[0])); const p = prev.get(k); if (!p) break; k = p.back; }
  path.reverse();
  return { ticks: gBest, path };
}

// ---------- 闭环执行 ----------
const sim = new core.DeterministicSimulator(simDef);
const obstacleColliders = (WORLD.colliders || []).filter(c => String(c.id).startsWith('object:'));
const stackPos = new Map();
for (const p of (full.packages || [])) stackPos.set(`${p.x.toFixed(3)},${p.z.toFixed(3)}`, { x: p.x, z: p.z });
function syncWorld(heldKey) {
  const colliders = obstacleColliders.slice();
  for (const [key, pos] of stackPos) {
    if (key === heldKey) continue;
    colliders.push({ id: `package-stack:${key}`, type: 'circle', x: pos.x, z: pos.z, radius: 0.28 });
  }
  sim.setWorld({ ...WORLD, colliders });
}
syncWorld(null);

const metadata = {
  teamId: 'tea_gen', sourceCode: 'gen',
  runDefinition: { simulationDefinition: simDef, interactionDefinition: interDef, ruleDefinition: full.config.rules, scoringDefinition: full.config.scoring },
  simulationDefinition: simDef, interactionDefinition: interDef
};
const session = core.createSession(full.config, metadata, { now: () => 0 });
let sinceSample = 0;
const sample = () => { const p = sim.pose;
  session.sample({ x: p.x, z: p.z, heading: p.heading, speed: 0, steering: 0, tick: sim.tick }, { forceRecord: false }); sinceSample = 0; };
const advance = n => { for (let i = 0; i < n; i++) { sim.step(); sinceSample++; if (sinceSample >= 5) sample(); } };

const lines = [];
let ticks = 0;
function execTurn(deg, dirSign) {
  if (deg < MIN_TURN_DEG) return;
  const sec = tt(deg) * STEP_MS / 1000;
  sim.startCommand({ kind: 'turn_angle', direction: dirSign, angleDegrees: deg, durationMs: sec * 1000 });
  while (sim.hasActiveCommand()) advance(1);
  ticks += tt(deg);
  lines.push(`robot.${dirSign > 0 ? 'left_angle' : 'right_angle'}(${deg.toFixed(4)})`);
}
function execAlign(hWant) {
  const dv = wrap(hWant - sim.pose.heading);
  const deg = Math.abs(dv * 180 / Math.PI);
  if (deg < MIN_TURN_DEG) return;
  execTurn(deg, dv > 0 ? 1 : -1);
}
function execDrive(L) {
  if (L <= 1e-4) return;
  const tk = Math.max(1, Math.ceil(L / (NOM * STEP_MS / 1000)));
  const dur = tk * STEP_MS, speed = L / (dur / 1000);
  sim.startCommand({ kind: 'drive', direction: 1, durationMs: dur, speed });
  while (sim.hasActiveCommand()) advance(1);
  ticks += tk;
  lines.push(`robot.forward(${(L * CM).toFixed(4)})`);
}
function execMoveTo(pt) {
  // 从真实位姿出发，逐步走向目标点
  for (let guard = 0; guard < 50; guard++) {
    const p = sim.pose;
    const L = Math.hypot(pt[0] - p.x, pt[1] - p.z);
    if (L < 0.01) break;
    execAlign(Math.atan2(-(pt[0] - p.x), -(pt[1] - p.z)));
    execDrive(L);
  }
}
function execInteract(kind) {
  const preMs = kind === 'grab' ? 480 : 260;
  const postMs = kind === 'grab' ? 280 : 420;
  sim.startCommand({ kind: 'wait', durationMs: preMs });
  while (sim.hasActiveCommand()) advance(1);
  sample();
  const res = session.addInteractionInput(kind === 'grab' ? 'package_grab' : 'package_release', { source: 'python' });
  if (res && res.accepted) {
    const rp = res.position || [0, 0];
    if (kind === 'grab') {
      let found = null, bd = 1e9;
      for (const [k, p] of stackPos) { const d = Math.hypot(p.x - rp[0], p.z - rp[1]); if (d < bd) { bd = d; found = k; } }
      syncWorld(bd < 0.35 ? found : null);
    } else {
      // 简化：释放后按落点加回
      syncWorld(null);
    }
  }
  ticks += Math.ceil((preMs + postMs) / STEP_MS);
  lines.push(kind === 'grab' ? 'robot.grab()' : 'robot.release()');
  if (postMs > 0) { sim.startCommand({ kind: 'wait', durationMs: postMs }); while (sim.hasActiveCommand()) advance(1); }
  return res;
}

// ---------- 按 seq 执行 ----------
const seq = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seq2d.json'), 'utf8')).seq;
const report = [];
let prevPid = ID.start;
for (let i = 1; i < seq.length; i++) {
  const s = seq[i];
  const dstPid = s.pid;
  const dst = POINTS[dstPid];
  // 用真实位姿找当前最近节点，再搜索路径
  const p = sim.pose;
  let curNode = 0, bd = 1e9;
  for (let k = 0; k < nodes.length; k++) { const d = Math.hypot(nodes[k].x - p.x, nodes[k].z - p.z); if (d < bd) { bd = d; curNode = k; } }
  const r = searchPath(curNode, p.heading, nodeOfPoint[dstPid]);
  if (!r) { report.push(`FAIL ${dst.label}`); continue; }
  for (const nid of r.path) {
    const n = nodes[nid];
    if (Math.hypot(n.x - p.x, n.z - p.z) < 0.02) continue;
    execMoveTo([n.x, n.z]);
  }
  // 精确对准作业朝向
  if (dst.h != null) execAlign(dst.h);
  const res = execInteract(dst.kind);
  report.push(`${dst.label}: ${res && res.accepted ? 'OK' : 'REJ ' + (res && res.reason)}`);
  prevPid = dstPid;
}

const outPath = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'routes2', 'candidates', 'T2_closed.py'); })();
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log('\n=== 闭环执行结果 ===');
for (const r of report) console.log('  ' + r);
console.log(`\n指令 ${lines.length}（转向 ${lines.filter(l => l.includes('angle')).length}，直行 ${lines.filter(l => l.includes('forward')).length}）`);
console.log(`tick ${ticks} = ${(ticks * 0.02).toFixed(2)}s | 仿真 endTick ${sim.tick}`);
console.log('已写', outPath);
