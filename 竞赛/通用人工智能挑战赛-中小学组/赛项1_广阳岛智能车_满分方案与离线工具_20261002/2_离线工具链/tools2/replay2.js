#!/usr/bin/env node
// 任务二 / 任务三 通用离线重放器。
// 与 tools/replay.js 的差别：数据与内核从指定目录读，便于同一套内核跑不同任务。
//   环境变量 GY_DATA_DIR 指向含 full_taskN.json / auth_scene.json 的目录
//   环境变量 GY_FULL / GY_AUTH 可显式指定文件名
// 用法: GY_DATA_DIR=data2 GY_FULL=full_task2.json node tools2/replay2.js <route.py>
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('../tools/core.js');

const DATA_DIR = process.env.GY_DATA_DIR
  ? (path.isAbsolute(process.env.GY_DATA_DIR) ? process.env.GY_DATA_DIR : path.join(__dirname, '..', process.env.GY_DATA_DIR))
  : path.join(__dirname, '..', 'data');
const FULL = process.env.GY_FULL || 'full_task3.json';
const AUTH = process.env.GY_AUTH || 'auth_scene.json';

const full = JSON.parse(fs.readFileSync(path.join(DATA_DIR, FULL), 'utf8'));
const auth = JSON.parse(fs.readFileSync(path.join(DATA_DIR, AUTH), 'utf8'));
const cfg = full.config;
const simDef = full.sim || auth.sim;
const interDef = full.inter || auth.inter;
const WORLD = full.world || auth.world;

const UPM = cfg.rules.unitsPerMeter || 8;
const MAX_SPEED = 2.5, NOMINAL = 1.25, STEP_MS = 20, MAX_ANG = 2.8, SAMPLE_TICKS = 5;

function driveDistancePlan(cm) {
  const wd = Number(cm) * UPM / 100;
  const ticks = Math.max(1, Math.ceil(wd / (NOMINAL * STEP_MS / 1000)));
  return { durationMs: ticks * STEP_MS, speed: wd / (ticks * STEP_MS / 1000) };
}
function turnAngleDurationSeconds(deg) {
  return Math.ceil(Math.max(0.26, (Number(deg) * Math.PI / 180) / MAX_ANG) / 0.02) * 0.02;
}

function parseProgram(src) {
  const ops = [];
  src.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    let m;
    if ((m = line.match(/^robot\.(forward|backward)\(([-\d.]+)\)$/)))
      ops.push({ kind: 'drive', sign: m[1] === 'forward' ? 1 : -1, cm: Math.abs(+m[2]), line: i + 1 });
    else if ((m = line.match(/^robot\.(left_angle|right_angle)\(([-\d.]+)\)$/))) {
      const deg = +m[2];
      if (deg < 1 || deg > 360) throw new Error(`line ${i + 1}: 转向角度必须在 1 到 360 度之间（当前 ${deg}）`);
      ops.push({ kind: 'turn', dir: m[1] === 'left_angle' ? 1 : -1, deg, line: i + 1 });
    }
    else if (/^robot\.grab\(\)$/.test(line)) ops.push({ kind: 'grab', line: i + 1 });
    else if (/^robot\.release\(\)$/.test(line)) ops.push({ kind: 'release', line: i + 1 });
    else throw new Error(`line ${i + 1}: unsupported: ${line}`);
  });
  return ops;
}

