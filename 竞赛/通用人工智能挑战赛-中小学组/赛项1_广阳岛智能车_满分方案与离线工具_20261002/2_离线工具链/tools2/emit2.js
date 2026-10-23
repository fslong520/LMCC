#!/usr/bin/env node
// 任务二 由 seq2d 的最优序列生成可执行代码，并即时校验。
// 关键：生成时严格复算路径朝向与指令，转向 <1° 直接不输出（平台下限）。
'use strict';
const fs = require('fs');
const path = require('path');
const { dtU, tt, wrap, CM } = require('../tools/route_lib.js');

const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const interDef = JSON.parse(fs.readFileSync(path.join(D2, 'inter_task2.json'), 'utf8'));
const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anchors2.json'), 'utf8'));
const VEH_R = 0.44, MARGIN = 0.06, ANCHOR_MARGIN = 0.02, MIN_TURN_DEG = 1.0;
const TURN_W = 1.0;
const MAX_EDGE = Number(process.env.MAX_EDGE || 14);        // 普通边长度上限（u）
const MAX_EDGE_TASK = Number(process.env.MAX_EDGE_TASK || 40); // 任务点参与边的长度上限（u）
const OFF_FRAC = Number(process.env.OFF_FRAC || 0.6);       // 偏置线相对 allow 比例（0.78 更贴墙切弯）
const OFF_EVERY = Number(process.env.OFF_EVERY || 2);       // 偏置采样步长：2=0.5u（原），1=0.25u 全采
const CAND_DEG = Number(process.env.CAND_DEG || 30);        // 候选/门点方向步长（°）：15=加密候选族
const BOOST = Number(process.env.MARGIN_BOOST || 0);   // 终检不过时加大的走廊余量
const costTurn = d => (d < MIN_TURN_DEG ? 0 : tt(d) * TURN_W);

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
// marginAt 空间哈希：原先每次调用全量扫 260 条道路段（边枚举 step 0.002 → 每对上万次调用，
// 是 30 分钟耗时的主因）。改为按 1u 网格索引，仅查查询点所在格的段。
// 正确性：任何 allow-dist > -MG_FLOOR 的段，其扩展 bbox 必覆盖查询点；
// 值深于 -MG_FLOOR（更负）只出现在「完全出图外」处，而所有阈值判定（≥0、≥-0.69）都在 -2 之上。
const MG_CELL = 1.0, MG_FLOOR = 2.0;
const MG_MAX_ALLOW = Math.max(...SEGS.map(s => s.allow));
const mgGrid = new Map();
for (const s of SEGS) {
  const x0 = Math.floor((Math.min(s.ax, s.bx) - MG_MAX_ALLOW - MG_FLOOR) / MG_CELL);
  const x1 = Math.floor((Math.max(s.ax, s.bx) + MG_MAX_ALLOW + MG_FLOOR) / MG_CELL);
  const z0 = Math.floor((Math.min(s.az, s.bz) - MG_MAX_ALLOW - MG_FLOOR) / MG_CELL);
  const z1 = Math.floor((Math.max(s.az, s.bz) + MG_MAX_ALLOW + MG_FLOOR) / MG_CELL);
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
    const k = i + ',' + j;
    let a = mgGrid.get(k); if (!a) { a = []; mgGrid.set(k, a); }
    a.push(s);
  }
}
const marginAt = (x, z) => { const a = mgGrid.get(Math.floor(x / MG_CELL) + ',' + Math.floor(z / MG_CELL));
  if (!a) return -9; let b = -Infinity;
  for (const s of a) { const m = s.allow - sd(x, z, s.ax, s.az, s.bx, s.bz); if (m > b) b = m; } return b; };
const SKIN = 0.005, OBS_MARGIN = 0.002;
// 避障圈 = 包裹半径 + 车半径 + skin + 0.01 ≈ 真实碰撞阈值（0.725/0.965）。
// 曾用 0.06 富余 → 包裹堆之间的必经缝隙被判死 → 图不连通（BFS 证实按 0.06 地图断开，
// 按 0.01 连通）。锚点边仍可经 blockersFor 降到纯物理阈值。
const blockers = interDef.packages.map(p => ({ x: p.x, z: p.z, r: (p.r ?? p.radius ?? 0.28) + VEH_R + SKIN + OBS_MARGIN, id: p.id }));
// 忽略某包裹时，仍保留其「真实物理半径」（车半径+包裹半径+skin），
// 仅去掉 0.06 安全余量。曾因完全移除致路径擦过 0.724u（阈值 0.725u）而实撞。
// 忽略某包裹时用「物理半径」（车+包裹+skin=0.725），不额外加安全余量。
// 抓取锚点距其包裹 0.96~1.01u，故 0.725 的判定不会卡掉锚点连接。
const PHYS = new Map(interDef.packages.map(p => [p.id, (p.r ?? p.radius ?? 0.28) + VEH_R + SKIN]));
let CUR_HOLD = null;              // 当前手持包裹（null=空手）；手持包裹碰撞体整个消失（core.js syncWorld）
const DONE_SET = new Set();       // 已抓走的包裹：原地堆消失（世界随任务进度演化）
const blockersFor = ig => blockers.map(b =>
  (b.id === CUR_HOLD || DONE_SET.has(b.id)) ? { ...b, r: 0 } :
  (ig && ig.includes(b.id)) ? { ...b, r: PHYS.get(b.id) } : b);
function segOk(ax, az, bx, bz, margin, step, ignore) {
  const bl = blockersFor(ignore);
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / step));
  // req = 该类边允许的最小走廊余量：
  //   普通边（margin=MARGIN）  → 0.01 + BOOST（吸收采样间隔内的凹陷，实测凹陷可达 0.06）
  //   锚点边（margin=ANCHOR_MARGIN）→ -0.002（锚点本身贴近路缘，基线最小余量 0.0015）
  // 注意：旧写法 `marginAt + (MARGIN - margin) < req` 会把锚点边反向放松到 -0.04，
  // 是重放越界的直接根因，已废弃。
  const req = margin >= MARGIN - 1e-12 ? 0.0005 + BOOST : -0.0005;
  for (let i = 0; i <= n; i++) {
    const t = i / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    if (marginAt(px, pz) < req) return false;
    for (const b of bl) if (Math.hypot(b.x - px, b.z - pz) < b.r) return false;
  }
  return true;
}
const cps = scene.checkpoints.map(c => c.position);
const relPose = {}, grabPose = {};
for (const it of anchors.interactions) (it.op === 'release' ? relPose : grabPose)[it.packageId] = { pos: [it.pose.x, it.pose.z], h: it.pose.h };
const P = {};
for (const p of interDef.packages) if (p.role !== 'obstacle') P[p.id] = p;

