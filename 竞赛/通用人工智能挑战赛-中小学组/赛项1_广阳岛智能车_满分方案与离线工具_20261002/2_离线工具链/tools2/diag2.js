#!/usr/bin/env node
// 诊断：对比生成器「以为走到的位置」与重放器「实际走到的位置」，找首次分歧。
'use strict';
const fs = require('fs');
const path = require('path');
const { parseProgram } = require('./replay2.js');

const src = fs.readFileSync(process.argv[2] || 'routes2/candidates/T2_v3.py', 'utf8');
const ops = parseProgram(src);
const scene = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data2', 'scene_task2.json'), 'utf8'));
const UPM = 8, NOM = 1.25, STEP = 0.02, MAXANG = 2.8;
const wrap = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

// 开环推算（与生成器同逻辑）
let h = scene.start.h, x = scene.start.x, z = scene.start.z;
console.log('line 指令                     推算位姿                      状态');
const drifts = [];
for (const op of ops) {
  if (op.kind === 'drive') {
    const L = op.cm / (100 / UPM);
    x += -Math.sin(h) * L * op.sign;
    z += -Math.cos(h) * L * op.sign;
    console.log(`${String(op.line).padStart(4)} forward(${op.cm})`.padEnd(30) + `(${x.toFixed(4)},${z.toFixed(4)})`.padEnd(30) + `h=${(h * 180 / Math.PI).toFixed(2)}°`);
  } else if (op.kind === 'turn') {
    h = wrap(h + op.dir * op.deg * Math.PI / 180);
    console.log(`${String(op.line).padStart(4)} ${op.dir > 0 ? 'left' : 'right'}(${op.deg})`.padEnd(30) + `(${x.toFixed(4)},${z.toFixed(4)})`.padEnd(30) + `h=${(h * 180 / Math.PI).toFixed(2)}°`);
  } else if (op.kind === 'grab' || op.kind === 'release') {
    console.log(`${String(op.line).padStart(4)} ${op.kind}`.padEnd(30) + `(${x.toFixed(4)},${z.toFixed(4)})`.padEnd(30) + `h=${(h * 180 / Math.PI).toFixed(2)}°`);
  }
}
console.log('\n=== 终止位姿 ===', `(${x.toFixed(4)},${z.toFixed(4)}) h=${(h * 180 / Math.PI).toFixed(2)}°`);
console.log('目标 goal', scene.goal);
