#!/usr/bin/env node
// 重放一个路线并打印完整指标：分数、用时、越界、交互接受情况、事件顺序。
// 用法: node tools/check_route.js <route.py> [--json]
'use strict';
const fs = require('fs');
const path = require('path');
const { runProgram } = require('./replay.js');

const route = process.argv[2];
if (!route) { console.error('用法: node tools/check_route.js <route.py> [--json]'); process.exit(2); }

const out = runProgram(fs.readFileSync(route, 'utf8'));
const R = out.result;

const stats = (() => {
  let turns = 0, turnDeg = 0, drives = 0, fwdCm = 0, backCm = 0;
  for (const o of out.opTrace) {
    if (o.kind === 'turn') { turns++; turnDeg += o.deg; }
    else { drives++; if (o.dir > 0) fwdCm += o.cm; else backCm += o.cm; }
  }
  return { turns, turnDeg: +turnDeg.toFixed(1), drives, fwdCm: +fwdCm.toFixed(1), backCm: +backCm.toFixed(1) };
})();

const rejected = out.trace.filter(t => !t.accepted);
const cpOrder = out.events.filter(e => e.type === 'checkpoint').map(e => e.index);

const report = {
  file: path.basename(route),
  score: R.score,
  breakdown: { task: R.taskScore, rules: R.ruleScore, autonomous: R.autonomousScore, efficiency: R.efficiencyScore },
  durationSeconds: R.durationSeconds,
  completed: `${R.completedTasks}/${R.totalTasks}`,
  taskFinished: R.taskFinished,
  offroadEpisodes: R.violationMetrics?.off_road?.episodes ?? null,
  eventDeduction: R.eventDeduction,
  endTick: out.endTick,
  ops: out.ops,
  stats,
  rejectedCount: rejected.length,
  checkpointOrder: cpOrder
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 1));
} else {
  console.log(`文件          ${report.file}`);
  console.log(`分数          ${report.score}  (task ${R.taskScore} + rules ${R.ruleScore} + auto ${R.autonomousScore} + eff ${R.efficiencyScore})`);
  console.log(`完成任务      ${report.completed}  finished=${report.taskFinished}`);
  console.log(`用时          ${report.durationSeconds} s  (endTick ${out.endTick})`);
  console.log(`越界          ${report.offroadEpisodes} 次`);
  console.log(`事件扣分      ${report.eventDeduction}`);
  console.log(`指令          ${out.ops}（转向 ${stats.turns}，${stats.turnDeg}°，直行 ${stats.fwdCm}cm，倒车 ${stats.backCm}cm）`);
  console.log(`检查点顺序    ${cpOrder.join(',')}${cpOrder.join(',') === '0,1,2,3,4,5,6,7' ? '  ✓' : '  ✗ 异常'}`);
  console.log(`被拒交互      ${report.rejectedCount} 次`);
  if (rejected.length) for (const t of rejected) console.log(`   ✗ ${t.op} line=${t.line} ${t.reason} pkg=${t.pkg}`);
}

// 退出码：满分且无异常才为 0
const ok = R.score === 100 && R.completedTasks === R.totalTasks && rejected.length === 0
  && (R.violationMetrics?.off_road?.episodes ?? 0) === 0;
process.exit(ok ? 0 : 1);