const POINTS = [];
const addPoint = o => { POINTS.push({ id: POINTS.length, ...o }); return POINTS.length - 1; };
const ID = { cpGates: [], grab: {}, rel: {} };
ID.start = addPoint({ x: scene.start.x, z: scene.start.z, h: scene.start.h, kind: 'start', label: 'start' });
ID.goal = addPoint({ x: scene.goal[0], z: scene.goal[1], h: null, kind: 'goal', label: 'goal' });
for (const id of Object.keys(P)) {
  ID.grab[id] = addPoint({ x: grabPose[id].pos[0], z: grabPose[id].pos[1], h: grabPose[id].h, kind: 'grab', pkg: id, alignTol: 18, label: `grab(${id.replace('guangyang-', '')})` });
  ID.rel[id] = addPoint({ x: relPose[id].pos[0], z: relPose[id].pos[1], h: relPose[id].h, kind: 'release', pkg: id, label: `drop(${id.replace('guangyang-', '')})` });
}
// ---------- 交互点对齐容差（deg）----------
// 抓取盒（车体系）：forward∈[0.38,1.35]、lateral≤0.38 → 距包裹~1.0u 时航向偏差容许 ~22°
// target 释放：落点 = 车位姿 + 1.1·朝向，交付半径 0.95 → 偏 20° 落点仅偏 0.38u
// distractor 释放：落点须路外且距路缘 ≥ 0.28+0.2，按 ±θ 双向数值采样求最大容差
{
  const pkgRoadMargin = (x, z) => marginAt(x, z) + VEH_R;   // 包裹中心的道路 margin（负=路外）
  const roleOf = id => (interDef.packages.find(q => q.id === id) || {}).role;
  for (const p of POINTS) {
    if (p.kind === 'grab') { p.alignTol = 15; continue; }
    if (p.kind !== 'release') continue;
    if (roleOf(p.pkg) === 'target') { p.alignTol = 20; continue; }
    const FWD = 1.1, TOL = 0.48;
    const bx0 = p.x + FWD * (-Math.sin(p.h)), bz0 = p.z + FWD * (-Math.cos(p.h));
    const rx = Math.cos(p.h), rz = -Math.sin(p.h);
    let ok = 0;
    for (let th = 5; th <= 30; th += 5) {
      const lat = FWD * Math.sin(th * Math.PI / 180);
      let good = true;
      for (const s of [1, -1]) if (pkgRoadMargin(bx0 + s * lat * rx, bz0 + s * lat * rz) > -TOL) { good = false; break; }
      if (good) ok = th; else break;
    }
    p.alignTol = Math.max(0, ok - 5);
  }
}
// 锚点朝向容差 alignTol（度）：交互判定不是严格朝向匹配——
//   grab 是车体盒（forward∈[0.38,1.35], lateral≤0.38）：包裹距锚点 ~1.0u，θ≤asin(0.38/1.0)=22°，保守取 15
//   release 落点 = 车位姿 + forwardOffset 1.1 沿车头：
//     target 交付半径 0.95 → θ≤49°，保守取 20；distractor 要求落点路外且距路缘≥0.2（含 0.05 安全→marginAt≤-0.69），
//     按 ±θ 双向采样求最大可行角再减 5° 安全
{
  const relFwd = 1.1;
  const _segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)); return Math.hypot(px - (ax + t * dx), pz - (az + t * dz)); };
  const edgeClear = (x, z) => {                      // 包裹中心到路缘的外侧距离（正=路外）
    let worst = -Infinity;
    for (const r of scene.roads) {
      const n = r.points.length;
      for (let i = 0; i < n - 1; i++) worst = Math.max(worst, r.width / 2 - _segDist(x, z, r.points[i][0], r.points[i][1], r.points[i + 1][0], r.points[i + 1][1]));
      // 到折线端点（多段路连通性粗略处理；端点多余约束只会更保守）
      for (const p of r.points) worst = Math.max(worst, r.width / 2 - Math.hypot(p[0] - x, p[1] - z));
    }
    return worst;
  };
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
        // 落点需路外且距路缘 ≥0.2(+0.05 安全)：margin = width/2 - dist ≤ -0.69
        if (edgeClear(lx, lz) > -0.69) { ok = false; break; }
      }
      if (!ok) break;
      tol = d;
    }
    p.alignTol = Math.max(0, tol - 5);
  }
}
// ---------- 抓取位姿候选族 ----------
// 抓取判定是车体盒（forward∈[0.38,1.35]、lateral≤0.38、航向对准包裹 ±22°），
// 「从哪个方向靠近包裹」是自由的，只要：d∈[0.727(车+包物理避障),1.35]、航向对准包裹、位姿在走廊内。
// 基线只固定了一种靠近方向 → 抓完常需 150°~180° 掉头（40~56 tick/次）。
// 这里按角度×距离枚举候选，让最短路自己挑「进来就朝下一个目标」的靠近方向。
const GRAB_CANDS = new Map();
{
  for (const id of Object.keys(P)) {
    const pkg = interDef.packages.find(q => q.id === id);
    const baseId = ID.grab[id];
    const ids = [baseId];
    for (let deg = 0; deg < 360; deg += CAND_DEG) {
      const a = deg * Math.PI / 180, ux = Math.cos(a), uz = Math.sin(a);
      for (const d of [0.78, 1.0, 1.28]) {
        const cx = pkg.x + ux * d, cz = pkg.z + uz * d;
        if (marginAt(cx, cz) < 0) continue;               // 必须在走廊内
        let blocked = false;
        for (const b of blockers) {
          if (b.id === id) { if (d < b.r) { blocked = true; break; } continue; }
          if (Math.hypot(b.x - cx, b.z - cz) < b.r) { blocked = true; break; }
        }
        if (blocked) continue;
        const h = Math.atan2(-(pkg.x - cx), -(pkg.z - cz));   // 车头对准包裹
        // 抓取盒判定：forward∈[0.38,1.35]、lateral≤0.38（车体坐标）。偏移 d 处航向偏差 δ
        // 使包裹横向偏移 d·sin(δ)——逐候选几何容差 = asin(0.38/d) − 2° 安全，上限 20°。
        // （原全局 15° 在 d≤1.0 的候选上留了 5~11° 余量没吃到，导致多付对齐转角。）
        const grabTol = Math.max(6, Math.min(20, Math.asin(Math.min(1, 0.38 / d)) * 180 / Math.PI - 2));
        ids.push(addPoint({ x: cx, z: cz, h, kind: 'grab', pkg: id, alignTol: grabTol,
          label: `grab(${id.replace('guangyang-', '')})@${deg}/${d}` }));
      }
    }
    GRAB_CANDS.set(baseId, [...new Set(ids)]);
    console.log(`  抓取候选 ${id.replace('guangyang-', '')}: ${ids.length} 个位姿`);
  }
}
// ---------- 释放位姿候选族 ----------
// 释放落点 = 车位姿 + 1.1·车头（interDef.release.forwardOffset），故「从哪个方向送出去」是自由的：
//   target: 落点须在交付中心 destination 半径 0.95 内 → 车可站在 destination − 1.1·u 的一圈
//   distractor: 落点须路外且中心距路缘 ≥ 0.28+0.2(+0.05 安全)
// 基线每种交互只固定一个位姿 → 放完常需 140°~155° 掉头（45~48 tick/次）。
const REL_CANDS = new Map();
{
  const mission = JSON.parse(fs.readFileSync(path.join(D2, 'active_mission_task2.json'), 'utf8'));
  const findDeliveries = (o) => {
    if (Array.isArray(o)) { for (const v of o) { const r = findDeliveries(v); if (r) return r; } return null; }
    if (o && typeof o === 'object') {
      if (Array.isArray(o.deliveries) && o.deliveries.length) return o.deliveries;
      for (const k of Object.keys(o)) { const r = findDeliveries(o[k]); if (r) return r; }
    }
    return null;
  };
  const deliveries = findDeliveries(mission) || [];
  const _sd2 = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz)); };
  // 落点的「路外净距」：width/2 − 到中心线距离（负=路外），阈值 -0.69（=0.28+0.2+0.05+0.16 富余）
  const edgeClear = (x, z) => { let w = -Infinity;
    for (const r of scene.roads) { const pts = r.points;
      for (let i = 0; i < pts.length - 1; i++) w = Math.max(w, r.width / 2 - _sd2(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
      for (const q of pts) w = Math.max(w, r.width / 2 - Math.hypot(q[0] - x, q[1] - z)); }
    return w; };
  const bounds = interDef.bounds;
  const inBounds = (x, z) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
  const relAlignTol = (px, pz, hh, okLanding) => {
    for (let th = 0; th <= 60; th += 5) {
      let ok = true;
      for (const sgn of [1, -1]) {
        const h2 = hh + sgn * th * Math.PI / 180;
        if (!okLanding(px - Math.sin(h2) * 1.1, pz - Math.cos(h2) * 1.1)) { ok = false; break; }
      }
      if (!ok) return Math.max(0, th - 5);
    }
    return 55;
  };
  const blockedBy = (cx, cz, ownId) => {
    for (const b of blockers) {
      if (b.id === ownId) { if (Math.hypot(b.x - cx, b.z - cz) < PHYS.get(ownId)) return true; continue; }
      if (Math.hypot(b.x - cx, b.z - cz) < b.r) return true;
    }
    return false;
  };
  for (const id of Object.keys(P)) {
    const pkg = interDef.packages.find(q => q.id === id);
    const baseId = ID.rel[id];
    const ids = [baseId];
    const isTarget = pkg.role === 'target';
    const deliv = deliveries.find(d => (d.requiredPackageIds || []).includes(id));
    const dest = deliv ? deliv.destination : null;
    const R = deliv ? (deliv.radius || 0.95) : 0.95;
    // 统一网格采样：车位姿（路内、不撞堆）× 车头 30° 步 → 落点 = 车 + 1.1·车头 须满足交付规则。
    // 原实现按「落点侧向偏移环」采样，distractor 全部落选（只剩基线 1 个位姿）。
    const obstacles = interDef.packages.filter(q => q.role === 'obstacle');
    const storage = (deliveries.find(d => (d.objectRole === 'target') || (d.destinationRole === 'storage')) || {}).destination || null;
    const otherLands = Object.keys(P).filter(k => k !== id)
      .map(k => { const q = interDef.packages.find(w => w.id === k); return [q.x, q.z]; })
      .concat(storage && !isTarget ? [storage] : []);
    const landingOk = (lx, lz) => {
      if (!inBounds(lx, lz)) return false;
      for (const o of obstacles) if (Math.hypot(o.x - lx, o.z - lz) < 0.59) return false;  // 0.28+0.28+0.03
      if (isTarget) return Math.hypot(lx - dest[0], lz - dest[1]) <= R - 0.05;
      if (edgeClear(lx, lz) > -0.53) return false;                          // 规则: dist-width/2-0.28 ≥ 0.2 → edgeClear ≤ -0.48，留 0.05 安全 = -0.53
      for (const p of otherLands) if (Math.hypot(lx - p[0], lz - p[1]) < 0.62) return false;  // 防吸附到别堆
      return true;
    };
    const cx0 = isTarget ? dest[0] : (relPose[id].pos[0] - Math.sin(relPose[id].h) * 1.1);
    const cz0 = isTarget ? dest[1] : (relPose[id].pos[1] - Math.cos(relPose[id].h) * 1.1);
    const RANGE = isTarget ? 2.1 : 2.3, STEP = 0.35;
    let cand = [];
    for (let gx = -RANGE; gx <= RANGE + 1e-9; gx += STEP)
      for (let gz = -RANGE; gz <= RANGE + 1e-9; gz += STEP) {
        const cx = cx0 + gx, cz = cz0 + gz;
        if (marginAt(cx, cz) < 0) continue;                 // 车必须在走廊内
        if (blockedBy(cx, cz, id)) continue;                // 车不撞地面堆/障碍
        if (isTarget && Math.hypot(cx - dest[0], cz - dest[1]) < 0.75) continue;  // 交付中心可能已有另一 target 堆叠
        for (let deg = 0; deg < 360; deg += CAND_DEG) {
          const hd = deg * Math.PI / 180;
          const lx = cx - Math.sin(hd) * 1.1, lz = cz - Math.cos(hd) * 1.1;
          if (!landingOk(lx, lz)) continue;
          cand.push({ cx, cz, hd, deg });
        }
      }
    // 上限：候选过多让边枚举 O(n²) 爆掉。按车位姿分组、每组留 ≤4 个方向、轮取到 CAP。
    const CAP = Number(process.env.REL_CAP || 48);
    if (cand.length > CAP) {
      const groups = new Map();
      for (const c of cand) {
        const k = `${Math.round(c.cx * 20)},${Math.round(c.cz * 20)}`;
        if (!groups.has(k)) groups.set(k, []);
        if (groups.get(k).length < 4) groups.get(k).push(c);
      }
      const gs = [...groups.values()];
      const keep = [];
      while (keep.length < CAP && gs.some(g => g.length))
        for (const g of gs) if (g.length && keep.length < CAP) keep.push(g.shift());
      cand = keep;
    }
    for (const c of cand) {
      const okLanding = (a, b2) => landingOk(a, b2);
      const tol = relAlignTol(c.cx, c.cz, c.hd, okLanding);
      ids.push(addPoint({ x: c.cx, z: c.cz, h: c.hd, kind: 'release', pkg: id, alignTol: tol,
        label: `drop(${id.replace('guangyang-', '')})@${c.deg}/${isTarget ? 't' : 'd'}` }));
    }
    REL_CANDS.set(baseId, [...new Set(ids)]);
    console.log(`  释放候选 ${id.replace('guangyang-', '')}: ${ids.length} 个位姿`);
  }
}
// 检查点门点：平台判定只需进入半径 1.05 → 除圆心再采样半径 0.95 圆周（留 0.10 抗漂移余量），
// 让路径可以「擦边过检查点」而不必弯到圆心。原有实现只有圆心，每 cp 多绕 ~1u（6 个 cp ≈ 6u ≈ 240 tick）。
for (let i = 0; i < cps.length; i++) {
  const gates = [addPoint({ x: cps[i][0], z: cps[i][1], h: null, kind: 'cp', idx: i, label: `cp#${i}` })];
  for (let deg = 0; deg < 360; deg += CAND_DEG) {
    const a = deg * Math.PI / 180;
    const gx = cps[i][0] + 0.95 * Math.cos(a), gz = cps[i][1] + 0.95 * Math.sin(a);
    if (marginAt(gx, gz) < 0) continue;                 // 门点本身须在走廊内
    let bad = false;
    for (const bl of blockers) if (Math.hypot(bl.x - gx, bl.z - gz) < bl.r) { bad = true; break; }
    if (bad) continue;
    gates.push(addPoint({ x: gx, z: gz, h: null, kind: 'cp', idx: i, label: `cp#${i}@${deg}` }));
  }
  ID.cpGates.push(gates);
}

// 候选族导出（DUMP_CANDS=路径）：solve2d 序列搜索复用同一套 GRAB/REL/门点候选，
// 消除「序列搜索用粗模型、发射用富模型」的系统偏差（v5 序列即因此可能非真最优）。
if (process.env.DUMP_CANDS) {
  const fam = k => { const o = {};
    for (const p of POINTS) if (p.kind === k && p.pkg) {
      (o[p.pkg] = o[p.pkg] || []).push({ x: p.x, z: p.z, h: p.h, alignTol: p.alignTol, label: p.label });
    } return o; };
  const dump = {
    grab: fam('grab'), rel: fam('release'),
    gates: ID.cpGates.map(gs => gs.map(i => ({ x: POINTS[i].x, z: POINTS[i].z, label: POINTS[i].label }))),
    start: { x: POINTS[ID.start].x, z: POINTS[ID.start].z, h: POINTS[ID.start].h },
    goal: { x: POINTS[ID.goal].x, z: POINTS[ID.goal].z },
  };
  fs.writeFileSync(process.env.DUMP_CANDS, JSON.stringify(dump));
  console.log(`候选族已导出 ${process.env.DUMP_CANDS}（grab ${Object.values(dump.grab).reduce((s, a) => s + a.length, 0)} / rel ${Object.values(dump.rel).reduce((s, a) => s + a.length, 0)} / 门点 ${dump.gates.reduce((s, a) => s + a.length, 0)}）`);
  process.exit(0);
}

// —— 图缓存：节点 + 边记录落盘。建边 450s 是每轮迭代的主要固定等待，几何/参数不变时直接命中。——
const nodes = [];
const nodeAt = new Map();
const nkey = (x, z) => `${Math.round(x * 50)},${Math.round(z * 50)}`;
const pushNode = (x, z, tag) => {
  const k = nkey(x, z);
  if (nodeAt.has(k)) { const n = nodeAt.get(k); if (tag) n.tags.push(tag); return n; }
  const n = { id: nodes.length, x, z, tags: tag ? [tag] : [] };
  nodes.push(n); nodeAt.set(k, n); return n;
};
const pointIgnore = {};
for (const p of POINTS) if (p.pkg) pointIgnore[p.id] = [p.pkg];
const nodePoints = new Map();
let nodeOfPoint;
const isTaskNode = new Set();
let EDGE_RECORDS = [];
{
  const CACHE_DIR = path.join(__dirname, '..', 'cache2');
  const CACHE_KEY = `emit2graph_v4_ME${MAX_EDGE}_MET${MAX_EDGE_TASK}_B${BOOST}_OF${OFF_FRAC}_OE${OFF_EVERY}_CD${CAND_DEG}.json`;
  const cacheFile = path.join(CACHE_DIR, CACHE_KEY);
  if (fs.existsSync(cacheFile)) {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    for (const n of c.nodes) pushNode(n.x, n.z, null);
    nodeOfPoint = POINTS.map(p => nodeAt.get(nkey(p.x, p.z)).id);
    nodeOfPoint.forEach(nid => isTaskNode.add(nid));
    POINTS.forEach((p, i) => { const nid = nodeOfPoint[i]; if (!nodePoints.has(nid)) nodePoints.set(nid, []); nodePoints.get(nid).push(p.id); });
    EDGE_RECORDS = c.edges;
    console.log(`图缓存命中：节点 ${nodes.length}，边 ${EDGE_RECORDS.length}`);
  } else {
    const tEdge0 = Date.now();
    for (const r of scene.roads) {
      const pts = r.points;
      const allow = r.width / 2 - VEH_R;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
        const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 0.25));
        const ux = (bx - ax) / (L || 1), uz = (bz - az) / (L || 1);
        const px = -uz, pz = ux;                       // 垂直方向
        for (let k = 0; k <= n; k++) {
          const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          if (marginAt(x, z) >= 0) pushNode(x, z, null);
          // 平行车道节点：走廊半宽 allow≈0.69~0.79，只采中心线会把「贴边拉直」的自由度砍掉。
          // 取 ±OFF_FRAC·allow 两条偏置线（仍要求真在走廊内），给可见性图切角空间。
          // OFF_EVERY=1 → 0.25u 全采；OFF_FRAC=0.78 → 更贴墙，弯道内侧多切（BFS 下界诊断
          // 显示图路径比连续空间最优多走 12.5u ≈ 501 tick，主要亏在偏置线太稀太靠内）。
          if (k % OFF_EVERY === 0) for (const sgn of [1, -1]) {
            const ox = x + sgn * OFF_FRAC * allow * px, oz = z + sgn * OFF_FRAC * allow * pz;
            if (marginAt(ox, oz) >= 0.005) pushNode(ox, oz, null);
          }
        }
      }
    }
    nodeOfPoint = POINTS.map(p => pushNode(p.x, p.z, p.label).id);
    nodeOfPoint.forEach(nid => isTaskNode.add(nid));
    POINTS.forEach((p, i) => { const nid = nodeOfPoint[i]; if (!nodePoints.has(nid)) nodePoints.set(nid, []); nodePoints.get(nid).push(p.id); });
    // config 感知建图（与 solve2d 一致）：一次枚举候选边记录 hitIds（被哪些包裹挡），
    // 之后 adjFor(done, hold) 按「已送集合+手持」过滤活跃阻挡者动态生成邻接表：
    //   active = 未送达 且 非手持 的包裹堆；边可行 ⇔ hitIds ∩ active = ∅
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        // 长度上限：普通边 14u（枚举成本），任务点（锚点/检查点门/起终点）参与的边放宽到 40u。
        // 原「一律 14u」会把直线距离 14.35~19.66u 的腿强制拆成沿路网折线的多跳 → 绕行比 1.5~2.0。
        const tNode = isTaskNode.has(i) || isTaskNode.has(j);
        const maxL = tNode ? MAX_EDGE_TASK : MAX_EDGE;
        if (L < 1e-9 || L > maxL) continue;
        const margin = (isTaskNode.has(i) || isTaskNode.has(j)) ? ANCHOR_MARGIN : MARGIN;
        // 忽略策略：仅当「边的某一端就是该包裹的抓取/释放锚点」时该包裹降到物理阈值，
        // 否则路径会穿过包裹堆致重放阻塞。中间节点不忽略。
        let ig = [];
        for (const pid of (nodePoints.get(i) || [])) if (pointIgnore[pid]) ig = ig.concat(pointIgnore[pid]);
        for (const pid of (nodePoints.get(j) || [])) if (pointIgnore[pid]) ig = ig.concat(pointIgnore[pid]);
        ig = [...new Set(ig)];
        const bl = blockersFor(ig.length ? ig : null);
        const req = margin >= MARGIN - 1e-12 ? 0.0005 + BOOST : -0.0005;
        const n = Math.max(2, Math.ceil(L / 0.002));
        const hitIds = [];
        // 阻挡者预过滤：点线距离 >= r 的包裹，沿线任何采样点都不可能进入其半径 → 从逐点循环中剔除。
        let near = bl;
        if (bl.length > 1) near = bl.filter(bb => sd(bb.x, bb.z, a.x, a.z, b.x, b.z) < bb.r);
        let marginFail = false;
        for (let k = 0; k <= n; k++) {
          const t = k / n, px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
          if (marginAt(px, pz) < req) { marginFail = true; break; }
          for (const bb of near) if (Math.hypot(bb.x - px, bb.z - pz) < bb.r && !hitIds.includes(bb.id)) hitIds.push(bb.id);
        }
        if (marginFail) continue;                    // 走廊不行，任何 config 都不行
        EDGE_RECORDS.push({ a: i, b: j, L, hitIds });
      }
    }
    console.log(`候选边记录 ${EDGE_RECORDS.length}（节点 ${nodes.length}，建边 ${((Date.now()-tEdge0)/1000).toFixed(1)}s）`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ nodes: nodes.map(n => ({ x: n.x, z: n.z })), edges: EDGE_RECORDS }));
    console.log(`图缓存已写 ${cacheFile}`);
  }
}

