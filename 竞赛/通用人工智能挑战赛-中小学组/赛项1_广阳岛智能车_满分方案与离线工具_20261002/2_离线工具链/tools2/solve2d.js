#!/usr/bin/env node
// 任务二 密集走廊图 + 顺序联合求解 v2
//
// 相对 v1 的关键改进：**加密节点**。
//   v1 节点只有「道路折线顶点 + 任务锚点」，两锚点间若直线切出走廊，就必须绕经折线顶点，
//   导致每段多绕 3~5u（合计 145.91u vs 理论直线和 126.38u）。
//   v2 沿道路折线按 0.25u 采样、并加入道路两两交点、检查点的门点（判定半径 1.05 内），
//   使可见性图逼近连续最优；用空间索引把 marginAt 从 O(158) 降到 O(10)，保住速度。
//
// 代价（真机 179 条指令逐条验证）：forward=max(1,ceil(u/0.025))，turn=ceil(max(260,deg/2.8*1000)/20)
// 用法: node tools2/solve2d.js [--out routes2/candidates/T2_v2.py]
'use strict';
const fs = require('fs');
const path = require('path');
const { dtU, tt, wrap, CM } = require('../tools/route_lib.js');

const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const interDef = JSON.parse(fs.readFileSync(path.join(D2, 'inter_task2.json'), 'utf8'));
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors2.json'), 'utf8'));
// 候选族（emit2 DUMP_CANDS 导出）：GRAB/REL 全位姿 + 15° 门点，与发射模型同源。
const CANDS_PATH = process.env.CANDS_JSON || path.join(__dirname, '..', 'cache2', 'cands_CD15.json');
const FAMS = fs.existsSync(CANDS_PATH) ? JSON.parse(fs.readFileSync(CANDS_PATH, 'utf8')) : null;
if (!FAMS) console.log('⚠ 未找到候选族导出，退回粗模型（单锚点+30°门点）');
const VEH_R = 0.44, MARGIN = 0.06, ANCHOR_MARGIN = 0.02, MIN_TURN_DEG = 1.0;
const TURN_W = 1.0;   // 转向按真实 tick（2.5 反而变差：为省转向而绕远）
// 符号感知对称化：转角 θ 可用倒车折算 180−θ（emit2 dpSigns 语义），
// 序列搜索按 min 计价，消除「搜索无倒车、发射有倒车」的模型偏差。
const costTurn = d => (d < MIN_TURN_DEG ? 0 : Math.min(tt(d), tt(Math.max(0, 180 - d))) * TURN_W);

// ---------- 走廊段 + 空间索引 ----------
const SEGS = [];
for (const r of scene.roads) {
  const allow = r.width / 2 - VEH_R;
  if (allow <= 0) continue;
  for (let i = 0; i < r.points.length - 1; i++)
    SEGS.push({ ax: r.points[i][0], az: r.points[i][1], bx: r.points[i + 1][0], bz: r.points[i + 1][1], allow, road: r.id });
}
const segDistPt = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};
const BUCKET = 2.0;
const buckets = new Map();
const bkey = (i, j) => `${i},${j}`;
SEGS.forEach((s, si) => {
  const x0 = Math.floor(Math.min(s.ax, s.bx) / BUCKET), x1 = Math.floor(Math.max(s.ax, s.bx) / BUCKET);
  const z0 = Math.floor(Math.min(s.az, s.bz) / BUCKET), z1 = Math.floor(Math.max(s.az, s.bz) / BUCKET);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    const k = bkey(i, j);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(si);
  }
});
function marginAt(x, z) {
  const bi = Math.floor(x / BUCKET), bj = Math.floor(z / BUCKET);
  let best = -Infinity, seen = null;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const l = buckets.get(bkey(bi + di, bj + dj));
    if (!l) continue;
    for (const si of l) {
      const s = SEGS[si];
      const m = s.allow - segDistPt(x, z, s.ax, s.az, s.bx, s.bz);
      if (m > best) best = m;
    }
  }
  if (best === -Infinity) {  // 远离所有段：回退全扫
    for (const s of SEGS) { const m = s.allow - segDistPt(x, z, s.ax, s.az, s.bx, s.bz); if (m > best) best = m; }
  }
  return best;
}
const SKIN = 0.005, OBS_MARGIN = 0.002;
const blockers = interDef.packages.map(p => ({
  x: p.x, z: p.z, r: (p.r ?? p.radius ?? 0.28) + VEH_R + SKIN + OBS_MARGIN, id: p.id, isObs: p.role === 'obstacle'
}));
// 忽略某包裹时，仍保留其「真实物理半径」（车半径+包裹半径+skin），
// 仅去掉 0.06 安全余量。曾因完全移除致路径擦过 0.724u（阈值 0.725u）而实撞。
// 忽略某包裹时用「物理半径」（车+包裹+skin=0.725），不额外加安全余量。
// 抓取锚点距其包裹 0.96~1.01u，故 0.725 的判定不会卡掉锚点连接。
const PHYS = new Map(interDef.packages.map(p => [p.id, (p.r ?? p.radius ?? 0.28) + VEH_R + SKIN]));
const blockersFor = ig => blockers.map(b =>
  (ig && ig.includes(b.id)) ? { ...b, r: PHYS.get(b.id) } : b);
