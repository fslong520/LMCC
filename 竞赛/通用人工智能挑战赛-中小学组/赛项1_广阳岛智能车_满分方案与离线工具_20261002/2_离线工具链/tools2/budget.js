'use strict';
// 路线 tick 预算分解：drive / turn / interaction
const fs = require('fs');
const { dtU, tt, CM } = require('../tools/route_lib.js');

const lines = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n');
let drive = 0, turn = 0, inter = 0, dist = 0;
const turns = [];
const legs = [];   // 交互分段：每段 [label, drive, turn, dist]
let cur = { name: 'seg0', drive: 0, turn: 0, dist: 0 };
for (const l of lines) {
  let m;
  if ((m = l.match(/^robot\.(?:forward|backward)\(([-\d.]+)\)$/))) {
    const u = Math.abs(+m[1]) / CM; drive += dtU(u); dist += u; cur.drive += dtU(u); cur.dist += u;
  } else if ((m = l.match(/^robot\.(left_angle|right_angle)\(([-\d.]+)\)$/))) {
    const d = +m[2]; turn += tt(d); turns.push(d); cur.turn += tt(d);
  } else if (l === 'robot.grab()') { inter += 38; legs.push(cur); cur = { name: 'grab+' + legs.length, drive: 0, turn: 0, dist: 0 }; }
  else if (l === 'robot.release()') { inter += 34; legs.push(cur); cur = { name: 'rel+' + legs.length, drive: 0, turn: 0, dist: 0 }; }
}
legs.push(cur);
console.log(`指令 ${lines.length}（转向 ${turns.length}，直行 ${lines.filter(l => l.includes('forward') || l.includes('backward')).length}）`);
console.log(`drive ${drive} tick，距离 ${dist.toFixed(2)} u`);
console.log(`turn  ${turn} tick`);
console.log(`inter ${inter} tick`);
console.log(`合计  ${drive + turn + inter} tick = ${((drive + turn + inter) * 0.02).toFixed(2)}s`);
const floorTurns = turns.filter(d => d <= 41.7);
console.log(`地板价转向(<=41.7°) ${floorTurns.length} 次 = ${floorTurns.length * 13} tick`);
console.log(`超地板转向 ${turns.filter(d => d > 41.7).length} 次，共 ${turns.filter(d => d > 41.7).reduce((s, d) => s + tt(d), 0)} tick`);
console.log('逐段:');
for (const s of legs) console.log(`  ${s.name.padEnd(10)} drive ${String(s.drive).padStart(5)}  turn ${String(s.turn).padStart(4)}  dist ${s.dist.toFixed(2)}u`);