// config 感知邻接表（缓存）：active = 未送达 且 非手持 的包裹堆
const idxOf = new Map(interDef.packages.map((p, k) => [p.id, k]));
const adjCache = new Map();
function adjFor(done, hold) {
  const key = `${done}|${hold || '-'}`;
  if (adjCache.has(key)) return adjCache.get(key);
  const adj = nodes.map(() => []);
  const active = new Set(interDef.packages.filter(p => {
    const bit = idxOf.get(p.id);
    const isDone = bit !== undefined && (done & (1 << bit));
    return !isDone && p.id !== hold;
  }).map(p => p.id));
  for (const e of EDGE_RECORDS) {
    let ok = true;
    for (const h of e.hitIds) if (active.has(h)) { ok = false; break; }
    if (!ok) continue;
    adj[e.a].push({ v: e.b, L: e.L }); adj[e.b].push({ v: e.a, L: e.L });
  }
  adjCache.set(key, adj);
  return adj;
}

// 单源：返回 到节点 的最优 ticks 与路径（config 感知：用 (done,hold) 对应的邻接表）
function searchPath(srcNode, srcH, dstNode, done, hold) {
  if (srcNode === dstNode) return { ticks: 0, path: [srcNode], hdgIn: srcH };
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
  let gBest = null, gKey = null;
  while (pq.length) {
    const cur = pop();
    if (cur.ticks > (best.get(cur.key) ?? 1e18) + 1e-9) continue;
    if (cur.node === dstNode) { if (gBest === null || cur.ticks < gBest) { gBest = cur.ticks; gKey = cur.key; } continue; }
    const a = nodes[cur.node], p = prev.get(cur.key);
    const backNode = cur.key.includes('|') ? Number(cur.key.split('|')[1]) : -1;
    for (const e of adj[cur.node]) {
      if (e.v === backNode) continue;              // 禁止立即折返（会撞上刚经过的障碍）
      const b = nodes[e.v];
      const h = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      const key = `${e.v}|${cur.node}`;
      const t = cur.ticks + costTurn(Math.abs(wrap(h - p.hdg) * 180 / Math.PI)) + dtU(e.L);
      if (!best.has(key) || t < best.get(key) - 1e-9) { best.set(key, t); prev.set(key, { back: cur.key, hdg: h }); push({ key, node: e.v, ticks: t }); }
    }
  }
  if (gKey === null) return null;
  const path = []; let k = gKey, hdgIn = null;
  while (k) { path.push(Number(k.split('|')[0])); const p = prev.get(k); if (!p) break; hdgIn = p.hdg; k = p.back; }
  path.reverse();
  return { ticks: gBest, path, hdgIn };
}