function segOk(ax, az, bx, bz, margin, step, ignore) {
  const bl = blockersFor(ignore);
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / step));
  // req：普通边 0.01（吸收采样凹陷），锚点边 -0.002（锚点贴近路缘）。
  // 旧式 `marginAt + (MARGIN - margin) < req` 会把锚点边反向放松到 -0.04，
  // 让「必须轻微越界才能通过」的假缝混进图里，导致算出的最优序实际不可行。
  const req = margin >= MARGIN - 1e-12 ? 0.0005 : -0.0005;
  for (let i = 0; i <= n; i++) {
    const t = i / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    if (marginAt(px, pz) < req) return false;
    for (const b of bl) if (Math.hypot(b.x - px, b.z - pz) < b.r) return false;
  }
  return true;
}

// ---------- 任务点 ----------
const cps = scene.checkpoints.map(c => c.position);
const CP_R = scene.checkpointRadius ?? 1.05;
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
const FAM_GRAB = {}, FAM_REL = {};
if (FAMS) {
  for (const [pkg, arr] of Object.entries(FAMS.grab))
    FAM_GRAB[pkg] = arr.map(c => addPoint({ x: c.x, z: c.z, h: c.h, kind: 'grab', pkg, alignTol: c.alignTol, label: c.label }));
  for (const [pkg, arr] of Object.entries(FAMS.rel))
    FAM_REL[pkg] = arr.map(c => addPoint({ x: c.x, z: c.z, h: c.h, kind: 'release', pkg, alignTol: c.alignTol, label: c.label }));
}
for (const id of Object.keys(P)) {
  if (!FAM_GRAB[id]) FAM_GRAB[id] = [ID.grab[id]]; else FAM_GRAB[id].unshift(ID.grab[id]);
  if (!FAM_REL[id]) FAM_REL[id] = [ID.rel[id]]; else FAM_REL[id].unshift(ID.rel[id]);
}
// 锚点朝向容差 alignTol（度）——与 emit2.js 相同的语义：
//   grab 车体盒 lateral≤0.38 @1.0u → θ≤22°，取 15；release target 半径 0.95 → 取 20；
//   release distractor 落点路外距路缘≥0.2（margin≤-0.69），±θ 双向采样求最大可行角-5
{
  const relFwd = 1.1;
  const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); return Math.hypot(px - (ax + t * dx), pz - (az + t * dz)); };
  const marginAtPt = (x, z) => { let b = -Infinity;
    for (const r of scene.roads) { const allow = r.width / 2;
      for (let i = 0; i < r.points.length - 1; i++) b = Math.max(b, allow - segDist(x, z, r.points[i][0], r.points[i][1], r.points[i + 1][0], r.points[i + 1][1]));
      for (const p2 of r.points) b = Math.max(b, allow - Math.hypot(p2[0] - x, p2[1] - z)); }
    return b; };
  for (const p of POINTS) {
    if (p.kind === 'grab') { p.alignTol = 15; continue; }
    if (p.kind !== 'release') continue;
    if (P[p.pkg].role === 'target') { p.alignTol = 20; continue; }
    let tol = 0;
    for (let d = 5; d <= 60; d += 5) {
      let ok = true;
      for (const sgn of [1, -1]) {
        const h2 = p.h + sgn * d * Math.PI / 180;
        const lx = p.x - Math.sin(h2) * relFwd, lz = p.z - Math.cos(h2) * relFwd;
        if (marginAtPt(lx, lz) > -0.69) { ok = false; break; }
      }
      if (!ok) break;
      tol = d;
    }
    p.alignTol = Math.max(0, tol - 5);
  }
}
// 检查点：以「门点组」表示 —— 圆心 + 半径 0.95 圆上可行采样（判定半径 1.05，留 0.10 抗漂移余量）。
// 原实现只有圆心 → 每 cp 必须弯到圆心，6 个 cp 多绕 ~6u ≈ 240 tick。
const CP_GATES = [];
for (let i = 0; i < cps.length; i++) {
  const gates = [addPoint({ x: cps[i][0], z: cps[i][1], h: null, kind: 'cp', idx: i, label: `cp#${i}` })];
  if (FAMS) {
    // dump 门点组（15° 步，与发射同源；[0] 为圆心已在上面加过）
    for (const g of FAMS.gates[i]) {
      if (Math.abs(g.x - cps[i][0]) < 1e-9 && Math.abs(g.z - cps[i][1]) < 1e-9) continue;
      gates.push(addPoint({ x: g.x, z: g.z, h: null, kind: 'cp', idx: i, label: g.label || `cp#${i}` }));
    }
  } else for (let deg = 0; deg < 360; deg += 30) {
    const a = deg * Math.PI / 180;
    const gx = cps[i][0] + 0.95 * Math.cos(a), gz = cps[i][1] + 0.95 * Math.sin(a);
    if (marginAt(gx, gz) < 0) continue;
    let bad = false;
    for (const bl of blockers) if (Math.hypot(bl.x - gx, bl.z - gz) < bl.r) { bad = true; break; }
    if (bad) continue;
    gates.push(addPoint({ x: gx, z: gz, h: null, kind: 'cp', idx: i, label: `cp#${i}@${deg}` }));
  }
  CP_GATES.push(gates);
}
const ptOfCp = i => CP_GATES[i];

