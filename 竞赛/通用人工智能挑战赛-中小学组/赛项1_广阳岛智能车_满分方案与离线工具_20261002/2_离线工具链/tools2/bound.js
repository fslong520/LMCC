'use strict';
// 把检查点也作为强制途经点切段：算每段「直线强制下界 vs 实际行程」，
// 区分「被检查点/交互位姿强制的绕行」与「走廊里可省的绕行」。
const fs = require('fs'), path = require('path');
const { dtU, tt, CM } = require('../tools/route_lib.js');

const scene = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data2/scene_task2.json'), 'utf8'));
const cps = scene.checkpoints.map(c => c.position);
const lines = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n');
let x = scene.start.x, z = scene.start.z, h = scene.start.h;

const wp = [{ name: 'start', x, z, at: null }];
let cpSeen = 0;
let cur = { name: 'seg0', from: [x, z], dist: 0, turnTicks: 0, turns: [], pts: [[x, z]] };
const legs = [];
let lastInt = '';
for (const l of lines) {
  let m;
  if ((m = l.match(/^robot\.forward\(([-\d.]+)\)$/))) {
    const L = Math.abs(+m[1]) / CM;
    x -= Math.sin(h) * L; z -= Math.cos(h) * L;
    cur.dist += L; cur.pts.push([x, z]);
    while (cpSeen < cps.length && Math.hypot(x - cps[cpSeen][0], z - cps[cpSeen][1]) <= 1.05) {
      legs.push({ ...cur, op: `cp#${cpSeen}` });
      wp.push({ name: `cp#${cpSeen}`, x, z });
      cpSeen++;
      cur = { name: `cp#${cpSeen}`, from: [x, z], dist: 0, turnTicks: 0, turns: [], pts: [[x, z]] };
    }
  } else if ((m = l.match(/^robot\.(left_angle|right_angle)\(([-\d.]+)\)$/))) {
    const d = +m[2];
    h += (m[1] === 'left_angle' ? 1 : -1) * d * Math.PI / 180;
    cur.turnTicks += tt(d); cur.turns.push(+d.toFixed(1));
  } else if (l === 'robot.grab()' || l === 'robot.release()') {
    lastInt = l === 'robot.grab()' ? `grab` : `drop`;
    legs.push({ ...cur, op: lastInt });
    wp.push({ name: lastInt, x, z });
    cur = { name: lastInt, from: [x, z], dist: 0, turnTicks: 0, turns: [], pts: [[x, z]] };
  }
}
legs.push({ ...cur, op: 'goal' });
wp.push({ name: 'goal', x, z });

let totStraight = 0, totDist = 0, totTurn = 0;
console.log('段                     直线u    行程u   绕行比  转向tick  转角');
legs.forEach((s, i) => {
  const a = s.from, b = s.pts[s.pts.length - 1];
  const st = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const r = st > 1e-9 ? s.dist / st : 1;
  totStraight += st; totDist += s.dist; totTurn += s.turnTicks;
  console.log(`${String(i).padStart(2)} ${s.op.padEnd(8)} ${st.toFixed(2).padStart(7)} ${s.dist.toFixed(2).padStart(8)} ${r.toFixed(3).padStart(7)} ${String(s.turnTicks).padStart(7)}  ${s.turns.join(',')}`);
});
console.log(`\n合计 直线(强制下界) ${totStraight.toFixed(2)}u  实际 ${totDist.toFixed(2)}u  绕行比 ${(totDist / totStraight).toFixed(3)}  转向 ${totTurn}tick`);
console.log(`强制下界驱动 tick = ${Math.ceil(totStraight / 0.025)}，满分线需总 tick ≤ 6240`);