// 多目标单源搜索：一次 Dijkstra 同时求到全部候选点的最优代价/路径。
// 符号感知版：状态 (node, prevNode, sign)，sign = 入边行驶符号(+1正向/-1倒车)。
// 车头 H = aim(入边行进方向, sign)（倒车时车头=行进方向+π）；出边按正/倒两种符号
// 分别计价转角（含 13 tick 地板价），路径几何与逐段符号联合最优。
// 取代「正/倒两次单符号搜索 + 腿内 dpSigns 修补」的错位（第六轮实证：腿内 DP 省的
// 34 tick 被跨腿衔接倒贴 43 tick 抵消）。
// 返回 Map：key `${dstNode}|${sgn}` → { ticks, path(节点序列), signs(逐边符号), carH(到达车头) }。
// bothSigns=false（前瞻用）：每目标只记最先到达的单符号即停，代价省一半，作为下界足够。
function searchMulti(srcNode, srcH, dstSet, done, hold, bothSigns = true) {
  const aim = (d, s) => s === 1 ? d : wrap(d + Math.PI);
  const nWant = bothSigns ? dstSet.size * 2 : dstSet.size;
  const found = new Map();
  if (dstSet.has(srcNode)) {
    for (const s of (bothSigns ? [1, -1] : [1]))
      found.set(`${srcNode}|${s}`, { ticks: 0, path: [srcNode], signs: [], carH: srcH });
  }
  if (found.size >= nWant) return found;
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
  const s0 = nodes[srcNode];
  for (const e of adj[srcNode]) {
    const b = nodes[e.v];
    const h = Math.atan2(-(b.x - s0.x), -(b.z - s0.z));
    for (const s of [1, -1]) {
      const key = `${e.v}|${srcNode}|${s}`;
      const t = costTurn(Math.abs(wrap(aim(h, s) - srcH) * 180 / Math.PI)) + dtU(e.L);
      if (!best.has(key) || t < best.get(key) - 1e-9) { best.set(key, t); prev.set(key, { back: null, hdg: h, sgn: s }); push({ key, node: e.v, ticks: t }); }
    }
  }
  // 各 dst 都记齐（bothSigns 时两种符号都要；或队列耗尽）才停——对齐成本在 bestTo 里按
  // carH 算，次优符号常因到达车头更合适而翻盘。
  while (pq.length && found.size < nWant) {
    const cur = pop();
    if (cur.ticks > (best.get(cur.key) ?? 1e18) + 1e-9) continue;
    const p = prev.get(cur.key);
    const fKey = `${cur.node}|${p.sgn}`;
    if (dstSet.has(cur.node) && !found.has(fKey)) {
      const pathR = [], signsR = []; let k = cur.key;
      while (k) { const parts = k.split('|'); pathR.push(Number(parts[0])); const q = prev.get(k); if (!q) break; signsR.push(q.sgn); k = q.back; }
      pathR.reverse(); signsR.reverse();
      found.set(fKey, { ticks: cur.ticks, path: pathR, signs: signsR, carH: aim(p.hdg, p.sgn) });
      // 注意：仍继续扩展——某候选可能正位于通往另一候选的必经线上，停扩会漏算。
    }
    const a = nodes[cur.node];
    const backNode = Number(cur.key.split('|')[1]);
    const H = aim(p.hdg, p.sgn);
    for (const e of adj[cur.node]) {
      if (e.v === backNode) continue;              // 禁止立即折返（会撞上刚经过的障碍）
      const b = nodes[e.v];
      const h2 = Math.atan2(-(b.x - a.x), -(b.z - a.z));
      for (const s2 of [1, -1]) {
        const key = `${e.v}|${cur.node}|${s2}`;
        const t = cur.ticks + costTurn(Math.abs(wrap(aim(h2, s2) - H) * 180 / Math.PI)) + dtU(e.L);
        if (!best.has(key) || t < best.get(key) - 1e-9) { best.set(key, t); prev.set(key, { back: cur.key, hdg: h2, sgn: s2 }); push({ key, node: e.v, ticks: t }); }
      }
    }
  }
  return found;
}

