// BFS 连续空间下界诊断：真实执行折线按交互切段 → 每段 BFS 最短 vs 实际行程
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'routes2/candidates/T2_ord24.py', 'utf8');
const scene = JSON.parse(fs.readFileSync('data2/scene_task2.json', 'utf8'));
const VEH_R = 0.44, CM = 12.5;
const SEGS = [];
for (const r of scene.roads) {
  const allow = r.width / 2 - VEH_R; if (allow <= 0) continue;
  for (let i = 0; i < r.points.length - 1; i++)
    SEGS.push({ ax: r.points[i][0], az: r.points[i][1], bx: r.points[i + 1][0], bz: r.points[i + 1][1], allow });
}
const sd = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
};
const marginAt = (x, z) => { let b = -9; for (const s of SEGS) { const m = s.allow - sd(x, z, s.ax, s.az, s.bx, s.bz); if (m > b) b = m; } return b; };

// 重建执行折线，按 grab/release 切段
let h = scene.start.h || 0, x = scene.start.x, z = scene.start.z;
let cur = [[x, z]]; const segments = [];
const push = () => { if (cur.length > 1) segments.push(cur); cur = [[x, z]]; };
for (const line of src.split('\n')) {
  let m;
  if ((m = line.match(/^robot\.(forward|backward)\(([\d.]+)\)$/))) {
    const s = m[1] === 'forward' ? 1 : -1, L = +m[2] / CM;
    x -= Math.sin(h) * L * s; z -= Math.cos(h) * L * s; cur.push([x, z]);
  } else if ((m = line.match(/^robot\.(left|right)_angle\(([\d.]+)\)$/))) {
    h += (m[1] === 'left' ? 1 : -1) * +m[2] * Math.PI / 180;
  } else if (/^robot\.(grab|release)\(\)$/.test(line)) { cur.push([x, z]); push(); }
}
push();
console.log('段数', segments.length);

// BFS 0.05 4邻
const G = 0.05;
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
for (const r of scene.roads) for (const p of r.points) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
minX -= 2; maxX += 2; minZ -= 2; maxZ += 2;
const NX = Math.ceil((maxX - minX) / G), NZ = Math.ceil((maxZ - minZ) / G);
const free = new Uint8Array(NX * NZ);
for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NZ; iz++) free[ix * NZ + iz] = marginAt(minX + (ix + 0.5) * G, minZ + (iz + 0.5) * G) >= 0 ? 1 : 0;
function bfs(ax, az, bx, bz) {
  const sxi = Math.round((ax - minX) / G - 0.5), szi = Math.round((az - minZ) / G - 0.5);
  const txi = Math.round((bx - minX) / G - 0.5), tzi = Math.round((bz - minZ) / G - 0.5);
  const dist = new Int32Array(NX * NZ).fill(-1);
  const qi = sxi * NZ + szi;
  if (qi < 0 || qi >= NX * NZ || !free[qi]) return null;
  const q = [qi]; dist[qi] = 0;
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    const cx = (c / NZ) | 0, cz = c % NZ;
    if (Math.abs(cx - txi) <= 1 && Math.abs(cz - tzi) <= 1) return dist[c] * G;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nx >= NX || nz < 0 || nz >= NZ) continue;
      const ni = nx * NZ + nz;
      if (!free[ni] || dist[ni] >= 0) continue;
      dist[ni] = dist[c] + 1; q.push(ni);
    }
  }
  return null;
}
let totG = 0, totB = 0, totEu = 0;
segments.forEach((sg, i) => {
  let act = 0; for (let k = 1; k < sg.length; k++) act += Math.hypot(sg[k][0] - sg[k - 1][0], sg[k][1] - sg[k - 1][1]);
  const a = sg[0], b = sg[sg.length - 1];
  const bfsD = bfs(a[0], a[1], b[0], b[1]);
  const eu = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const save = bfsD === null ? '-' : (act - bfsD).toFixed(2);
  console.log(`seg${i}  行程${act.toFixed(2).padStart(6)}  弦${eu.toFixed(2).padStart(6)}  BFS${bfsD === null ? 'UNREACH'.padStart(6) : bfsD.toFixed(2).padStart(6)}  图余量=${save}`);
  totG += act; totEu += eu; if (bfsD !== null) totB += bfsD;
});
console.log('合计 图', totG.toFixed(2), ' 弦和', totEu.toFixed(2), ' BFS下界', totB.toFixed(2), ' → 图余量', (totG - totB).toFixed(2), 'u =', Math.round((totG - totB) * 40), 'tick');
