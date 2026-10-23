#!/usr/bin/env node
// 任务二「停靠点顺序」的最优性检验
//
// 关键判据：任何路径长度 >= 相邻停靠点之间的直线距离之和。
//   故若「最优顺序下的直线距离和」换算成 tick 已超过满分线，则 100 分数学上不可达。
//
// 约束：① 检查点必须按 0..5 依次经过（平台按索引判定，core.js:2306）
//       ② 每个包裹须「先取后放」；目标物放仓储，混淆物放路外
//       ③ 起点出发，终点为停车区
//
// 方法：状态 DP（Held-Karp 变体）
//   状态 = (已过的检查点数, 已成为「已取未放」的包裹集合, 当前位置)
//   由于一次只能持一件，未放下的包裹至多 1 件。
//
// 用法: node tools2/order_bound2.js
'use strict';
const fs = require('fs');
const path = require('path');

const D2 = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(D2, 'scene_task2.json'), 'utf8'));
const interDef = JSON.parse(fs.readFileSync(path.join(D2, 'inter_task2.json'), 'utf8'));

const cps = scene.checkpoints.map(c => c.position);
const goal = scene.goal;
const start = [scene.start.x, scene.start.z];
const STORE = scene.deliveries.find(d => d.destinationRole === 'storage').destination;

// 包裹：目标物 -> 仓储；混淆物 -> 路外（释放点取包裹旁 1.1u 处，近似为包裹位置附近）
const P = {};
for (const p of interDef.packages) {
  if (p.role === 'obstacle') continue;
  P[p.id] = { pos: [p.x, p.z], role: p.role, id: p.id };
}
// 混淆物的释放点：需在路外，取包裹位置本身作近似（释放点距包裹约 1.1u，方向可调）
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const pkgIds = Object.keys(P);
const tgtIds = pkgIds.filter(id => P[id].role === 'target');
const dstrIds = pkgIds.filter(id => P[id].role === 'distractor');
console.log('检查点:', cps.map((c, i) => `cp#${i}`).join(' '));
console.log('目标物:', tgtIds.join(' '), ' -> 仓储', STORE);
console.log('混淆物:', dstrIds.join(' '), ' -> 路外');
console.log('起点', start, ' 终点', goal);
console.log();

// 基线顺序的直线距离和
const baseOrder = [
  { n: 'start', p: start },
  { n: 'cp#0', p: cps[0] },
  { n: 'grab(t1)', p: P['guangyang-target-1'].pos },
  { n: 'drop(store)', p: STORE },
  { n: 'grab(t2)', p: P['guangyang-target-2'].pos },
  { n: 'cp#1', p: cps[1] },
  { n: 'drop(store)', p: STORE },
  { n: 'grab(d1)', p: P['guangyang-distractor-1'].pos },
  { n: 'drop(d1)', p: P['guangyang-distractor-1'].pos },
  { n: 'cp#2', p: cps[2] },
  { n: 'cp#3', p: cps[3] },
  { n: 'grab(d2)', p: P['guangyang-distractor-2'].pos },
  { n: 'drop(d2)', p: P['guangyang-distractor-2'].pos },
  { n: 'cp#4', p: cps[4] },
  { n: 'cp#5', p: cps[5] },
  { n: 'goal', p: goal }
];
let baseSum = 0;
for (let i = 1; i < baseOrder.length; i++) baseSum += dist(baseOrder[i - 1].p, baseOrder[i].p);
console.log(`基线顺序的直线距离和 = ${baseSum.toFixed(2)}u`);

// ---------- DP 求最优顺序的直线距离和 ----------
// 状态：{cpIdx, holding(0/1 及是哪个), doneSet, at}
// 为避免爆炸，用记忆化 DFS + 剪枝。规模小（6 检查点、4 包裹）。
const items = pkgIds;                     // 4 件
const N = items.length;
const idxOf = {}; items.forEach((id, i) => idxOf[id] = i);
const FULL = (1 << N) - 1;
const memo = new Map();
const INF = 1e18;