// 路径简化：把共线的密集采样点合并成长直段（Douglas-Peucker + 走廊复核）
// protectIdx：额外必保顶点索引（-1=无）。冻结倒数第二顶点 → 末段方向不变，
// 腿出口 carH 与搜索方案一致，跨腿链条零失配。
function simplifyPath(path, ignore, protectIdx = -1) {
  const pts = path.map(nid => [nodes[nid].x, nodes[nid].z]);
  if (pts.length <= 2) return path;
  const okSeg = (a, b) => segOk(a[0], a[1], b[0], b[1], MARGIN, 0.002, ignore || null);
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  if (protectIdx > 0 && protectIdx < pts.length - 1) keep[protectIdx] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (hi <= lo + 1) continue;
    if (okSeg(pts[lo], pts[hi])) continue;          // 可直接相连，中间全丢
    let worst = -1, wi = lo + 1;
    const ax = pts[lo][0], az = pts[lo][1], bx = pts[hi][0], bz = pts[hi][1];
    const seg = Math.hypot(bx - ax, bz - az);
    for (let k = lo + 1; k < hi; k++) {
      const px = pts[k][0], pz = pts[k][1];
      let d;
      if (seg < 1e-9) d = Math.hypot(px - ax, pz - az);
      else { const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / (seg * seg)));
        d = Math.hypot(px - (ax + t * (bx - ax)), pz - (az + t * (bz - az))); }
      if (d > worst) { worst = d; wi = k; }
    }
    keep[wi] = true;
    stack.push([lo, wi], [wi, hi]);
  }
  if (protectIdx > 0 && protectIdx < pts.length - 1) keep[protectIdx] = true;
  return path.filter((_, i) => keep[i]);
}

// 顶点后处理：平台不接受 <1° 的转向（会直接拒发），而发射器对 <1° 转角的处理是
// 跳过不发 → 车沿旧航向直冲，切角偏差随段长放大（3u 段可偏 0.05u）→ 执行轨迹
// 偏离计划折线 → 越界。这里把每个转角 <1° 的顶点尽量删除（合并段复查走廊），
// 删不掉的留给终检 + MARGIN_BOOST 升级重试。
function postProcessLeg(ptsIn, ignore) {
  let pts = ptsIn.map(p => [p[0], p[1]]);
  const turnDegAt = (arr, i) => {
    if (i <= 0 || i >= arr.length - 1) return 0;
    const ax = arr[i][0] - arr[i - 1][0], az = arr[i][1] - arr[i - 1][1];
    const bx = arr[i + 1][0] - arr[i][0], bz = arr[i + 1][1] - arr[i][1];
    const l1 = Math.hypot(ax, az), l2 = Math.hypot(bx, bz);
    if (l1 < 1e-9 || l2 < 1e-9) return 0;
    const cosv = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (l1 * l2)));
    return Math.acos(cosv) * 180 / Math.PI;
  };
  const turnTicksOf = deg => Math.ceil(Math.max(260, (deg * Math.PI / 180) / 2.8 * 1000) / 20);
  const distTicks = (a, b) => Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.025);
  for (let guard = 0; guard < 500; guard++) {
    let changed = false;
    for (let i = 1; i < pts.length - 1; i++) {
      if (!segOk(pts[i - 1][0], pts[i - 1][1], pts[i + 1][0], pts[i + 1][1], MARGIN, 0.002, ignore || null)) continue;
      const degHere = turnDegAt(pts, i);
      // <1° 顶点无条件删（平台拒收 <1° 转向，跳发会横向漂移）；其余按净 tick 收益 ≥2 才删
      if (degHere >= MIN_TURN_DEG) {
        const before = turnTicksOf(turnDegAt(pts, i - 1)) + turnTicksOf(degHere) + turnTicksOf(turnDegAt(pts, i + 1));
        const beforeDist = distTicks(pts[i - 1], pts[i]) + distTicks(pts[i], pts[i + 1]);
        const afterDist = distTicks(pts[i - 1], pts[i + 1]);
        const afterArr = [...pts.slice(0, i), ...pts.slice(i + 1)];
        const after = turnTicksOf(turnDegAt(afterArr, i - 1)) + turnTicksOf(turnDegAt(afterArr, i));
        if (before - after - (afterDist - beforeDist) < 2) continue;
      }
      pts = [...pts.slice(0, i), ...pts.slice(i + 1)];
      changed = true; break;
    }
    if (!changed) break;
  }
  return pts;
}

// 为某目标点选择最优门点并返回路径（评估正向/倒车两种行驶符号）
//
// 倒车数学等价（已验证）：整条腿符号取 -1 时，各段航向 = 正向航向 + π，内部转角
// |(h_i+π)-(h_{i+1}+π)| = |h_i-h_{i+1}| 两向完全相同 → 倒车腿 ≡ 正向搜索但
// 入口航向 srcH+π、到达航向 hdgIn+π。实测 backward 与 forward tick 成本一致、
// 规则零扣分（replay2: rules 25/25、offroad 0、eventDeduction 0）。
// 收益：交互后「下一目标在身后」的大掉头（≥120° 共 8 个 ≈354 tick）可换成
// 180-θ 的小转向+倒车，或 0 转向直接倒出。
function bestTo(fromPt, toCandidates, done, hold, srcH, nextCands) {
  let best = null;
  // srcH：真实当前朝向（上一腿发射后的 curH）。原先用 POINTS[fromPt].h ?? 0，
  // 从检查点出发时假设航向 0 → 首转成本估错、选错腿。
  const sH = srcH != null ? srcH : (POINTS[fromPt].h ?? 0);
  const hasNext = Array.isArray(nextCands) && nextCands.length > 0;
  // 符号感知搜索：单次覆盖全部候选 × 正/倒符号（原先正/倒各一次单符号全图搜索）
  const dstNodes = new Set();
  for (const tpid of toCandidates) dstNodes.add(nodeOfPoint[tpid]);
  const res = searchMulti(nodeOfPoint[fromPt], sH, dstNodes, done, hold);
  // 展平全部 (候选, 符号) entry，按下界 base 升序；base ≥ 当前最优 tot 即 break（look ≥ 0 恒成立）。
  // 旧版「两符号差 ≤50 才都算 look」的逻辑被剪枝自然覆盖。
  const all = [];
  for (const tpid of toCandidates) {
    const nd = nodeOfPoint[tpid];
    const dst = POINTS[tpid];
    for (const s of [1, -1]) {
      const r = res.get(`${nd}|${s}`);
      if (!r) continue;
      const dAl = dst.h == null ? 0 : Math.abs(wrap(dst.h - r.carH) * 180 / Math.PI);
      const alignCost = dst.h == null ? 0 : (dst.alignTol != null && dAl <= dst.alignTol ? 0 : costTurn(dAl));
      all.push({ tpid, r, hdg: r.carH, dAl, alignCost, base: r.ticks + alignCost });
    }
  }
  all.sort((a, b) => a.base - b.base);
  for (const e of all) {
    if (best && e.base >= best.tot) break;           // 下界剪枝
    // 整腿前瞻：T_out = 到「下一腿完整候选族」的最优代价（含各成员 align）。
    // 下一腿 config 随本腿交互变化：grab→hold，release→done|=bit、hold=null。
    // 前瞻搜索也是符号感知的，会自选入口符号与逐段符号；前瞻只需下界 → 首符号即停。
    let look = 0;
    if (hasNext) {
      const dst = POINTS[e.tpid];
      let done2 = done, hold2 = hold;
      if (dst.kind === 'grab') hold2 = dst.pkg;
      else if (dst.kind === 'release') { done2 = done | (1 << idxOf.get(dst.pkg)); hold2 = null; }
      const dep = (dst.h != null && e.dAl > (dst.alignTol ?? -Infinity)) ? dst.h : e.hdg;
      const nNodes = new Set();
      for (const np of nextCands) nNodes.add(nodeOfPoint[np]);
      const res2 = searchMulti(nodeOfPoint[e.tpid], dep, nNodes, done2, hold2, false);
      let bestLook = Infinity;
      for (const np of nextCands) {
        const nd2 = nodeOfPoint[np];
        const nDst = POINTS[np];
        for (const s2 of [1, -1]) {
          const r2 = res2.get(`${nd2}|${s2}`);
          if (!r2) continue;
          const nAl = nDst.h == null ? 0 : Math.abs(wrap(nDst.h - r2.carH) * 180 / Math.PI);
          const nAlign = nDst.h == null ? 0 : (nDst.alignTol != null && nAl <= nDst.alignTol ? 0 : costTurn(nAl));
          if (r2.ticks + nAlign < bestLook) bestLook = r2.ticks + nAlign;
        }
      }
      look = Number.isFinite(bestLook) ? bestLook : 1e6;   // 整族不可达 → 重罚
    }
    const tot = e.base + look;
    if (!best || tot < best.tot) best = { ticks: e.base, tot, r: e.r, tpid: e.tpid, alignCost: e.alignCost, sign: e.s };
  }
  return best;
}

