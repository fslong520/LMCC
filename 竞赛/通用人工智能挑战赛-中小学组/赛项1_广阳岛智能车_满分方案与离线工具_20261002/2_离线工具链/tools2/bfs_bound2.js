// 严格下界：8邻 Dijkstra，按序穿过中间检查点圆（半径1.05），忽略包裹（乐观界）
// 用法: node tools2/bfs_bound2.js <py文件>
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
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

// v5 序列的各交互段中间 cp（与 seq2d_v5 对应）
const cps = scene.checkpoints.map(c => c.position);
const CP_R = scene.checkpointRadius;
const segCps = [[0], [1], [], [], [2], [3, 4], [], [], [5]];

// 8邻 Dijkstra 网格
const G = 0.05;
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
for (const r of scene.roads) for (const p of r.points) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]); }
minX -= 2; maxX += 2; minZ -= 2; maxZ += 2;
const NX = Math.ceil((maxX - minX) / G), NZ = Math.ceil((maxZ - minZ) / G);
const free = new Uint8Array(NX * NZ);
for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NZ; iz++) free[ix * NZ + iz] = marginAt(minX + (ix + 0.5) * G, minZ + (iz + 0.5) * G) >= 0 ? 1 : 0;
const toCell = (x, z) => [Math.round((x - minX) / G - 0.5), Math.round((z - minZ) / G - 0.5)];

// 二叉堆 Dijkstra：返回 {d, cell} —— 必须带到达格，cp 换段从**实际触圆点**续跑（从圆心重启会虚增 ≤1.05u/个）
function dij(srcPts, isTarget) {
  // 必须 Float64：Float32 存回会截断 F64 入堆值，首次 pop 即被误判 stale → 该格永不再扩展，
  // 前沿塌缩成小盒（实测 13×13 即死）。stale 判定加 1e-9 容差。
  const dist = new Float64Array(NX * NZ).fill(Infinity);
  const heap = [];
  const pushH = (d, i) => { heap.push([d, i]); let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const popH = () => { const t = heap[0], l = heap.pop();
    if (heap.length) { heap[0] = l; let c = 0;
      for (;;) { const a = 2 * c + 1, b = a + 1; let m = c;
        if (a < heap.length && heap[a][0] < heap[m][0]) m = a;
        if (b < heap.length && heap[b][0] < heap[m][0]) m = b;
        if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } }
    return t; };
  for (const [sx, sz] of srcPts) {
    const i = sx * NZ + sz;
    if (i < 0 || i >= NX * NZ || !free[i]) continue;
    if (dist[i] > 0) { dist[i] = 0; pushH(0, i); }
  }
  const D1 = G, D2 = G * Math.SQRT2;
  while (heap.length) {
    const [d, i] = popH();
    if (d > dist[i]) continue;
    const cx = (i / NZ) | 0, cz = i % NZ;
    if (isTarget(cx, cz, d)) return { d, cell: [cx, cz] };
    for (const [dx, dz, w] of [[1, 0, D1], [-1, 0, D1], [0, 1, D1], [0, -1, D1], [1, 1, D2], [1, -1, D2], [-1, 1, D2], [-1, -1, D2]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nx >= NX || nz < 0 || nz >= NZ) continue;
      const ni = nx * NZ + nz;
      if (!free[ni]) continue;
      // 对角移动要求两正交格均自由（防切角穿墙）
      if (dx && dz) { if (!free[cx * NZ + nz] || !free[nx * NZ + cz]) continue; }
      const nd = d + w;
      if (nd < dist[ni]) { dist[ni] = nd; pushH(nd, ni); }
    }
  }
  return null;
}

// 端点贴边（margin≈0）时所在格心可能为负 → 螺旋找最近自由格
const nearFree = (x, z, maxR = 4) => {
  const [cx, cz] = toCell(x, z);
  if (cx >= 0 && cx < NX && cz >= 0 && cz < NZ && free[cx * NZ + cz]) return [cx, cz];
  for (let r = 1; r <= maxR; r++)
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nx >= NX || nz < 0 || nz >= NZ) continue;
      if (free[nx * NZ + nz]) return [nx, nz];
    }
  return null;
};

const bound = (x1, z1, x2, z2) => {
  const s = nearFree(x1, z1), t = nearFree(x2, z2);
  if (!s || !t) return null;
  const r = dij([s], (cx, cz) => Math.abs(cx - t[0]) <= 1 && Math.abs(cz - t[1]) <= 1);
  return r ? r.d : null;
};
// 到 cp 圆内（任一格距圆心 ≤ CP_R），返回 {d, cell} 供从触圆点续跑
const boundCp = (x1, z1, cp) => {
  const s = nearFree(x1, z1);
  if (!s) return null;
  return dij([s], (cx, cz) => {
    const gx = minX + (cx + 0.5) * G, gz = minZ + (cz + 0.5) * G;
    return Math.hypot(gx - cp[0], gz - cp[1]) <= CP_R;
  });
};

let totA = 0, totB = 0;
segments.forEach((sg, i) => {
  let act = 0; for (let k = 1; k < sg.length; k++) act += Math.hypot(sg[k][0] - sg[k - 1][0], sg[k][1] - sg[k - 1][1]);
  const cpl = segCps[i] || [];
  let b = 0, px = sg[0][0], pz = sg[0][1], ok = true;
  for (const ci of cpl) {
    const r = boundCp(px, pz, cps[ci]);
    if (!r) { ok = false; break; }
    b += r.d;
    // 从实际触圆格续跑（圆心重启会虚增 ≤1.05u/个 → 假负余量）
    px = minX + (r.cell[0] + 0.5) * G; pz = minZ + (r.cell[1] + 0.5) * G;
  }
  if (ok) {
    const d = bound(px, pz, sg[sg.length - 1][0], sg[sg.length - 1][1]);
    if (d === null) ok = false; else b += d;
  }
  const head = ok ? (act - b) : null;
  console.log(`seg${i} cp[${cpl}] 行程${act.toFixed(2).padStart(6)}  下界${ok ? b.toFixed(2).padStart(6) : '  FAIL'}  余量${head === null ? '   -' : head.toFixed(2).padStart(6)}`);
  totA += act; if (ok) totB += b;
});
console.log(`合计 图${totA.toFixed(2)}  严格下界${totB.toFixed(2)}  差${(totA - totB).toFixed(2)}u = ${Math.round((totA - totB) * 40)} tick（乐观界，未计包裹）`);
