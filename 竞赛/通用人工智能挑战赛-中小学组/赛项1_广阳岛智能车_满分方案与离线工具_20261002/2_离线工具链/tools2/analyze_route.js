'use strict';
// 路线几何分析：按交互切段，比较「直线距离 vs 实际行程」，标出绕行比最大的腿
const fs = require('fs');
const { dtU, tt, CM } = require('../tools/route_lib.js');

const lines = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n');
const start = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'data2/scene_task2.json'), 'utf8')).start;
// heading 约定：位置更新 x -= sin(h)*L, z -= cos(h)*L
let x = start.x, z = start.z, h = start.h;
const legs = [];
let cur = { from: [x, z], dist: 0, turnTicks: 0, turns: [], pts: [[x, z]] };
for (const l of lines) {
  let m;
  if ((m = l.match(/^robot\.forward\(([-\d.]+)\)$/))) {
    const L = Math.abs(+m[1]) / CM;
    x -= Math.sin(h) * L; z -= Math.cos(h) * L;
    cur.dist += L; cur.pts.push([x, z]);
  } else if ((m = l.match(/^robot\.(left_angle|right_angle)\(([-\d.]+)\)$/))) {
    const d = +m[2];
    h += (m[1] === 'left_angle' ? 1 : -1) * d * Math.PI / 180;
    cur.turnTicks += tt(d); cur.turns.push(+d.toFixed(1));
  } else if (l === 'robot.grab()' || l === 'robot.release()') {
    legs.push({ ...cur, op: l });
    cur = { from: [x, z], dist: 0, turnTicks: 0, turns: [], pts: [[x, z]] };
  }
}
legs.push({ ...cur, op: 'end' });
let tot = 0, totStraight = 0;
console.log('腿   起→止(直线u)  行程u   绕行比   驱动tick 转向tick 转角列表');
legs.forEach((s, i) => {
  const a = s.from, b = s.pts[s.pts.length - 1];
  const straight = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ratio = straight > 1e-9 ? s.dist / straight : 1;
  tot += s.dist; totStraight += straight;
  console.log(
    `${String(i).padStart(2)}  ${straight.toFixed(2).padStart(9)}  ${s.dist.toFixed(2).padStart(7)}  ${ratio.toFixed(3).padStart(7)}  ${String(dtUA(s)).padStart(7)}  ${String(s.turnTicks).padStart(6)}  ${s.turns.join(',')}`);
});
function dtUA(s) { let t = 0; for (let i = 1; i < s.pts.length; i++) t += dtU(Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1])); return t; }
console.log(`合计 行程 ${tot.toFixed(2)}u  直线 ${totStraight.toFixed(2)}u  绕行比 ${(tot / totStraight).toFixed(3)}`);