// ---------- BFS 兜底腿 ----------
// 缝隙处需要「曲线」，直边图表达不出来（BFS 连通但图不连通）。
// 用 0.05 网格 BFS 找自由空间路径，再字符串拉伸压缩成 segOk 复核过的折线顶点。
const GRID_H = 0.02;
function freeAt(x, z) {
  if (marginAt(x, z) < -1e-9) return false;
  for (const b of blockers) if (Math.hypot(b.x - x, b.z - z) < b.r) return false;
  return true;
}
function bfsFallback(fromPt, tpid) {
  const src = POINTS[fromPt], dst = POINTS[tpid];
  // 与图的锚点边一致：起/终锚点自己的包裹降到物理阈值（手持/贴身作业时本就无碰撞体或允许贴脸）
  const ig = [src.pkg, dst.pkg].filter(Boolean);
  const bl = blockersFor(ig.length ? ig : null);
  const freeAt = (x, z) => {
    if (marginAt(x, z) < -1e-9) return false;
    for (const b of bl) if (Math.hypot(b.x - x, b.z - z) < b.r) return false;
    return true;
  };
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const r of scene.roads) for (const p of r.points) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
  }
  minX -= 2; maxX += 2; minZ -= 2; maxZ += 2;
  const NX = Math.ceil((maxX - minX) / GRID_H), NZ = Math.ceil((maxZ - minZ) / GRID_H);
  const cellOf = (x, z) => [Math.round((x - minX) / GRID_H), Math.round((z - minZ) / GRID_H)];
  const [sxi, szi] = cellOf(src.x, src.z);
  const [txi, tzi] = cellOf(dst.x, dst.z);
  const prev = new Int32Array(NX * NZ).fill(-1);
  const seen = new Uint8Array(NX * NZ);
  const q = [szi * NX + sxi]; seen[q[0]] = 1;
  const target = tzi * NX + txi;
  let hit = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    if (cur === target) { hit = cur; break; }
    const cx = cur % NX, cz = (cur / NX) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx2 = cx + dx, nz2 = cz + dz;
      if (nx2 < 0 || nz2 < 0 || nx2 >= NX || nz2 >= NZ) continue;
      const ni = nz2 * NX + nx2;
      if (seen[ni]) continue;
      seen[ni] = 1;
      const wx = minX + nx2 * GRID_H, wz = minZ + nz2 * GRID_H;
      if (!freeAt(wx, wz)) continue;
      prev[ni] = cur; q.push(ni);
    }
  }
  if (hit < 0) return null;
  const cells = [];
  for (let c = hit; c >= 0; c = prev[c]) cells.push(c);
  cells.reverse();
  let pts = cells.map(c => [minX + (c % NX) * GRID_H, minZ + ((c / NX) | 0) * GRID_H]);
  pts[0] = [src.x, src.z];
  pts[pts.length - 1] = [dst.x, dst.z];
  // 字符串拉伸：从当前点贪心连到最远的可直连点（ig 语义与图的锚点边一致）
  const okSeg = (a, b, margin) => segOk(a[0], a[1], b[0], b[1], margin, 0.002, ig.length ? ig : null);
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    for (; j > i + 1; j--) if (okSeg(pts[i], pts[j], MARGIN)) break;
    if (j === i + 1 && !okSeg(pts[i], pts[j], MARGIN)) {
      // 直连下一格都不可行（BFS 走廊极窄）——保留该格，接受小风险
      out.push(pts[i + 1]); i++; continue;
    }
    out.push(pts[j]); i = j;
  }
  // 收尾段用锚点容差再压一次
  if (out.length >= 2) {
    const last = out[out.length - 1];
    for (let k = out.length - 2; k > 0; k--) {
      if (okSeg(out[k - 1], last, ANCHOR_MARGIN)) { out.splice(k, 1); }
    }
  }
  return out;
}

// ---------- 生成 ----------
const seqPath = process.env.SEQ2 || 'seq2d_v2.json';
const seqRaw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', seqPath), 'utf8')).seq;
// seq2d 的 Dijkstra 以 cp#5 为终点，漏了 goal_reached —— 补上 goal（ID.goal=1）
const seq = seqRaw.some(s => s.label === 'goal')
  ? seqRaw
  : [...seqRaw, { label: 'goal', pid: ID.goal, cp: seqRaw[seqRaw.length - 1].cp, done: seqRaw[seqRaw.length - 1].done, hold: null }];
const lines = [];
let curH = scene.start.h, curPos = [scene.start.x, scene.start.z];
const problems = [], segInfo = [];

function emitTurn(want) {
  const dv = wrap(want - curH);
  const deg = Math.abs(dv * 180 / Math.PI);
  if (deg < MIN_TURN_DEG) return;
  lines.push(`robot.${dv > 0 ? 'left_angle' : 'right_angle'}(${deg.toFixed(4)})`);
  curH = wrap(curH + dv);
}
function emitMove(L, sgn) {
  if (L <= 1e-4) return;
  lines.push(`robot.${sgn === 1 ? 'forward' : 'backward'}(${(L * CM).toFixed(4)})`);
  // 正向：沿 -sin/-cos(curH) 前进；倒车：反向
  curPos = [curPos[0] - Math.sin(curH) * L * sgn, curPos[1] - Math.cos(curH) * L * sgn];
}

