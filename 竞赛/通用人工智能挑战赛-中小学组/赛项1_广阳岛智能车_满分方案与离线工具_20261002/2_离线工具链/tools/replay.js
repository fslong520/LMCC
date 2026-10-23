#!/usr/bin/env node
// 离线精确重放器 v3 —— 以真机权威场景为准
// 对齐点（全部经真机记录验证）：
//   drive: durationMs=ceil(worldDistance/(1.25*0.02))*20, speed=worldDistance/dur
//   turn_angle: durationMs=ceil(max(0.26, rad/2.8)/0.02)*20
//   采样: 每 5 tick（100ms）正则采样 + 每命令末/交互后强制采样
//   交互: grab=36 ticks 动画后提交(实测 t=14020 时 tick=701)
//   包裹动态: 抓走后移除该堆碰撞体；投放到新位置后按真实落点加回
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('./core.js');

// 场景数据独立于脚本存放，便于脚本与数据分离、避免误改
const DATA_DIR = process.env.GY_DATA_DIR || path.join(__dirname, '..', 'data');
const full = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'full_task3.json'), 'utf8'));
const auth = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'auth_scene.json'), 'utf8'));
const cfg = full.config;
const simDef = auth.sim;
const interDef = auth.inter;
const WORLD = auth.world;

const UPM = cfg.rules.unitsPerMeter || 8;
const MAX_SPEED = 2.5, NOMINAL = MAX_SPEED * 0.5, STEP_MS = 20;
const MAX_ANG = 2.8;
const SAMPLE_TICKS = 5;

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
      // 平台前端校验：转向角度必须在 1~360 度之间。
      // core.js 仿真内核只校验 >0 与 ≤360，不含此下限，故此处必须补上，
      // 否则离线重放会放过平台实际会拒绝的微角度转向。
      if (deg < 1 || deg > 360) {
        throw new Error(`line ${i + 1}: 转向角度必须在 1 到 360 度之间（当前 ${deg}）`);
      }
      ops.push({ kind: 'turn', dir: m[1] === 'left_angle' ? 1 : -1, deg, line: i + 1 });
    }
    else if (/^robot\.grab\(\)$/.test(line)) ops.push({ kind: 'grab', line: i + 1 });
    else if (/^robot\.release\(\)$/.test(line)) ops.push({ kind: 'release', line: i + 1 });
    else throw new Error(`line ${i + 1}: unsupported: ${line}`);
  });
  return ops;
}

