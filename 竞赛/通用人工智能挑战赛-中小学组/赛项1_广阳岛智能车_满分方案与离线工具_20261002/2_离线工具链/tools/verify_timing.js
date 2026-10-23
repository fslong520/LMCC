#!/usr/bin/env node
// 决定性验证：真机 control 序列的相邻 tick 差 Δ，与模型每步耗时逐条比对。
// 模型步 = 每条 drive/turn 的耗时 + 每次交互的前置/后置动画耗时。
// 若吻合，则「转向按 2.8 rad/s 计时、无附加降速」成立；若转向步系统性偏大，则须加降速项。
// 用法: node tools/verify_timing.js <route.py> <real_inputs.json>
'use strict';
const fs = require('fs');
const { parseProgram, driveDistancePlan, turnAngleDurationSeconds } = require('./replay.js');

const route = process.argv[2], realPath = process.argv[3];
const ops = parseProgram(fs.readFileSync(route, 'utf8'));
const realAll = JSON.parse(fs.readFileSync(realPath, 'utf8')).map(r => ({ kind: r[0], tick: r[2] }));

// 真机 control 序列
const ctrl = realAll.filter(r => r.kind === 'control').map(r => r.tick);

// 模型步序列
const steps = [];
for (const op of ops) {
  if (op.kind === 'drive') steps.push({ kind: 'drive', label: `forward(${op.cm})`, ticks: driveDistancePlan(op.cm).durationMs / 20 });
  else if (op.kind === 'turn') steps.push({ kind: 'turn', label: `${op.dir > 0 ? 'left' : 'right'}(${op.deg})`, ticks: turnAngleDurationSeconds(op.deg) * 1000 / 20 });
  else {
    steps.push({ kind: 'grab:pre', label: 'grab 前置动画', ticks: 24 });
    steps.push({ kind: 'grab:post', label: 'grab 后置动画', ticks: 14 });
  }
}

console.log(`真机 control 条目 ${ctrl.length}，模型步数 ${steps.length}`);

// Δ 序列：ctrl[i] - ctrl[i-1]，i>=1；对应 steps[i-1]
const rows = [];
let exact = 0, off = 0, sumTurn = 0, nTurn = 0, sumDrive = 0, nDrive = 0, sumAnim = 0, nAnim = 0;
const n = Math.min(ctrl.length - 1, steps.length);
for (let i = 0; i < n; i++) {
  const d = ctrl[i + 1] - ctrl[i];
  const s = steps[i];
  const err = d - s.ticks;
  if (err === 0) exact++; else off++;
  if (s.kind === 'turn') { sumTurn += err; nTurn++; }
  else if (s.kind === 'drive') { sumDrive += err; nDrive++; }
  else { sumAnim += err; nAnim++; }
  rows.push({ i, kind: s.kind, label: s.label, real: d, model: s.ticks, err });
}

console.log('\n=== 逐条比对（前 24 条）===');
for (const r of rows.slice(0, 24)) {
  console.log(`  #${String(r.i).padStart(3)} ${r.kind.padEnd(10)} ${r.label.padEnd(20)} 真机Δ ${String(r.real).padStart(4)}  模型 ${String(r.model).padStart(4)}  ${r.err === 0 ? '一致' : '偏差 ' + (r.err > 0 ? '+' : '') + r.err}`);
}

console.log('\n=== 汇总 ===');
console.log(`比对 ${n} 条：完全一致 ${exact} 条（${(exact / n * 100).toFixed(1)}%），不一致 ${off} 条`);
console.log(`转向步 ${nTurn} 条，累计偏差 ${sumTurn} tick，平均 ${nTurn ? (sumTurn / nTurn).toFixed(3) : '-'} tick/步`);
console.log(`行驶步 ${nDrive} 条，累计偏差 ${sumDrive} tick，平均 ${nDrive ? (sumDrive / nDrive).toFixed(3) : '-'} tick/步`);
console.log(`动画步 ${nAnim} 条，累计偏差 ${sumAnim} tick`);

const totModel = steps.reduce((s, x) => s + x.ticks, 0);
console.log(`\n模型总耗时 ${totModel} tick = ${(totModel * 0.02).toFixed(2)}s`);
console.log(`真机末条 tick ${ctrl[ctrl.length - 1]}（= ${(ctrl[ctrl.length - 1] * 0.02).toFixed(2)}s）`);

console.log('\n=== 判定 ===');
if (off === 0) console.log('逐条完全一致：转向按 2.8 rad/s 计时，无附加降速耗时。');
else if (nTurn && sumTurn / nTurn > 1.5) console.log('转向步系统性偏大 → 存在转向附加降速，须修模型。');
else if (nDrive && sumDrive / nDrive > 1.5) console.log('行驶步系统性偏大 → 存在行驶附加耗时，须修模型。');
else console.log('零散偏差，无系统性附加耗时。');