function runProgram(src) {
  const ops = parseProgram(src);
  const sim = new core.DeterministicSimulator(simDef);
  const obstacleColliders = (WORLD.colliders || []).filter(c => String(c.id).startsWith('object:'));
  const stackPos = new Map();
  for (const p of (full.packages || auth.packages)) stackPos.set(`${p.x.toFixed(3)},${p.z.toFixed(3)}`, { x: p.x, z: p.z });
  function syncWorld(heldKey) {
    const colliders = obstacleColliders.slice();
    for (const [key, pos] of stackPos) {
      if (key === heldKey) continue;
      colliders.push({ id: `package-stack:${key}`, type: 'circle', x: pos.x, z: pos.z, radius: 0.28 });
    }
    sim.setWorld({ ...WORLD, colliders });
  }
  syncWorld(null);

  const metadata = {
    teamId: 'tea_offline', sourceCode: src,
    runDefinition: { simulationDefinition: simDef, interactionDefinition: interDef, ruleDefinition: cfg.rules, scoringDefinition: cfg.scoring },
    simulationDefinition: simDef, interactionDefinition: interDef
  };
  const session = core.createSession(cfg, metadata, { now: () => 0 });
  let sinceSample = 0, simMs = 0;
  const trace = [], events = [];
  const heldKeyRef = { key: null };
  function sample(force = false) {
    const p = sim.pose;
    const r = session.sample({ x: p.x, z: p.z, heading: p.heading, speed: 0, steering: 0, tick: sim.tick }, { forceRecord: force });
    if (r && Array.isArray(r.taskEvents)) for (const ev of r.taskEvents) events.push({ ...ev, tick: sim.tick, pose: { x: +p.x.toFixed(4), z: +p.z.toFixed(4) } });
    sinceSample = 0;
    return r;
  }
  for (const op of ops) {
    if (session.status !== 'running') break;
    if (op.kind === 'drive' || op.kind === 'turn') {
      const cmd = op.kind === 'drive'
        ? (() => { const pl = driveDistancePlan(op.cm); return { kind: 'drive', direction: op.sign, durationMs: pl.durationMs, speed: pl.speed }; })()
        : { kind: 'turn_angle', direction: op.dir, angleDegrees: op.deg, durationMs: turnAngleDurationSeconds(op.deg) * 1000 };
      sim.startCommand(cmd);
      while (sim.hasActiveCommand()) { sim.step(); simMs += STEP_MS; sinceSample++; if (sinceSample >= SAMPLE_TICKS) sample(false); }
      sample(true);
    } else {
      const preMs = op.kind === 'grab' ? 480 : 260;
      const postMs = op.kind === 'grab' ? 280 : 420;
      sim.startCommand({ kind: 'wait', durationMs: preMs });
      while (sim.hasActiveCommand()) { sim.step(); simMs += STEP_MS; sinceSample++; if (sinceSample >= SAMPLE_TICKS) sample(false); }
      sample(true);
      const res = session.addInteractionInput(op.kind === 'grab' ? 'package_grab' : 'package_release', { source: 'python' });
      if (res && res.accepted) {
        const rp = res.position || [0, 0];
        if (op.kind === 'grab') {
          let found = null, bestD = 1e9;
          for (const [k, p] of stackPos) { const d = Math.hypot(p.x - rp[0], p.z - rp[1]); if (d < bestD) { bestD = d; found = k; } }
          heldKeyRef.key = (bestD < 0.35) ? found : null;
          syncWorld(heldKeyRef.key);
        } else {
          if (heldKeyRef.key) stackPos.delete(heldKeyRef.key);
          stackPos.set(`${rp[0].toFixed(3)},${rp[1].toFixed(3)}`, { x: rp[0], z: rp[1] });
          heldKeyRef.key = null;
          syncWorld(null);
        }
      }
      trace.push({ op: op.kind, line: op.line, accepted: res && res.accepted, reason: res && res.reason,
        pkg: res && res.packageId, role: res && res.objectRole, tick: sim.tick, t: +(simMs / 1000).toFixed(2),
        x: +sim.pose.x.toFixed(4), z: +sim.pose.z.toFixed(4), h: +sim.pose.heading.toFixed(6) });
      if (postMs > 0) {
        sim.startCommand({ kind: 'wait', durationMs: postMs });
        while (sim.hasActiveCommand()) { sim.step(); simMs += STEP_MS; sinceSample++; if (sinceSample >= SAMPLE_TICKS) sample(false); }
        sample(true);
      }
      simMs += 500;
    }
  }
  const final = session.finish('completed');
  return { result: final.result, ops: ops.length, simMs, endTick: sim.tick, trace, events, trajectory: sim.trajectory() };
}

module.exports = { runProgram, parseProgram, driveDistancePlan, turnAngleDurationSeconds };

if (require.main === module) {
  const src = fs.readFileSync(process.argv[2], 'utf8');
  const out = runProgram(src);
  const r = out.result;
  console.log(JSON.stringify({
    score: r.score, task: r.taskScore, rules: r.ruleScore, auto: r.autonomousScore, eff: r.efficiencyScore,
    durationSeconds: r.durationSeconds, completed: `${r.completedTasks}/${r.totalTasks}`, taskFinished: r.taskFinished,
    eventDeduction: r.eventDeduction, offroadEpisodes: r.violationMetrics?.off_road?.episodes,
    endTick: out.endTick, ops: out.ops
  }, null, 1));
  const bad = out.trace.filter(t => !t.accepted);
  if (bad.length) { console.log('被拒交互:'); bad.forEach(t => console.log('  ', JSON.stringify(t))); }
  const evs = out.events.map(e => e.type + (e.index !== undefined ? '#' + e.index : ''));
  if (evs.length) console.log('事件:', evs.join(' -> '));
}
