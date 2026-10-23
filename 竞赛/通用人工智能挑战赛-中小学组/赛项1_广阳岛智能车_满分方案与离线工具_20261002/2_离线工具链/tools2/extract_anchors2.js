#!/usr/bin/env node
// 任务二锚点提取（与任务三工具同构，只是数据源与字段不同）
'use strict';
const fs = require('fs');
const path = require('path');
const { runProgram } = require('./replay2.js');
const DATA_DIR = process.env.GY_DATA_DIR
  ? (path.isAbsolute(process.env.GY_DATA_DIR) ? process.env.GY_DATA_DIR : path.join(__dirname, '..', process.env.GY_DATA_DIR))
  : path.join(__dirname, '..', 'data2');
const FULL = process.env.GY_FULL || 'full_task2.json';
const full = JSON.parse(fs.readFileSync(path.join(DATA_DIR, FULL), 'utf8'));
const AUTH = process.env.GY_AUTH || 'auth_scene.json';
const authPath = path.join(DATA_DIR, AUTH);
const auth = fs.existsSync(authPath) ? JSON.parse(fs.readFileSync(authPath, 'utf8')) : null;
const interDef = full.inter || auth?.inter;

const srcPath = process.argv[2];
const outPath = process.argv[3] || path.join(__dirname, '..', 'anchors2.json');
const src = fs.readFileSync(srcPath, 'utf8');
const out = runProgram(src);
const R = out.result;
const pkgById = new Map((interDef.packages || []).map(p => [p.id, p]));

const interactions = [];
let lastPose = { x: full.sim.initialPose.x, z: full.sim.initialPose.z, h: full.sim.initialPose.heading };
for (const t of out.trace) {
  const before = out.trajectory.filter(f => f.tick <= t.tick);
  if (before.length) { const p = before[before.length - 1]; lastPose = { x: p.x, z: p.z, h: p.heading }; }
  const item = t.pkg ? pkgById.get(t.pkg) : null;
  let forward = null, lateral = null;
  if (item) {
    const fx = -Math.sin(lastPose.h), fz = -Math.cos(lastPose.h);
    const dx = item.x - lastPose.x, dz = item.z - lastPose.z;
    forward = +(dx * fx + dz * fz).toFixed(4);
    lateral = +(Math.abs(dx * fz - dz * fx)).toFixed(4);
  }
  interactions.push({ op: t.op, accepted: t.accepted, reason: t.reason, packageId: t.pkg, role: t.role,
    tick: t.tick, pose: lastPose, forward, lateral });
}
let turns = 0, turnDeg = 0, drives = 0, distCm = 0, backCm = 0;
for (const l of src.split('\n')) {
  const s = l.trim();
  let m;
  if ((m = s.match(/^robot\.(left_angle|right_angle)\(([\d.]+)\)$/))) { turns++; turnDeg += +m[2]; }
  else if ((m = s.match(/^robot\.(forward|backward)\(([\d.]+)\)$/))) { drives++; if (m[1] === 'forward') distCm += +m[2]; else backCm += +m[2]; }
}
const report = {
  source: path.basename(srcPath),
  result: { score: R.score, task: R.taskScore, rules: R.ruleScore, auto: R.autonomousScore, eff: R.efficiencyScore,
    durationSeconds: R.durationSeconds, completed: `${R.completedTasks}/${R.totalTasks}`, taskFinished: R.taskFinished,
    eventDeduction: R.eventDeduction, offroadEpisodes: R.violationMetrics?.off_road?.episodes ?? null, endTick: out.endTick },
  stats: { ops: out.ops, turns, turnDeg: +turnDeg.toFixed(2), drives, forwardCm: +distCm.toFixed(2), backwardCm: +backCm.toFixed(2),
    grabs: out.trace.filter(t => t.op === 'grab').length, releases: out.trace.filter(t => t.op === 'release').length },
  interactions,
  events: out.events.map(e => ({ type: e.type, tick: e.tick, index: e.index, checkpointId: e.checkpointId, packageId: e.packageId })),
  rejected: out.trace.filter(t => !t.accepted)
};
fs.writeFileSync(outPath, JSON.stringify(report, null, 1));
console.log(`锚点已写 ${outPath}`);
console.log(`分数 ${R.score} | ${R.completedTasks}/${R.totalTasks} | ${R.durationSeconds}s | 越界 ${report.result.offroadEpisodes}`);
console.log(`指令 ${out.ops}（转向 ${turns}，${turnDeg.toFixed(1)}°，前进 ${distCm.toFixed(1)}cm，倒车 ${backCm.toFixed(1)}cm）`);
console.log(`事件: ${report.events.map(e => e.type + (e.index !== undefined ? '#' + e.index : '')).join(' -> ')}`);