// ---------- 节点：道路折线采样 + 任务点 ----------
const nodes = [];
const nodeAt = new Map();
const nkey = (x, z) => `${Math.round(x * 50)},${Math.round(z * 50)}`;   // 0.02u 精度
const pushNode = (x, z, tag) => {
  const k = nkey(x, z);
  if (nodeAt.has(k)) { const n = nodeAt.get(k); if (tag) n.tags.push(tag); return n; }
  const n = { id: nodes.length, x, z, tags: tag ? [tag] : [] };
  nodes.push(n); nodeAt.set(k, n); return n;
};
// 采样步长：必须与生成器（tools2/generate2.js）用同一张图，
// 否则「搜索认为最优的顺序」在生成时退化成掉头绕行（曾因此连续失败）。
// GY_SPARSE=1 -> 只用道路折线顶点（与 generate2.js 一致）。
const SPARSE = process.env.GY_SPARSE === '1';
const SAMPLE = Number(process.env.GY_SAMPLE || 0.25);
for (const r of scene.roads) {
  const pts = r.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    if (SPARSE) { pushNode(ax, az, null); pushNode(bx, bz, null); continue; }
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / SAMPLE));
    const ux = (bx - ax) / (L || 1), uz = (bz - az) / (L || 1);
    const px = -uz, pz = ux;                       // 垂直方向
    const allow = r.width / 2 - VEH_R;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (marginAt(x, z) >= 0) pushNode(x, z, null);
      // 平行车道节点：走廊半宽 allow≈0.69~0.79，只采中心线会把「贴边拉直」的自由度砍掉。
      // 取 ±0.6·allow 两条偏置线（仍要求真在走廊内），给可见性图切角空间（与 emit2 同构）。
      // 偏置线 0.5u 间距（k 偶才采）：0.25u 对切角增益极小，节点/建边时间差 3 倍。
      if (k % 2 === 0) for (const sgn of [1, -1]) {
        const ox = x + sgn * Number(process.env.OFF_FRAC || 0.6) * allow * px, oz = z + sgn * Number(process.env.OFF_FRAC || 0.6) * allow * pz;
        if (marginAt(ox, oz) >= 0.005) pushNode(ox, oz, null);
      }
    }
  }
}
const nodeOfPoint = POINTS.map(p => pushNode(p.x, p.z, p.label).id);
console.log(`走廊段 ${SEGS.length}，节点 ${nodes.length}（含 ${POINTS.length} 任务点）`);