let prevPid = ID.start;
let hold = null;                       // 手持状态（随 grab/release 更新）
let done = 0;                          // 已送达位掩码（原地堆随抓取消失）
// 下一腿目标的完整候选族（前瞻用）：cp→全部门点、抓/放→GRAB/REL 候选族（两处 POINTS 布局对齐）
const nextCandsOf = i => {
  const n = seq[i + 1];
  if (!n) return null;
  if (n.label.startsWith('cp#')) return ID.cpGates[+n.label.match(/cp#(\d+)/)[1]];
  if (n.label === 'start') return [ID.start];
  if (n.label === 'goal') return [ID.goal];
  return GRAB_CANDS.get(n.pid) || REL_CANDS.get(n.pid) || [n.pid];
};
// 逐段符号 DP（核心）：碰撞模型是圆（走廊 allow=width/2−0.44），倒/正向不影响合法性。
// 转角 θ>90° 时改走倒车只需转 180°−θ：tt 单调于 [0,180]，故每处 >90° 转角都有省幅。
// 末段受 dst.h 对齐约束（终朝向 = 段方向 ⊕ 符号）。
// lockedTailSign：非空则末段行驶符号锁定（腿出口 carH 必须与搜索方案一致 → 跨腿链条保真）。
// 返回 {signs, cost}：cost = 全腿转角+对齐的 tick（与发射模型同源），供消顶净收益判定。
function dpSignsCore(startPos, pts, startH, dst, lockedTailSign) {
const segs = [];                     // {d: 移动方向角, L: 长度}
let px = startPos[0], pz = startPos[1];
for (const [nx, nz] of pts) {
    const L = Math.hypot(nx - px, nz - pz);
    if (L > 1e-4) segs.push({ d: Math.atan2(-(nx - px), -(nz - pz)) });
    px = nx; pz = nz;
}
if (!segs.length) return { signs: [], cost: 0 };
const aim = (d, s) => s === 1 ? d : wrap(d + Math.PI);
const turnCost = (from, to) => tt(Math.abs(wrap(to - from) * 180 / Math.PI));
const layers = [[{ cost: turnCost(startH, aim(segs[0].d, 1)), prev: -1 },
                   { cost: turnCost(startH, aim(segs[0].d, -1)), prev: -1 }]];
for (let j = 1; j < segs.length; j++) {
    layers.push([1, -1].map((_, i2) => {
      const s2 = i2 === 0 ? 1 : -1;
      let best = null;
      for (const s1 of [1, -1]) {
        const c = layers[j - 1][s1 === 1 ? 0 : 1].cost +
                  turnCost(aim(segs[j - 1].d, s1), aim(segs[j].d, s2));
        if (!best || c < best.cost) best = { cost: c, prev: s1 === 1 ? 0 : 1 };
      }
      return best;
    }));
}
const last = layers.length - 1;
if (dst && dst.h != null) {          // 末段终朝向须落回候选 h（对齐容差内免罚）
    for (const s of [1, -1]) {
      const i = s === 1 ? 0 : 1;
      const dAl = Math.abs(wrap(dst.h - aim(segs[last].d, s)) * 180 / Math.PI);
      layers[last][i].cost += (dst.alignTol != null && dAl <= dst.alignTol) ? 0 : tt(dAl);
    }
}
if (lockedTailSign === 1 || lockedTailSign === -1)
    layers[last][lockedTailSign === 1 ? 1 : 0].cost = Infinity;   // 封死非锁定符号
let sCur = layers[last][0].cost <= layers[last][1].cost ? 0 : 1;
const signs = new Array(segs.length);
for (let j = last; j >= 0; j--) {
    signs[j] = sCur === 0 ? 1 : -1;
    if (j > 0) sCur = layers[j][sCur].prev;
}
return { signs, cost: layers[last][signs[last] === 1 ? 0 : 1].cost };
}
// 薄壳：只要符号（BFS 兜底腿用）
function dpSigns(startPos, pts, startH, dst, lockedTailSign) {
  return dpSignsCore(startPos, pts, startH, dst, lockedTailSign).signs;
}

// 符号感知净收益消顶（尾段冻结版）：删腿内中间顶点，判定成本 = dpSignsCore 精确
// 符号最优转角+对齐 + 直行 tick（与发射模型同源），净收益 ≥2 才删。
// i 上限 = len-3（保倒数第二顶点）→ 末段方向与出口 carH 与搜索方案完全一致。
function postProcessLegSym(ptsIn, curPos, curH, dst, lockedTailSign, ignore) {
  let pts = ptsIn.map(p => [p[0], p[1]]);
  const distTicks = (a, b) => Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.025);
  const turnDegAt = (arr, i) => {
    if (i <= 0 || i >= arr.length - 1) return 0;
    const ax = arr[i][0] - arr[i - 1][0], az = arr[i][1] - arr[i - 1][1];
    const bx = arr[i + 1][0] - arr[i][0], bz = arr[i + 1][1] - arr[i][1];
    const l1 = Math.hypot(ax, az), l2 = Math.hypot(bx, bz);
    if (l1 < 1e-9 || l2 < 1e-9) return 0;
    const cosv = Math.max(-1, Math.min(1, (ax * bx + az * bz) / (l1 * l2)));
    return Math.acos(cosv) * 180 / Math.PI;
  };
  const sumDist = arr => {
    let t = 0, px = curPos[0], pz = curPos[1];
    for (const [nx, nz] of arr) { t += distTicks([px, pz], [nx, nz]); px = nx; pz = nz; }
    return t;
  };
  const total = arr => dpSignsCore(curPos, arr, curH, dst, lockedTailSign).cost + sumDist(arr);
  for (let guard = 0; guard < 500; guard++) {
    let changed = false;
    for (let i = 1; i <= pts.length - 3; i++) {          // 尾冻：最多删到 len-3，保最后两顶点
      if (!segOk(pts[i - 1][0], pts[i - 1][1], pts[i + 1][0], pts[i + 1][1], MARGIN, 0.002, ignore || null)) continue;
      const degHere = turnDegAt(pts, i);
      if (degHere >= MIN_TURN_DEG) {
        const before = total(pts);
        const afterArr = [...pts.slice(0, i), ...pts.slice(i + 1)];
        if (before - total(afterArr) < 2) continue;       // 净收益 ≥2 tick 才删
      } else {
        const afterArr = [...pts.slice(0, i), ...pts.slice(i + 1)];
        if (total(pts) - total(afterArr) < 0) continue;   // <1° 平台拒发，收益 ≥0 即删
      }
      pts = [...pts.slice(0, i), ...pts.slice(i + 1)];
      changed = true; break;
    }
    if (!changed) break;
  }
  return pts;
}

// ---------- --dump：导出全部语义输入给 C++ 发射器（tools2/emit2.cpp） ----------
// 此时图（缓存）、候选族、门点、seq 全部就绪；C++ 复刻 bestTo/发射/终检，秒级完成。
{
  const i = process.argv.indexOf('--dump');
  if (i >= 0) {
    const out = [];
    const push = (...a) => out.push(a.join('\t'));
    const KIND = { start: 0, goal: 1, grab: 2, release: 3, cp: 4 };
    push('PARAMS', VEH_R, MARGIN, ANCHOR_MARGIN, MIN_TURN_DEG, BOOST, CM);
    push('SEGS', SEGS.length);
    for (const s of SEGS) push('S', s.ax, s.az, s.bx, s.bz, s.allow);
    // 阻挡者（interDef.packages 全序 k；r_full/r_phys + 包 id）
    push('BLOCKERS', blockers.length);
    blockers.forEach((b, k) => push('Y', k, b.id, b.x, b.z, b.r, PHYS.get(b.id)));   // 'Y'：'B' 与 FAMS 抓取族撞 tag
    // 任务点
    push('POINTS', POINTS.length);
    for (const p of POINTS)
      push('T', p.id, p.x, p.z, p.h == null ? 'null' : p.h, KIND[p.kind], p.pkg || '-',
        p.alignTol == null ? 'null' : p.alignTol, p.idx == null ? -1 : p.idx, p.label);
    // 候选族（Map pid→[pid...]）
    push('FAMS', GRAB_CANDS.size + REL_CANDS.size);
    for (const [pid, arr] of GRAB_CANDS) push('B', pid, ...arr);
    for (const [pid, arr] of REL_CANDS) push('D', pid, ...arr);
    // 门点组
    push('GATES', ID.cpGates.length);
    for (const g of ID.cpGates) push('G', g.length, ...g);
    // seq（goal 补齐后）
    push('SEQ', seq.length);
    for (const s of seq) push('Q', s.pid, s.cp, s.label);
    // 图
    push('NODES', nodes.length);
    for (const n of nodes) push('N', n.id, n.x, n.z);
    push('NODEOFPOINT', nodeOfPoint.length);
    out.push(nodeOfPoint.join('\t'));
    // 边（hitIds 包 id → k）
    const id2k = new Map(blockers.map((b, k) => [b.id, k]));
    push('EDGES', EDGE_RECORDS.length);
    for (const e of EDGE_RECORDS) {
      const ks = e.hitIds.map(h => id2k.get(h)).filter(x => x !== undefined);
      push('E', e.a, e.b, e.L, ks.length, ...ks);
    }
    // 道路折线（BFS bounds 用）
    push('ROADS', scene.roads.length);
    for (const r of scene.roads) {
      push('R', r.width, r.points.length);
      out.push(r.points.map(p => `${p[0]},${p[1]}`).join(','));
    }
    push('START', scene.start.x, scene.start.z, scene.start.h);
    push('GOAL', scene.goal[0], scene.goal[1]);
    push('INTER', 38, 34);   // grab/release tick 常量
    fs.writeFileSync(process.argv[i + 1], out.join('\n') + '\n');
    console.log(`已 dump -> ${process.argv[i + 1]}（节点 ${nodes.length}，边 ${EDGE_RECORDS.length}，点 ${POINTS.length}，seq ${seq.length}）`);
    process.exit(0);
  }
}

const tEmit0 = Date.now();
for (let i = 1; i < seq.length; i++) {
  const label = seq[i].label;
  let cands;
  if (label.startsWith('cp#')) {
    const ci = +label.match(/cp#(\d+)/)[1];
    cands = ID.cpGates[ci];
  } else {
    // 抓/放用候选位姿族（GRAB_CANDS / REL_CANDS）：基线只固定一个靠近方向，
    // 交互后常需 140°~180° 掉头（40~56 tick/次）；候选族让最短路自选「进来就朝下一个目标」的方向。
    cands = GRAB_CANDS.get(seq[i].pid) || REL_CANDS.get(seq[i].pid) || [seq[i].pid];
  }
  CUR_HOLD = hold;                     // 本腿行走时手持谁（其碰撞体不存在）
  const legLineStart = lines.length;
  const legStartPos = [curPos[0], curPos[1]];
  const b = bestTo(prevPid, cands, done, hold, curH, nextCandsOf(i));
  let plan, legTicks = null, usedTpid = null;           // plan: [{x,z,d,L,s}] 段端点+符号
  if (b) {
    // ord24 管线：冻结尾段的符号感知消顶。
    // ① simplifyPath 合并（保倒数第二顶点 → 末段方向不变）；
    // ② postProcessLegSym 删中间小顶点（判定 = dpSigns 精确符号最优成本，尾冻 len-3）；
    // ③ dpSigns 重选符号但锁末段 = 搜索末边符号 → 出口 carH 与搜索/前瞻假设完全一致。
    // 进入状态（curPos/curH）与退出状态（carH）均与搜索相同 → 跨腿零失配，纯增益。
    const lockedTail = b.r.signs.length ? b.r.signs[b.r.signs.length - 1] : 1;
    const simplified = simplifyPath(b.r.path, null, b.r.path.length > 2 ? b.r.path.length - 2 : -1);
    const rawPts = simplified.map(nid => [nodes[nid].x, nodes[nid].z]);
    const pts = postProcessLegSym(rawPts, curPos, curH, POINTS[b.tpid] ?? null, lockedTail, null);
    const signs = dpSigns(curPos, pts, curH, POINTS[b.tpid] ?? null, lockedTail);
    plan = []; let si = 0;
    let px = curPos[0], pz = curPos[1];
    for (const [nx, nz] of pts) {
      const L = Math.hypot(nx - px, nz - pz);
      if (L > 1e-4) { plan.push({ x: nx, z: nz, d: Math.atan2(-(nx - px), -(nz - pz)), L, s: signs[si] != null ? signs[si] : 1 }); si++; }
      px = nx; pz = nz;
    }
    legTicks = b.ticks; usedTpid = b.tpid;
    console.log(`[leg ${i}/${seq.length - 1}] ${POINTS[prevPid].label} -> ${label}  计划 ${legTicks} tick  累计 ${((Date.now() - tEmit0) / 60000).toFixed(1)}min`);
  } else {
    // 图不可达 → BFS 兜底腿（无搜索符号，退回 postProcessLeg + dpSigns 老管线）
    for (const tpid of cands) {
      const f = bfsFallback(prevPid, tpid);
      if (f) {
        const pts = postProcessLeg(f, null);
        const signs = dpSigns(curPos, pts, curH, POINTS[tpid]);
        plan = []; let si = 0;
        let px = curPos[0], pz = curPos[1];
        for (const [nx, nz] of pts) {
          const L = Math.hypot(nx - px, nz - pz);
          if (L > 1e-4) { plan.push({ x: nx, z: nz, d: Math.atan2(-(nx - px), -(nz - pz)), L, s: signs[si] != null ? signs[si] : 1 }); si++; }
          px = nx; pz = nz;
        }
        legTicks = -1; usedTpid = tpid;
        console.log(`  ↻ ${POINTS[prevPid].label} -> ${POINTS[tpid].label} 图不可达，用 BFS 兜底腿（${f.length} 顶点）`);
        break;
      }
    }
  }
  if (!plan) { console.error(`❌ ${POINTS[prevPid].label} -> ${label} 图与 BFS 均不可达，中止`); process.exit(1); }
  // 计划段即时校验：planned 折线本身必须全程 margin ≥ 0
  {
    let px = legStartPos[0], pz = legStartPos[1];
    for (const sg of plan) {
      const LL = Math.hypot(sg.x - px, sg.z - pz);
      if (LL < 1e-9) continue;
      const nn = Math.max(2, Math.ceil(LL / 0.002));
      let wm = Infinity;
      for (let q = 0; q <= nn; q++) { const t = q / nn; wm = Math.min(wm, marginAt(px + (sg.x - px) * t, pz + (sg.z - pz) * t)); }
      if (wm < -1e-7) console.log(`  ✗ 计划段即越界: (${px.toFixed(2)},${pz.toFixed(2)})->(${sg.x.toFixed(2)},${sg.z.toFixed(2)}) worst=${wm.toFixed(4)}`);
      px = sg.x; pz = sg.z;
    }
  }
  for (const sg of plan) {
    const L = Math.hypot(sg.x - curPos[0], sg.z - curPos[1]);
    if (L > 1e-9) {
      const s = sg.s;
      const want = Math.atan2(-(sg.x - curPos[0]), -(sg.z - curPos[1]));
      // 倒车段：车头指向顶点反向（移动方向 = 车头反向 = 指向顶点）
      const aim = s === 1 ? want : wrap(want + Math.PI);
      const dvDeg = Math.abs(wrap(aim - curH) * 180 / Math.PI);
      if (dvDeg > 1e-6 && dvDeg < MIN_TURN_DEG)
        console.log(`  ⚠ 跳过 ${dvDeg.toFixed(3)}° 瞄准角（${POINTS[prevPid].label} 腿 L=${L.toFixed(2)}u ${s === 1 ? '正向' : '倒车'} → 横向偏差上限 ${(Math.sin(dvDeg * Math.PI / 180) * L).toFixed(3)}u）`);
      emitTurn(aim);
      emitMove(L, s);
    }
  }

  const dst = POINTS[usedTpid];
  if (dst.h != null) {
    const dAl = Math.abs(wrap(dst.h - curH) * 180 / Math.PI);
    if (!(dst.alignTol != null && dAl <= dst.alignTol)) emitTurn(dst.h);
  }
  if (dst.kind === 'grab') { lines.push('robot.grab()'); hold = dst.pkg; }
  else if (dst.kind === 'release') {
    lines.push('robot.release()'); hold = null;
    DONE_SET.add(dst.pkg); done |= (1 << idxOf.get(dst.pkg));
  }
  // 实发 tick（本腿新发射的全部指令）——与计划 legTicks 对账，定位发射环节的漏分点
  let act = 0, actDist = 0;
  for (let li = legLineStart; li < lines.length; li++) {
    const L = lines[li]; let mm;
    if ((mm = L.match(/^robot\.(?:forward|backward)\(([\d.]+)\)$/))) { const u = Math.abs(+mm[1]) / CM; act += dtU(u); actDist += u; }
    else if ((mm = L.match(/^robot\.(?:left_angle|right_angle)\(([\d.]+)\)$/))) act += tt(+mm[1]);
    else if (L === 'robot.grab()') act += 38;
    else if (L === 'robot.release()') act += 34;
  }
  segInfo.push({ seg: `${POINTS[prevPid].label} -> ${dst.label}`, ticks: legTicks, actual: act, dist: actDist,
    from: legStartPos, to: [curPos[0], curPos[1]] });
  prevPid = usedTpid;
}

// ---------- 执行折线终检（用与仿真完全一致的运动模型重建） ----------
// 平台判据：轨迹点到道路折线距离 ≤ width/2 − 0.44（各路走廊并集）。
// 采样 0.001u；阈值 −1e-7（即 margin ≥ 0 才算路内）。
{
  let vx = scene.start.x, vz = scene.start.z, vh = scene.start.h;
  const poly = [[vx, vz]];
  for (const l of lines) {
    let m;
    if ((m = l.match(/^robot\.(forward|backward)\(([-\d.]+)\)$/))) {
      const units = (+m[2]) / CM * (m[1] === 'forward' ? 1 : -1);   // 倒车为负
      vx -= Math.sin(vh) * units; vz -= Math.cos(vh) * units;
    } else if ((m = l.match(/^robot\.(left_angle|right_angle)\(([-\d.]+)\)$/))) {
      vh += (m[1] === 'left_angle' ? 1 : -1) * (+m[2]) * Math.PI / 180;
      poly.push([vx, vz]);
    }
  }
  const viol = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-9) continue;
    const n = Math.max(2, Math.ceil(L / 0.001));
    let wm = Infinity, wt = 0;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const mg = marginAt(ax + (bx - ax) * t, az + (bz - az) * t);
      if (mg < wm) { wm = mg; wt = t; }
    }
    if (wm < -1e-7) viol.push({ seg: i, worst: +wm.toFixed(4), at: [+(ax + (bx - ax) * wt).toFixed(3), +(az + (bz - az) * wt).toFixed(3)], L: +L.toFixed(2) });
  }
  if (viol.length) {
    console.log(`❌ 终检：执行折线有 ${viol.length} 段越界（${BOOST > 0 ? 'MARGIN_BOOST=' + BOOST : 'MARGIN_BOOST=0'}）`);
    viol.slice(0, 8).forEach(v => console.log('   seg', v.seg, 'worst', v.worst, '@', v.at, 'L=' + v.L));
    console.log('   → 加大 MARGIN_BOOST 重试，例如: MARGIN_BOOST=0.03 node tools2/emit2.js');
    process.exitCode = 2;
  } else {
    console.log(`✅ 终检通过：执行折线全程在走廊内（采样 0.001u${BOOST > 0 ? '，MARGIN_BOOST=' + BOOST : ''}）`);
  }
}