// 位置编码：'cp:i' | 'goal' | 'start' | 'pkg:id' | 'store' | 'off:id'
const posOf = key => {
  if (key === 'start') return start;
  if (key === 'goal') return goal;
  if (key === 'store') return STORE;
  if (key.startsWith('cp:')) return cps[+key.slice(3)];
  if (key.startsWith('pkg:')) return P[key.slice(4)].pos;
  if (key.startsWith('off:')) return P[key.slice(4)].pos;   // 混淆物释放点近似为包裹位置
  throw new Error('bad key ' + key);
};

function solve() {
  const best = { v: INF, order: null };
  // DFS：cf = 已过的检查点数（下一个要过 cf），done = 已送达集合，holding = 当前持有（null 或 id）
  const dfs = (cf, done, holding, at, acc, trail) => {
    if (acc >= best.v) return;
    // 终点：检查点全过、所有包裹已送达、返回 goal
    if (cf >= cps.length && done === FULL) {
      const total = acc + dist(posOf(at), goal);
      if (total < best.v) { best.v = total; best.order = [...trail, { n: 'goal', key: 'goal' }]; }
      return;
    }
    const key = `${cf}|${done}|${holding || '-'}|${at}`;
    const seen = memo.get(key);
    if (seen !== undefined && seen <= acc) return;
    memo.set(key, acc);

    // 动作 1：过下一个检查点
    if (cf < cps.length) {
      const k = `cp:${cf}`;
      const p = posOf(k);
      dfs(cf + 1, done, holding, k, acc + dist(posOf(at), p), [...trail, { n: `cp#${cf}`, key: k }]);
    }
    // 动作 2：放下当前持有
    if (holding) {
      const isT = P[holding].role === 'target';
      const k = isT ? 'store' : `off:${holding}`;
      const p = posOf(k);
      const nd = isT ? (done | (1 << idxOf[holding])) : (done | (1 << idxOf[holding]));
      dfs(cf, nd, null, k, acc + dist(posOf(at), p), [...trail, { n: `drop(${holding.replace('guangyang-', '')})`, key: k }]);
    }
    // 动作 3：拾取一个未处理的包裹（仅在空手时）
    if (!holding) {
      for (const id of items) {
        if (done & (1 << idxOf[id])) continue;
        const k = `pkg:${id}`;
        const p = posOf(k);
        dfs(cf, done, id, k, acc + dist(posOf(at), p), [...trail, { n: `grab(${id.replace('guangyang-', '')})`, key: k }]);
      }
    }
  };
  dfs(0, 0, null, 'start', 0, [{ n: 'start', key: 'start' }]);
  return best;
}

const t0 = Date.now();
const r = solve();
console.log(`枚举耗时 ${Date.now() - t0} ms`);
console.log(`\n=== 最优顺序（按直线距离）===`);
for (let i = 0; i < r.order.length; i++) {
  const o = r.order[i];
  console.log(`  ${String(i).padStart(2)} ${o.n}`);
}
console.log(`\n最优直线距离和 = ${r.v.toFixed(2)}u`);
console.log(`基线顺序直线和 = ${baseSum.toFixed(2)}u  （基线实际行驶 172.8u）`);

// 换算时间下界
const dtU = u => Math.max(1, Math.ceil(u / 0.025));
const INT = 288;                        // 材质动画固定
const minTurns = r.order.length - 1;
const lbTicks = dtU(r.v) + minTurns * 13 + INT;
console.log(`\n=== 时间下界（最优顺序 + 完美直线）===`);
console.log(`行驶 >= ${dtU(r.v)} tick（直线 ${r.v.toFixed(2)}u）`);
console.log(`转向 >= ${minTurns}×13 = ${minTurns * 13} tick`);
console.log(`交互   = ${INT} tick`);
console.log(`合计 >= ${lbTicks} tick = ${(lbTicks * 0.02).toFixed(1)}s`);
const FULL_LINE = Math.round(124.8 / 0.02);
console.log(`满分线 124.8s = ${FULL_LINE} tick`);
console.log(lbTicks <= FULL_LINE
  ? '✅ 即使完美直线也在满分线内，100 分理论上可达（需极精密路线）'
  : `❌ 即使完美直线也差 ${lbTicks - FULL_LINE} tick = ${((lbTicks - FULL_LINE) * 0.02).toFixed(1)}s —— 100 分数学上不可达`);
