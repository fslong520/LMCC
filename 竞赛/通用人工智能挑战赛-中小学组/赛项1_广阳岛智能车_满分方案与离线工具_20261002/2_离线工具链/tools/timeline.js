#!/usr/bin/env node
// 时间线导出：把重放记录里的「指令 / 交互 / 任务事件」按 tick 合并成一条时间线，
// 用于确定任务顺序与各段耗时分布。输出 timeline.json。
// 用法: node tools/timeline.js <route.py> [out.json]
'use strict';
const fs = require('fs');
const path = require('path');
const { runProgram, driveDistancePlan, turnAngleDurationSeconds } = require('./replay.js');

const srcPath = process.argv[2];
const outPath = process.argv[3] || path.join(__dirname, '..', 'timeline.json');
if (!srcPath) { console.error('用法: node tools/timeline.js <route.py> [out.json]'); process.exit(2); }

const out = runProgram(fs.readFileSync(srcPath, 'utf8'));
const R = out.result;

const items = [];
for (const o of out.opTrace) {
  items.push({ tick: o.tick, type: o.kind, line: o.line, deg: o.deg, dir: o.dir, cm: o.cm, x: o.x, z: o.z, h: o.h });
}
for (const t of out.trace) {
  items.push({ tick: t.tick, type: `interact:${t.op}`, line: t.line, accepted: t.accepted, reason: t.reason, packageId: t.pkg, role: t.role, x: t.detailedX, z: t.detailedZ, h: t.h });
}
for (const e of out.events) {
  items.push({ tick: e.tick, type: `event:${e.type}`, index: e.index, checkpointId: e.checkpointId, packageId: e.packageId, x: e.pose?.x, z: e.pose?.z });
}
items.sort((a, b) => a.tick - b.tick || a.type.localeCompare(b.type));

// 段耗时：相邻「关键动作」（交互或事件）之间的 tick 差
const key = items.filter(i => i.type.startsWith('interact:') || i.type.startsWith('event:'));
const segments = [];
for (let i = 1; i < key.length; i++) {
  segments.push({
    from: `${key[i - 1].type}${key[i - 1].index !== undefined ? '#' + key[i - 1].index : ''}${key[i - 1].packageId ? '(' + key[i - 1].packageId + ')' : ''}`,
    to: `${key[i].type}${key[i].index !== undefined ? '#' + key[i].index : ''}${key[i].packageId ? '(' + key[i].packageId + ')' : ''}`,
    ticks: key[i].tick - key[i - 1].tick
  });
}

let driveTicks = 0, turnTicks = 0;
for (const o of out.opTrace) {
  if (o.kind === 'turn') turnTicks += turnAngleDurationSeconds(o.deg) * 1000 / 20;
  else if (o.kind === 'drive') driveTicks += driveDistancePlan(o.cm).durationMs / 20;
}
const interactTicks = out.trace.reduce((s, t) => s + (t.op === 'grab' ? 38 : 34), 0);

const report = {
  source: path.basename(srcPath),
  result: { score: R.score, durationSeconds: R.durationSeconds, completed: `${R.completedTasks}/${R.totalTasks}`, endTick: out.endTick },
  budget: { endTick: out.endTick, driveTicks, turnTicks, interactTicks, fullMarkLine: 9840, gap: out.endTick - 9840 },
  segments,
  timeline: items
};
fs.writeFileSync(outPath, JSON.stringify(report, null, 1));

console.log(`分数 ${R.score} | ${R.durationSeconds}s | endTick ${out.endTick} | 距满分线 ${out.endTick - 9840 > 0 ? '+' : ''}${out.endTick - 9840}`);
console.log(`tick 账: 行驶 ${driveTicks} + 转向 ${turnTicks} + 交互 ${interactTicks} = ${driveTicks + turnTicks + interactTicks}`);
console.log('\n关键动作时间线:');
for (const k of key) {
  const label = `${k.type}${k.index !== undefined ? '#' + k.index : ''}${k.packageId ? '(' + k.packageId + ')' : ''}${k.accepted === false ? ' [拒绝:' + k.reason + ']' : ''}`;
  console.log(`  t${String(k.tick).padStart(5)}  ${label}`);
}
console.log('\n段耗时（前 12 大）:');
for (const s of [...segments].sort((a, b) => b.ticks - a.ticks).slice(0, 12)) {
  console.log(`  ${String(s.ticks).padStart(5)}  ${s.from} -> ${s.to}`);
}
