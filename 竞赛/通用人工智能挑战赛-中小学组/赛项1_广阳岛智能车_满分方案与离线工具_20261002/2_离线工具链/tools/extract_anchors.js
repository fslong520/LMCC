#!/usr/bin/env node
// 锚点提取器：把基线程序重放一遍，导出不可变约束与现状统计。
// 输出 anchors.json：
//   - interactions: 每次 grab/release 的精确位姿（位置+朝向+相对目标的 forward/lateral）
//   - events: 任务事件顺序（checkpoint / goal_reached / package_delivered / task_completed）
//   - stats: 指令数、转向数、总转角、总路程、用时、分数
// 用法: node tools/extract_anchors.js routes/baseline/T3_baseline_98.0.py [out.json]
'use strict';
const fs = require('fs');
const path = require('path');
const { runProgram } = require('./replay.js');

const DATA_DIR = process.env.GY_DATA_DIR || path.join(__dirname, '..', 'data');
const auth = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'auth_scene.json'), 'utf8'));
const srcPath = process.argv[2];
const outPath = process.argv[3] || path.join(__dirname, '..', 'anchors.json');
if (!srcPath) { console.error('用法: node tools/extract_anchors.js <route.py> [out.json]'); process.exit(2); }

const src = fs.readFileSync(srcPath, 'utf8');
const out = runProgram(src);
const R = out.result;

const pkgById = new Map(auth.packages.map(p => [p.id, p]));

// 交互锚点：重放 trace 只记了粗略坐标，这里用交互前最后一条指令后的精确位姿
const interactions = [];
let lastPose = { x: auth.sim.initialPose.x, z: auth.sim.initialPose.z, h: auth.sim.initialPose.heading };
let opIdx = 0;
const opsByLine = new Map(out.opTrace.map(o => [o.line, o]));
for (const t of out.trace) {
  // 找到该交互行之前最后一条驱动/转向指令的落点
  const before = out.opTrace.filter(o => o.line < t.line);
  if (before.length) { const p = before[before.length - 1]; lastPose = { x: p.x, z: p.z, h: p.h }; }
  const item = t.pkg ? pkgById.get(t.pkg) : null;
  let forward = null, lateral = null;
  if (item) {
    const fx = -Math.sin(lastPose.h), fz = -Math.cos(lastPose.h);
    const dx = item.x - lastPose.x, dz = item.z - lastPose.z;
    forward = +(dx * fx + dz * fz).toFixed(4);
    lateral = +(Math.abs(dx * fz - dz * fx)).toFixed(4);
  }
  interactions.push({
    op: t.op, accepted: t.accepted, reason: t.reason,
    packageId: t.pkg, role: t.role,
    pose: lastPose, forward, lateral,
    resultPosition: t.accepted && t.op === 'release' ? null : undefined
  });
}

// 统计
let turns = 0, turnDeg = 0, drives = 0, distCm = 0, backCm = 0;
for (const o of out.opTrace) {
  if (o.kind === 'turn') { turns++; turnDeg += o.deg; }
  else { drives++; if (o.dir > 0) distCm += o.cm; else backCm += o.cm; }
}

const report = {
  source: path.basename(srcPath),
  result: {
    score: R.score, task: R.taskScore, rules: R.ruleScore, auto: R.autonomousScore, eff: R.efficiencyScore,
    durationSeconds: R.durationSeconds, completed: `${R.completedTasks}/${R.totalTasks}`,
    taskFinished: R.taskFinished, eventDeduction: R.eventDeduction,
    offroadEpisodes: R.violationMetrics?.off_road?.episodes ?? null, endTick: out.endTick
  },
  stats: {
    ops: out.ops, turns, turnDeg: +turnDeg.toFixed(2), drives,
    forwardCm: +distCm.toFixed(2), backwardCm: +backCm.toFixed(2),
    grabs: out.trace.filter(t => t.op === 'grab').length,
    releases: out.trace.filter(t => t.op === 'release').length
  },
  interactions,
  events: out.events.map(e => ({ type: e.type, tick: e.tick, ...(e.index !== undefined ? { index: e.index } : {}), ...(e.checkpointId ? { checkpointId: e.checkpointId } : {}), ...(e.packageId ? { packageId: e.packageId } : {}) })),
  rejected: out.trace.filter(t => !t.accepted)
};

fs.writeFileSync(outPath, JSON.stringify(report, null, 1));
console.log(`锚点已写 ${outPath}`);
console.log(`分数 ${R.score} | ${R.completedTasks}/${R.totalTasks} | ${R.durationSeconds}s | 越界 ${report.result.offroadEpisodes}`);
console.log(`指令 ${out.ops}（转向 ${turns}，转角 ${turnDeg.toFixed(1)}°，前进 ${distCm.toFixed(1)}cm，倒车 ${backCm.toFixed(1)}cm）`);
console.log(`交互 ${interactions.length}：${interactions.map(i => `${i.op}${i.accepted ? '' : '!'}`).join(' ')}`);
console.log(`事件顺序: ${report.events.map(e => e.type + (e.index !== undefined ? `#${e.index}` : '')).join(' -> ')}`);
