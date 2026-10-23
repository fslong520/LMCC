'use strict';
// 按「下一个预期途经点」切段：逐顶点行走，接近 cp/抓/放/goal 即切。
// 输出每段：直线距离、实际行程、绕行比、驱动 tick、转向 tick —— 定位可省里程。
const fs = require('fs'), path = require('path');
const { dtU, tt, CM } = require('../tools/route_lib.js');

const dir = path.join(__dirname, '..', 'data2');
const scene = JSON.parse(fs.readFileSync(path.join(dir, 'scene_task2.json'), 'utf8'));
const inter = JSON.parse(fs.readFileSync(path.join(dir, 'inter_task2.json'), 'utf8'));
const seq = JSON.parse(fs.readFileSync(path.join(__dirname, '..', process.argv[3] || 'seq2d_v2.json'), 'utf8')).seq;

const PK = {}; for (const p of inter.packages) PK[p.id] = { x: p.x, z: p.z, role: p.role };
const short = id => id.replace('guangyang-', '');
// 目标序列（含标签与坐标/半径）
const WP = [];
const push = (label, x, z, r) => WP.push({ label, x, z, r });
push('start', scene.start.x, scene.start.z, 0.01);
for (const s of seq) {
  const m = s.label.match(/^cp#(\d+)$/);
  if (m) { const c = scene.checkpoints[+m[1]].position; push(s.label, c[0], c[1], scene.config?.checkpointRadius ?? 1.05); }
  else if (s.label.startsWith('grab(')) { const id = Object.keys(PK).find(k => short(k) === s.label.slice(5, -1)); push(s.label, PK[id].x, PK[id].z, 1.35); }
  else if (s.label.startsWith('drop(')) { const id = Object.keys(PK).find(k => short(k) === s.label.slice(5, -1)); push(s.label, PK[id].x, PK[id].z, 1.6); }
  else if (s.label === 'goal') push('goal', scene.goal[0], scene.goal[1], 1.05);
}
if (!seq.some(s => s.label === 'goal')) push('goal', scene.goal[0], scene.goal[1], 1.05);

const lines = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n');
let x = scene.start.x, z = scene.start.z, h = scene.start.h;
const V = [];
let curTurns = [], curTurnTicks = 0;
const legs = [];
let leg = { pts: [[x, z]], turns: [], turnTicks: 0, from: 'start', to: '?' };
let wi = 0;
const record = to => {
  leg.to = to; legs.push(leg);
  leg = { pts: [[x, z]], turns: [], turnTicks: 0, from: to, to: '?' };
};
for (const l of lines) {
  let m;
  if ((m = l.match(/^robot\.forward\(([-\d.]+)\)$/))) {
    const L = Math.abs(+m[1]) / CM;
    x -= Math.sin(h) * L; z -= Math.cos(h) * L;
    V.push([x, z]);
    leg.pts.push([x, z]);
    // 是否到达下一个预期途经点
    if (wi < WP.length) {
      const w = WP[wi];
      if (Math.hypot(x - w.x, z - w.z) <= w.r) { wi++; record(w.label); }
    }
  } else if ((m = l.match(/^robot\.(left_angle|right_angle)\(([-\d.]+)\)$/))) {
    const d = +m[2];
    h += (m[1] === 'left_angle' ? 1 : -1) * d * Math.PI / 180;
    leg.turns.push(+d.toFixed(1)); leg.turnTicks += tt(d);
  } else if (l === 'robot.grab()' || l === 'robot.release()') {
    // 交互点由上方途经判定覆盖；这里只兜底
    if (wi < WP.length && Math.hypot(x - WP[wi].x, z - WP[wi].z) <= WP[wi].r) { const w = WP[wi]; wi++; record(w.label); }
  }
}
if (leg.pts.length > 1) record('(tail)');
console.log('段                直线u   行程u  绕行比  驱动tk 转向tk  转角');
let tot = 0, ts = 0;
for (const g of legs) {
  if (g.pts.length < 2) continue;
  const a = g.pts[0], b = g.pts[g.pts.length - 1];
  const st = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let dist = 0, drive = 0;
  for (let i = 1; i < g.pts.length; i++) {
    const dd = Math.hypot(g.pts[i][0] - g.pts[i - 1][0], g.pts[i][1] - g.pts[i - 1][1]);
    dist += dd; drive += dtU(dd);
  }
  const ratio = st > 1e-9 ? dist / st : 1;
  tot += dist; ts += st;
  console.log(`${(g.from + '→' + g.to).padEnd(18)} ${st.toFixed(2).padStart(6)} ${dist.toFixed(2).padStart(7)} ${ratio.toFixed(2).padStart(6)} ${String(drive).padStart(6)} ${String(g.turnTicks).padStart(6)}  ${g.turns.join(',')}`);
}
console.log(`合计 行程 ${tot.toFixed(2)}u / 直线 ${ts.toFixed(2)}u  绕行比 ${(tot / ts).toFixed(3)}`);
console.log(`未匹配途经点: ${WP.slice(wi).map(w => w.label).join(', ') || '无'}`);