const pointIgnore = {};
for (const p of POINTS) if (p.pkg) pointIgnore[p.id] = [p.pkg];
const isTaskNode = new Set(nodeOfPoint);
const nodePoints = new Map();
POINTS.forEach((p, i) => { const nid = nodeOfPoint[i]; if (!nodePoints.has(nid)) nodePoints.set(nid, []); nodePoints.get(nid).push(p.id); });

// ---------- --dump：导出全部语义输入给 C++ 求解器（tools2/solve2d.cpp） ----------
// 在建边（O(n²) 25min）之前导出；C++ 复刻节点采样/边枚举/顺序搜索，秒级~分钟级完成。
{
  const i = process.argv.indexOf('--dump');
  if (i >= 0) {
    const out = [];
    const push = (...a) => out.push(a.join('\t'));
    // 头：参数
    push('PARAMS', process.env.GY_SAMPLE || 0.25, process.env.OFF_FRAC || 0.6,
      process.env.GY_MAXL || 14, process.env.GY_MAXL_TASK || 40,
      VEH_R, MARGIN, ANCHOR_MARGIN, SKIN, OBS_MARGIN, BUCKET, SAMPLE, SPARSE ? 1 : 0);
    // 走廊段（marginAt 用）
    push('SEGS', SEGS.length);
    for (const s of SEGS) push('S', s.ax, s.az, s.bx, s.bz, s.allow);
    // 原始道路折线（节点采样 + marginAtPt 用；marginAtPt 用 width/2 不减车半径）
    push('ROADS', scene.roads.length);
    for (const r of scene.roads) {
      push('R', r.width, r.points.length);
      out.push(r.points.map(p => `${p[0]},${p[1]}`).join(','));
    }
    // 阻挡者（id 用索引；全包序保 active 语义）
    const carryIds = Object.keys(P);   // CARRY_IDS 定义在本块之后（TDZ）→ 就地取同源值
    push('PKGS', interDef.packages.length, carryIds.length);
    interDef.packages.forEach((p, k) => {
      const bit = carryIds.indexOf(p.id);
      push('P', k, p.id, p.x, p.z, (p.r ?? p.radius ?? 0.28),
        (p.r ?? p.radius ?? 0.28) + VEH_R + SKIN + OBS_MARGIN,
        (p.r ?? p.radius ?? 0.28) + VEH_R + SKIN, p.role === 'obstacle' ? 1 : 0, bit);
    });
    carryIds.forEach((id, k) => push('CARRY', k, id));
    // 任务点（pid 布局 = emit2 消费契约）
    push('POINTS', POINTS.length);
    const KIND = { start: 0, goal: 1, grab: 2, release: 3, cp: 4 };
    for (const p of POINTS)
      push('T', p.id, p.x, p.z, p.h == null ? 'null' : p.h, KIND[p.kind], p.pkg || '-',
        p.alignTol == null ? 'null' : p.alignTol, p.idx == null ? -1 : p.idx, p.label);
    // 门点组
    push('GATES', CP_GATES.length);
    for (const g of CP_GATES) push('G', g.length, ...g);
    // 候选族（pkg → pid 列表；含 unshift 的基线锚点）
    const famRows = [];
    for (const [pkg, arr] of Object.entries(FAM_GRAB)) famRows.push(['B', pkg, ...arr]);
    for (const [pkg, arr] of Object.entries(FAM_REL)) famRows.push(['D', pkg, ...arr]);
    push('FAMS', famRows.length);
    for (const r of famRows) push(...r);
    // 节点坐标表（采样结果原样导出：C++ 不复刻采样，直接用 → 与本轮 JS 图完全一致）
    push('NODES', nodes.length);
    for (const n of nodes) push('N', n.id, n.x, n.z);
    push('NODEOFPOINT', nodeOfPoint.length);
    push(...nodeOfPoint);
    // 边枚举在 C++ 里做（25min JS → ~1min C++）。dump 在此结束。
    fs.writeFileSync(process.argv[i + 1], out.join('\n') + '\n');
    console.log(`已 dump -> ${process.argv[i + 1]}（${nodes.length} 节点，${POINTS.length} 任务点，跳过 JS 建边）`);
    process.exit(0);
  }
}