const outPath = (() => { const i = process.argv.indexOf('--out'); return i >= 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'routes2', 'candidates', 'T2_v2.py'); })();
fs.writeFileSync(outPath, lines.join('\n') + '\n');

// 合法性自检
let est = 0;
const illegal = [];
lines.forEach((l, i) => {
  let m;
  if ((m = l.match(/^robot\.(?:forward|backward)\(([\d.]+)\)$/))) est += dtU(Math.abs(+m[1]) / CM);
  else if ((m = l.match(/^robot\.(left_angle|right_angle)\(([\d.]+)\)$/))) { const d = +m[2]; est += tt(d); if (d < 1 || d > 360) illegal.push(`line ${i + 1}: ${l}`); }
  else if (l === 'robot.grab()') est += 38;
  else if (l === 'robot.release()') est += 34;
});
console.log('=== 逐段：计划 vs 实发 ===');
let sumP = 0, sumA = 0, sumStraight = 0, sumTravel = 0;
for (const s of segInfo) {
  sumP += s.ticks ?? 0; sumA += s.actual;
  const gap = (s.actual - (s.ticks ?? 0));
  const st = s.from && s.to ? Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]) : 0;
  const tr = s.dist || 0;
  sumStraight += st; sumTravel += tr;
  const ratio = st > 1e-9 ? (tr / st).toFixed(2) : '-';
  console.log(`  ${s.seg.padEnd(38)} 计划 ${String(s.ticks).padStart(5)}  实发 ${String(s.actual).padStart(5)}  差 ${gap > 0 ? '+' : ''}${String(gap).padStart(4)}  直线 ${st.toFixed(2)} 行程 ${tr.toFixed(2)} 比 ${ratio}`);
}
console.log(`  合计 计划 ${sumP} / 实发 ${sumA} / 差 ${sumA - sumP}，直线和 ${sumStraight.toFixed(2)}u，行程 ${sumTravel.toFixed(2)}u，绕行比 ${(sumTravel / sumStraight).toFixed(3)}`);
console.log(`\n指令 ${lines.length}（转向 ${lines.filter(l => l.includes('angle')).length}，直行 ${lines.filter(l => l.includes('forward')).length}）`);
console.log(`估算 ${est} tick = ${(est * 0.02).toFixed(2)}s（满分线 6240 tick）`);
console.log(illegal.length ? `❌ 非法转向 ${illegal.length}: ${illegal.slice(0, 3).join('; ')}` : '✅ 全部转向合法');
if (problems.length) console.log('问题:', problems.join('; '));
console.log('已写', outPath);
