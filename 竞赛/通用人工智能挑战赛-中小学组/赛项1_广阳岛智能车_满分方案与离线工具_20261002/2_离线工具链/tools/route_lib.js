'use strict';
// 任务3 路线求解共用库
// 目标函数直接对齐评分：tick = dtU(距离) + tt(转角)
//   dtU(u) = max(1, ceil(u / 0.025))        行驶 tick（标称速度 1.25 u/s，每 tick 20ms）
//   tt(deg)= ceil(max(260, deg/2.8*1000)/20) 转向 tick（角速度 2.8 rad/s，下限 260ms）
// 关键：两式都有取整/下限，故「分段数」本身影响总耗时，不能只看几何距离。
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.GY_DATA_DIR || path.join(__dirname, '..', 'data');
const STEP_MS = 20, NOM = 1.25, MAX_ANG = 2.8, VEH_R = 0.44, UPM = 8;
const CM = 100 / UPM;
const dtU = u => Math.max(1, Math.ceil(u / (NOM * STEP_MS / 1000)));
const tt = deg => Math.ceil(Math.max(260, (deg * Math.PI / 180) / MAX_ANG * 1000) / STEP_MS);
const wrap = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

function loadScene(dir = DATA_DIR) {
  const dd = JSON.parse(fs.readFileSync(path.join(dir, 'scene_task3.json'), 'utf8'));
  const auth = JSON.parse(fs.readFileSync(path.join(dir, 'auth_scene.json'), 'utf8'));
  return { dd, auth };
}

function buildGraph(dd) {
  const roads = dd.roads;
  const IDX = new Map(), coords = [];
  const nid = (x, z) => { const k = `${x.toFixed(3)},${z.toFixed(3)}`;
    if (!IDX.has(k)) { IDX.set(k, coords.length); coords.push([x, z]); } return IDX.get(k); };
  const adj = new Map();
  roads.forEach((r, ri) => {
    const ids = r.points.map(p => nid(p[0], p[1]));
    for (let i = 0; i < ids.length - 1; i++) {
      const a = ids[i], b = ids[i + 1];
      const L = Math.hypot(coords[b][0] - coords[a][0], coords[b][1] - coords[a][1]);
      if (L < 1e-9) continue;
      for (const [u, v] of [[a, b], [b, a]]) {
        if (!adj.has(u)) adj.set(u, []);
        adj.get(u).push({ v, L, ri, si: i });
      }
    }
  });
  const nearest = p => { let bi = 0, bd = 1e18;
    for (let i = 0; i < coords.length; i++) { const d = Math.hypot(coords[i][0] - p[0], coords[i][1] - p[1]);
      if (d < bd) { bd = d; bi = i; } } return { idx: bi, dist: bd }; };
  const hdg = (u, v) => Math.atan2(-(coords[v][0] - coords[u][0]), -(coords[v][1] - coords[u][1]));
  return { roads, coords, adj, nearest, hdg, nid, IDX };
}

// 以 tick 为代价的最优搜索。状态 = (当前节点, 上一节点)，朝向由进入边决定。
// 返回 { ticks, dist, turnDeg, nodes, headings, segments }
function searchTicks(G, srcIdx, srcHeading, dstIdx, opts = {}) {
  const maxTurnDeg = opts.maxTurnDeg ?? 360;
  const forbidUTurn = opts.forbidUTurn ?? false;
  const cmp = (a, b) => a - b;
  const best = new Map(), prev = new Map(), pq = [];
  const push = (it) => { pq.push(it); let i = pq.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (cmp(pq[p].ticks, pq[i].ticks) <= 0) break; [pq[p], pq[i]] = [pq[i], pq[p]]; i = p; } };
  const pop = () => { const top = pq[0], last = pq.pop();
    if (pq.length) { pq[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < pq.length && cmp(pq[l].ticks, pq[m].ticks) < 0) m = l;
        if (r < pq.length && cmp(pq[r].ticks, pq[m].ticks) < 0) m = r;
        if (m === i) break; [pq[m], pq[i]] = [pq[i], pq[m]]; i = m; } }
    return top; };

  const relax = (key, node, ticks, dist, turnDeg, back) => {
    if (!best.has(key) || ticks < best.get(key).ticks - 1e-9) {
      const rec = { ticks, dist, turnDeg, node, back };
      best.set(key, rec); prev.set(key, back);
      push({ key, ticks, node });
      return true;
    }
    return false;
  };

  // 起点：从 src 的每条出边出发，代价含首次转向
  for (const e of (G.adj.get(srcIdx) || [])) {
    const h = G.hdg(srcIdx, e.v);
    const d = Math.abs(wrap(h - srcHeading) * 180 / Math.PI);
    if (d > maxTurnDeg) continue;
    relax(`${e.v}|${srcIdx}`, e.v, tt(d) + dtU(e.L), e.L, d, null);
  }
  let goalKey = null;
  while (pq.length) {
    const cur = pop();
    const cb = best.get(cur.key);
    if (!cb || cur.ticks > cb.ticks + 1e-9) continue;
    if (cur.node === dstIdx) { goalKey = cur.key; break; }
    const p = prev.get(cur.key);
    const pNode = p ? p.node : null;
    const hIn = pNode === null ? srcHeading : G.hdg(pNode, cur.node);
    for (const e of (G.adj.get(cur.node) || [])) {
      if (forbidUTurn && pNode !== null && e.v === pNode) continue;
      const h = G.hdg(cur.node, e.v);
      const d = Math.abs(wrap(h - hIn) * 180 / Math.PI);
      if (d > maxTurnDeg) continue;
      const key = `${e.v}|${cur.node}`;
      const nk = cb.ticks + tt(d) + dtU(e.L);
      if (relax(key, e.v, nk, cb.dist + e.L, cb.turnDeg + d, { node: cur.node, key: cur.key, h })) {
        if (e.v === dstIdx) { /* 继续，等它出队时判定最优 */ }
      }
    }
  }
  if (goalKey === null) return null;
  const seq = []; let k = goalKey;
  while (k) { const p = prev.get(k); if (!p) break; seq.push(Number(k.split('|')[0])); k = p.key; }
  seq.reverse();
  const rec = best.get(goalKey);
  return { ticks: rec.ticks, dist: rec.dist, turnDeg: rec.turnDeg, nodes: seq };
}

module.exports = { loadScene, buildGraph, searchTicks, dtU, tt, wrap, CM, UPM, STEP_MS, DATA_DIR, VEH_R };