// ---------- 可见性边（限长 14u，空间索引粗筛；config 感知） ----------
// 世界随任务进度演化：包裹被抓住后原地堆消失，被释放后在新位置成堆。
// 边可行性由 (done, hold) 决定的「活跃原始堆集合」决定：
//   active(done,hold) = 全部包裹 − done − hold
// 本简化模型不含「已释放包裹在新位置的堆」（由最终重放兜底验证）。
// 每条边记录 hitIds（ penetrated 的包裹集合），config 可用 ⇔ hitIds ∩ active = ∅。
const CARRY_IDS = Object.keys(P);
const EDGE_RECORDS = [];   // { a, b, L, hitIds:Set }
const MAXL = Number(process.env.GY_MAXL || 14);
const MAXL_TASK = Number(process.env.GY_MAXL_TASK || 40);
{
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      // 普通边限长 MAXL（14u，枚举成本）；任务点（锚点/检查点门/起终点）参与的边放宽到 MAXL_TASK，
      // 否则直线距离 >14u 的腿被迫拆成沿路网折线的多跳 → 绕行比虚高（emit2 实测 40u 上限仅多 6 条边）。
      const anchorish = isTaskNode.has(i) || isTaskNode.has(j);
      const capL = anchorish ? MAXL_TASK : MAXL;
      if (L < 1e-9 || L > capL) continue;
      const margin = anchorish ? ANCHOR_MARGIN : MARGIN;
      // 锚点边：端点是某包裹的抓/放锚点时，该包裹降到物理阈值（贴身作业位姿本就 0.96+）
      let ig = [];
      for (const pid of (nodePoints.get(i) || [])) if (pointIgnore[pid]) ig = ig.concat(pointIgnore[pid]);
      for (const pid of (nodePoints.get(j) || [])) if (pointIgnore[pid]) ig = ig.concat(pointIgnore[pid]);
      ig = [...new Set(ig)];
      const blAll = blockersFor(ig.length ? ig : null);
      // 阻挡者预过滤：点线距离 >= r 的包裹沿线任何采样点都进不了其半径 → 剔出逐点循环
      const bl = blAll.length > 1 ? blAll.filter(bb => segDistPt(bb.x, bb.z, a.x, a.z, b.x, b.z) < bb.r) : blAll;
      // req：普通边 0.0005、锚点边 -0.0005（贴边合法，凹陷由终检兜底）。
      const req = margin >= MARGIN - 1e-12 ? 0.0005 : -0.0005;
      const n = Math.max(2, Math.ceil(L / 0.002));
      const hitIds = new Set();
      let marginFail = false;
      for (let k = 0; k <= n && !marginFail; k++) {
        const t = k / n, px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
        if (marginAt(px, pz) < req) { marginFail = true; break; }
        for (const bk of bl) if (Math.hypot(bk.x - px, bk.z - pz) < bk.r) hitIds.add(bk.id);
      }
      if (marginFail) continue;
      EDGE_RECORDS.push({ a: i, b: j, L, hitIds });
    }
  }
}
console.log(`候选边 ${EDGE_RECORDS.length}`);
// config 邻接表缓存：key = done|hold
const adjCache = new Map();
function adjFor(done, hold) {
  const key = `${done}|${hold || '-'}`;
  if (adjCache.has(key)) return adjCache.get(key);
  const adj = nodes.map(() => []);
  const active = new Set(interDef.packages.filter(p => {
    const bit = idxOf[p.id];
    const isDone = bit !== undefined && (done & (1 << bit));
    return !isDone && p.id !== hold;
  }).map(p => p.id));
  let ec = 0;
  for (const e of EDGE_RECORDS) {
    let ok = true;
    for (const h of e.hitIds) if (active.has(h)) { ok = false; break; }
    if (!ok) continue;
    adj[e.a].push({ v: e.b, L: e.L }); adj[e.b].push({ v: e.a, L: e.L }); ec++;
  }
  adjCache.set(key, adj);
  return adj;
}