function runProgram(src, opts = {}) {
  const ops = parseProgram(src);
  const sim = new core.DeterministicSimulator(simDef);

  // 动态世界：障碍物固定 + 未抓起包裹堆各一个圆
  const obstacleColliders = (WORLD.colliders || []).filter(c => String(c.id).startsWith('object:'));
  const stackPos = new Map();  // 堆 key -> {x,z}
  for (const p of auth.packages) {
    stackPos.set(`${p.x.toFixed(3)},${p.z.toFixed(3)}`, { x: p.x, z: p.z });
  }
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
    runDefinition: {
      simulationDefinition: simDef, interactionDefinition: interDef,
      ruleDefinition: cfg.rules, scoringDefinition: cfg.scoring
    },
    simulationDefinition: simDef, interactionDefinition: interDef
  };
  const session = core.createSession(cfg, metadata, { now: () => 0 });

  let sinceSample = 0, simMs = 0;
  const trace = [];
  const opTrace = []; // 每条指令执行后的完整位姿，用于锚点提取与转向统计
  const events = [];  // 任务事件（checkpoint / goal_reached / package_delivered），用于顺序断言
  const heldKeyRef = { key: null };

  function sample(force = false) {
    const p = sim.pose;
    const r = session.sample({
      x: p.x, z: p.z, heading: p.heading, speed: 0, steering: 0, tick: sim.tick
    }, { forceRecord: force });
    if (r && Array.isArray(r.taskEvents)) {
      for (const ev of r.taskEvents) events.push({ ...ev, tick: sim.tick, pose: { x: +p.x.toFixed(4), z: +p.z.toFixed(4), h: +p.heading.toFixed(6) } });
    }
    sinceSample = 0;
    return r;
  }
  function advanceTo(targetTick) {
    while (sim.tick < targetTick && session.status === 'running') {
      sim.step();
      simMs += STEP_MS;
      sinceSample++;
      if (sinceSample >= SAMPLE_TICKS) sample(false);
    }
  }

  for (const op of ops) {
    if (session.status !== 'running') break;
    if (op.kind === 'drive' || op.kind === 'turn') {
      const cmd = op.kind === 'drive'
        ? (() => { const pl = driveDistancePlan(op.cm); return { kind: 'drive', direction: op.sign, durationMs: pl.durationMs, speed: pl.speed }; })()
        : { kind: 'turn_angle', direction: op.dir, angleDegrees: op.deg, durationMs: turnAngleDurationSeconds(op.deg) * 1000 };
      sim.startCommand(cmd);
      while (sim.hasActiveCommand()) {
        sim.step();
        simMs += STEP_MS;
        sinceSample++;
        if (sinceSample >= SAMPLE_TICKS) sample(false);
      }
      sim.startCommand({ kind: 'wait', durationMs: 0 }); // no-op
      sample(true);
      opTrace.push({
        kind: op.kind, line: op.line, deg: op.kind === 'turn' ? op.deg : 0,
        dir: op.kind === 'turn' ? op.dir : op.sign,
        cm: op.kind === 'drive' ? op.cm : 0,
        x: +sim.pose.x.toFixed(4), z: +sim.pose.z.toFixed(4),
        h: +sim.pose.heading.toFixed(6), tick: sim.tick
      });
    } else {
      // 真机 tick 序列（对齐真机记录）：
      //   grab:    提交前 animateGripper 480ms(24 ticks)，提交后抬臂 280ms(14 ticks)
      //   release: 提交前 animateArmTo   260ms(13 ticks)
      const preMs = op.kind === 'grab' ? 480 : 260;
      const postMs = op.kind === 'grab' ? 280 : 420;
      sim.startCommand({ kind: 'wait', durationMs: preMs });
      while (sim.hasActiveCommand()) {
        sim.step();
        simMs += STEP_MS;
        sinceSample++;
        if (sinceSample >= SAMPLE_TICKS) sample(false);
      }
      sample(true);
      const res = session.addInteractionInput(op.kind === 'grab' ? 'package_grab' : 'package_release', { source: 'python' });
      // 同步世界：抓走 -> 移除该堆；放下 -> 新堆加入
      // 注意：直接按坐标数值匹配（toFixed 会造成 key 不一致）
      if (res && res.accepted) {
        const rp = res.position || [0, 0];
        if (op.kind === 'grab') {
          let found = null, bestD = 1e9;
          for (const [k, p] of stackPos) {
            const dd = Math.hypot(p.x - rp[0], p.z - rp[1]);
            if (dd < bestD) { bestD = dd; found = k; }
          }
          heldKeyRef.key = (bestD < 0.35) ? found : null;
          syncWorld(heldKeyRef.key);
        } else {
          if (heldKeyRef.key) stackPos.delete(heldKeyRef.key);
          const key = `${rp[0].toFixed(3)},${rp[1].toFixed(3)}`;
          stackPos.set(key, { x: rp[0], z: rp[1] });
          heldKeyRef.key = null;
          syncWorld(null);
        }
      }
      trace.push({
        op: op.kind, line: op.line, accepted: res && res.accepted, reason: res && res.reason,
        pkg: res && res.packageId, role: res && res.objectRole,
        tick: sim.tick, t: +(simMs / 1000).toFixed(2),
        x: +sim.pose.x.toFixed(3), z: +sim.pose.z.toFixed(3),
        h: +sim.pose.heading.toFixed(6),
        detailedX: +sim.pose.x.toFixed(4), detailedZ: +sim.pose.z.toFixed(4)
      });
      if (postMs > 0) {
        sim.startCommand({ kind: 'wait', durationMs: postMs });
        while (sim.hasActiveCommand()) {
          sim.step();
          simMs += STEP_MS;
          sinceSample++;
          if (sinceSample >= SAMPLE_TICKS) sample(false);
        }
        sample(true);
      }
      simMs += 500; // 末尾 sleep(500)：不推进仿真 tick，但占实时
    }
  }

  const final = session.finish('completed');
  return { result: final.result, ops: ops.length, simMs, endTick: sim.tick, trace, opTrace, events, trajectory: sim.trajectory() };
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
}