// ---------- 单源最优（含到各任务点/门点的代价） ----------
function searchFrom(srcNode, srcH, done, hold) {
  const adj = adjFor(done, hold);
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
  while (pq.length) {
    const cur = pop();
    if (cur.ticks > (best.get(cur.key) ?? 1e18) + 1e-9) continue;
    const a = nodes[cur.node], p = prev.get(cur.key);
    const backNode2 = cur.key.includes('|') ? Number(cur.key.split('|')[1]) : -1;
    for (const e of adj[cur.node]) {
      if (e.v === backNode2) continue;             // 禁止立即折返
      const b = nodes[e.v];
      const h = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      const key = `${e.v}|${cur.node}`;
      const t = cur.ticks + costTurn(Math.abs(wrap(h - p.hdg) * 180 / Math.PI)) + dtU(e.L);
      if (!best.has(key) || t < best.get(key) - 1e-9) { best.set(key, t); prev.set(key, { back: cur.key, hdg: h }); push({ key, node: e.v, ticks: t }); }
    }
  }
  // 按「节点」聚合最优
  const byNode = new Map();
  for (const [key, t] of best) {
    const n = Number(key.split('|')[0]);
    const p = prev.get(key);
    const cur = byNode.get(n);
    if (!cur || t < cur.ticks) byNode.set(n, { ticks: t, key, hdg: p.hdg });
  }
  if (!byNode.has(srcNode)) byNode.set(srcNode, { ticks: 0, key: '__self__', hdg: srcH });
  return { byNode, prev, best };
}

// ---------- 代价查询：点 -> 点（点可为门点组；config 感知） ----------
const RES = new Map();
const RES_CAP = 6000;                 // LRU 上限：瘦体 byNode ~80KB/条，6000 条 ≈ 480MB（4G 堆内；1000 条装不下 锚点/门点×config 组合 → 频繁清空重跑 Dijkstra）
function resOf(pid, done, hold) {
  const k = `${pid}|${done}|${hold || '-'}`;
  if (RES.has(k)) { const v = RES.get(k); RES.delete(k); RES.set(k, v); return v; }
  const r = searchFrom(nodeOfPoint[pid], POINTS[pid].h ?? 0, done, hold);
  // 只保留 byNode（costToPt 唯一消费面）；prev/best 是每条 44 万条目的大 Map，绝不能缓存
  const slim = { byNode: r.byNode };
  if (RES.size >= RES_CAP) RES.clear();
  RES.set(k, slim);
  return slim;
}
function costToPt(fromPid, toPid, done, hold) {
  const r = resOf(fromPid, done, hold);
  const dst = POINTS[toPid];
  const nid = nodeOfPoint[toPid];
  const rec = r.byNode.get(nid);
  if (!rec) return Infinity;
  // 符号备选：到达车头 hdg 或 hdg+π（倒车），对齐角取两者的 min —— 与 bestTo 双符号评估一致
  const dAl1 = dst.h == null ? 0 : Math.abs(wrap(dst.h - rec.hdg) * 180 / Math.PI);
  const dAl = dst.h == null ? 0 : Math.min(dAl1, 180 - dAl1);
  const extra = dst.h == null ? 0 : (dst.alignTol != null && dAl <= dst.alignTol ? 0 : costTurn(dAl));
  return rec.ticks + extra;
}
function costToCp(fromPid, cpIdx, done, hold) {
  let best = Infinity;
  for (const pid of ptOfCp(cpIdx)) { const c = costToPt(fromPid, pid, done, hold); if (c < best) best = c; }
  return best;
}

// ---------- 顺序搜索 ----------
const ids = Object.keys(P);
const N = ids.length, idxOf = {};
ids.forEach((id, i) => idxOf[id] = i);
const FULL = (1 << N) - 1;

function solveSequence() {
  const keyOf = s => `${s.cp}|${s.done}|${s.hold || '-'}|${s.at}`;
  const best = new Map(), prev = new Map(), pq = [];
  const push = it => { pq.push(it); let i = pq.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (pq[p].t <= pq[i].t) break; [pq[p], pq[i]] = [pq[i], pq[p]]; i = p; } };
  const pop = () => { const top = pq[0], last = pq.pop();
    if (pq.length) { pq[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < pq.length && pq[l].t < pq[m].t) m = l;
        if (r < pq.length && pq[r].t < pq[m].t) m = r;
        if (m === i) break; [pq[m], pq[i]] = [pq[i], pq[m]]; i = m; } }
    return top; };
  const s0 = { cp: 0, done: 0, hold: null, at: ID.start };
  best.set(keyOf(s0), 0); prev.set(keyOf(s0), null);
  push({ ...s0, t: 0, key: keyOf(s0) });
  let goalState = null;
  while (pq.length) {
    const cur = pop();
    if (cur.t > (best.get(cur.key) ?? 1e18) + 1e-9) continue;
    if (cur.cp >= cps.length && cur.done === FULL && cur.hold === null) {
      const tot = cur.t + costToPt(cur.at, ID.goal, FULL, null);
      if (!goalState || tot < goalState.t) goalState = { ...cur, t: tot };
      continue;
    }
    const moves = [];
    if (cur.cp < cps.length) moves.push({ kind: 'cp', cpIdx: cur.cp, ncp: cur.cp + 1, ndone: cur.done, nhold: cur.hold });
    if (cur.hold) moves.push({ kind: 'drop', to: ID.rel[cur.hold], fam: FAM_REL[cur.hold], ncp: cur.cp, ndone: cur.done | (1 << idxOf[cur.hold]), nhold: null });
    if (!cur.hold) for (const id of ids) {
      if (cur.done & (1 << idxOf[id])) continue;
      moves.push({ kind: 'grab', to: ID.grab[id], fam: FAM_GRAB[id], ncp: cur.cp, ndone: cur.done, nhold: id });
    }
    for (const m of moves) {
      let cost, at;
      if (m.kind === 'cp') {
        // 族 min 选最优门点计价，但 at 记圆心锚：fromPid 集合从 ~24 门点/cp 缩到 1 圆心，
        // 缓存命中率质变（门点粒度曾把 RES_CAP 冲穿 → 反复全图 Dijkstra）。
        // 代价：下一步入口航向按圆心 h=0 近似——与 v5 粗搜语义一致，emit2 实际发射会精修。
        let bc = Infinity;
        for (const pid of ptOfCp(m.cpIdx)) { const c = costToPt(cur.at, pid, cur.done, cur.hold); if (c < bc) bc = c; }
        cost = bc; at = CP_GATES[m.cpIdx][0];   // [0] 是圆心（门点组首元素）
      } else {
        // 族内取 min：候选位姿自由度与发射一致（v5 序列是在单锚点粗模型上搜的）
        const holdArg = m.kind === 'drop' ? cur.hold : null;
        const fam = m.fam && m.fam.length ? m.fam : [m.to];
        let bc = Infinity, bp = null;
        for (const pid of fam) { const c = costToPt(cur.at, pid, cur.done, holdArg); if (c < bc) { bc = c; bp = pid; } }
        // at 记锚点（m.to）而非选中候选：控制状态×fromPid 组合（v5 语义）；
        // 族 min 的收益保留在成本估计里，候选入口航向差异由 emit2 实际精搜吸收。
        cost = bc; at = m.to;
      }
      if (!Number.isFinite(cost)) continue;
      const nt = cur.t + cost;
      const ns = { cp: m.ncp, done: m.ndone, hold: m.nhold, at };
      const nk = keyOf(ns);
      if (nt < (best.get(nk) ?? 1e18) - 1e-9) {
        best.set(nk, nt); prev.set(nk, { from: cur.key, at: cur.at, move: m, atAfter: at });
        push({ ...ns, t: nt, key: nk });
      }
    }
  }
  if (!goalState) return null;
  const seq = []; let k = goalState.key;
  while (k) {
    const p = prev.get(k);
    const [cp, done, hold, at] = k.split('|');
    seq.push({ pid: Number(at), cp: +cp, done: +done, hold: hold === '-' ? null : hold });
    if (!p) break;
    k = p.from;
  }
  seq.reverse();
  return { ticks: goalState.t, seq };
}

console.log('\n顺序搜索中…');
// 诊断：关键 config 下从 start 可达的任务点
{
  const reach = (done, hold) => {
    const adj = adjFor(done, hold);
    const seen = new Set([nodeOfPoint[ID.start]]);
    const q = [nodeOfPoint[ID.start]];
    while (q.length) { const c = q.pop();
      for (const e of adj[c]) if (!seen.has(e.v)) { seen.add(e.v); q.push(e.v); } }
    return seen;
  };
  const full = (1 << CARRY_IDS.length) - 1;
  for (const [done, hold, tag] of [[0, null, '空手全堆'], [0, 'guangyang-target-1', '拿t1'], [full & ~(1 << idxOf['guangyang-target-1']), null, 't1已送'], [full, null, '全送']]) {
    const seen = reach(done, hold);
    const miss = POINTS.filter(p => p.kind !== 'start').filter(p => !seen.has(nodeOfPoint[p.id])).map(p => p.label);
    console.log(`[诊断] ${tag} 不可达: ${miss.length ? miss.join(' ') : '无'}`);
  }
}
const t0 = Date.now();
const sol = solveSequence();
console.log(`完成 ${Date.now() - t0} ms`);
if (!sol) { console.log('无解'); process.exit(1); }

console.log(`\n=== 最优序列 ===`);
for (let i = 0; i < sol.seq.length; i++) {
  const s = sol.seq[i];
  console.log(`  ${String(i).padStart(2)} ${POINTS[s.pid].label.padEnd(22)} cp已过=${s.cp} 手持=${s.hold ? s.hold.replace('guangyang-', '') : '空'}`);
}
const INT = 288;
const total = sol.ticks + INT;
console.log(`\n行驶+转向 ${sol.ticks} + 交互 ${INT} = ${total} tick = ${(total * 0.02).toFixed(2)}s`);
console.log(`满分线 124.8s = 6240 tick，${total <= 6240 ? '✅ 达标，余 ' + (6240 - total) : '❌ 差 ' + (total - 6240) + ' tick = ' + ((total - 6240) * 0.02).toFixed(2) + 's'}`);

const outPath = (() => { const i = process.argv.indexOf('--seq'); return i >= 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'seq2d.json'); })();
fs.writeFileSync(outPath, JSON.stringify({ ticks: sol.ticks, total, seq: sol.seq.map(s => ({ label: POINTS[s.pid].label, pid: s.pid, cp: s.cp, done: s.done, hold: s.hold })) }, null, 1));
console.log('已写', outPath);
