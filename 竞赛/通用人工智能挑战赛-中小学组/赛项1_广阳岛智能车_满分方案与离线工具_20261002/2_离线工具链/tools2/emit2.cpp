// 任务二 发射器 C++ 版（tools2/emit2.js --dump 输出为输入）
// 复刻语义（与 JS 版逐项对齐）：
//   costTurn = tt(d) 非对称（emit2 语义；符号自由度由 searchMulti 双符号 + dpSigns 承担）
//   searchMulti：状态 (node, back, sign) 符号感知 Dijkstra；bothSigns=false 前瞻首符号即停
//   bestTo：候选展平 + base 下界剪枝 + 整腿前瞻（config 随交互变化）
//   发射管线：simplifyPath(尾冻 protectIdx) → postProcessLegSym(净收益消顶)
//             → dpSigns(尾符号锁) → emitTurn/emitMove（<1° 跳过）
//   blockersFor 动态：手持/已送达 r=0；ignore 包降 phys —— 影响发射期 segOk/simplify
// 用法: emit2_bin <dump> <out.py>
#include <bits/stdc++.h>
using namespace std;

static inline double dtU(double u) { return max(1.0, ceil(u / 0.025)); }
static inline double tt(double deg) { return ceil(max(260.0, deg * M_PI / 180.0 / 2.8 * 1000.0) / 20.0); }
static inline double wrap(double a) { double w = fmod(a + M_PI, 2 * M_PI); if (w < 0) w += 2 * M_PI; return w - M_PI; }
static double P_VEH_R, P_MARGIN, P_ANCHOR, P_MIN_TURN, P_BOOST, P_CM;
static const double TURN_W = 1.0;
static inline double costTurn(double d) { return d < P_MIN_TURN ? 0 : tt(d) * TURN_W; }

// ---- dump 输入 ----
struct Seg { double ax, az, bx, bz, allow; };
struct Blk { string id; double x, z, rFull, rPhys; };
struct Pt { double x, z, h; bool hNull; int kind; int pkg;        // pkg: blockers 下标, -1=无
            double aTol; bool aTolNull; int idx; string label; };  // idx: cp 序
struct Rec4 { double L; vector<int> hits; };
struct EdgeR { int a, b; double L; uint64_t hitMask; };
struct SeqE { int pid, cp; string label; };
struct Road { double width; vector<pair<double,double>> pts; };

static vector<Seg> segs;
static vector<Blk> blks;
static vector<Pt> pts;
static unordered_map<int, vector<int>> famB, famD;  // basePid → 候选族
static vector<vector<int>> gates;
static vector<SeqE> seq;
static vector<pair<double,double>> nodes;
static vector<int> nodeOfPoint;
static vector<EdgeR> edges;
static vector<Road> roads;
static pair<double,double> stPt, glPt; static double stH;
static int GRAB_TICK = 38, REL_TICK = 34;

// ---- marginAt（复刻 MG 桶：MG_CELL=1.0, MG_FLOOR=2.0, bbox 扩 MG_MAX_ALLOW+MG_FLOOR）----
static const double MG_CELL = 1.0, MG_FLOOR = 2.0;
static unordered_map<long long, vector<int>> mgGrid;
static long long mgKey(int i, int j) { return ((long long)i << 32) ^ (unsigned)j; }
static double mgMaxAllow;
static double sdSeg(double px, double pz, const Seg& s) {
  double dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz;
  double t = L2 == 0 ? 0 : max(0.0, min(1.0, ((px - s.ax) * dx + (pz - s.az) * dz) / L2));
  return hypot(px - (s.ax + t * dx), pz - (s.az + t * dz));
}
static double marginAt(double x, double z) {
  auto it = mgGrid.find(mgKey((int)floor(x / MG_CELL), (int)floor(z / MG_CELL)));
  if (it == mgGrid.end()) return -9;
  double b = -INFINITY;
  for (int si : it->second) { double m = segs[si].allow - sdSeg(x, z, segs[si]); if (m > b) b = m; }
  return b;
}

// ---- blockersFor / segOk（发射期动态状态）----
static int gHold = -1;                          // 当前手持 blockers 下标, -1=空
static uint64_t gDoneMask = 0;                  // 已送达 blockers 下标掩码
static double blkRadius(int k, const vector<int>& ig) {
  if (k == gHold || ((gDoneMask >> k) & 1)) return 0;
  for (int j : ig) if (j == k) return blks[k].rPhys;
  return blks[k].rFull;
}
static bool segOk(double ax, double az, double bx, double bz, double margin, double step, const vector<int>& ig) {
  double L = hypot(bx - ax, bz - az);
  int n = max(2, (int)ceil(L / step));
  double req = margin >= P_MARGIN - 1e-12 ? 0.0005 + P_BOOST : -0.0005;
  for (int i = 0; i <= n; i++) {
    double t = (double)i / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
    if (marginAt(px, pz) < req) return false;
    for (int k = 0; k < (int)blks.size(); k++) {
      double r = blkRadius(k, ig);
      if (r > 0 && hypot(blks[k].x - px, blks[k].z - pz) < r) return false;
    }
  }
  return true;
}

// ---- adjFor（config 感知：active = 非送达 且 非手持）----
static vector<vector<vector<pair<int,double>>>> adjTables;   // [slot][node] → {v,L}
static unordered_map<uint32_t,int> adjSlot;
static const vector<vector<pair<int,double>>>& adjT(int done, int holdK) {
  uint32_t key = (uint32_t)done | ((uint32_t)(holdK + 1) << 16);
  auto it = adjSlot.find(key);
  if (it != adjSlot.end()) return adjTables[it->second];
  int n = (int)nodes.size();
  vector<vector<pair<int,double>>> t((size_t)n);
  uint64_t active = 0;
  for (int k = 0; k < (int)blks.size(); k++) {
    if ((done >> k) & 1) continue;
    if (k == holdK) continue;
    active |= 1ULL << k;
  }
  for (auto& e : edges) {
    if (e.hitMask & active) continue;
    t[e.a].push_back({e.b, e.L});
    t[e.b].push_back({e.a, e.L});
  }
  int ix = (int)adjTables.size();
  adjTables.push_back(std::move(t));
  adjSlot[key] = ix;
  return adjTables[ix];
}

// ---- searchMulti：符号感知 Dijkstra ----
// 状态 key = (node<<12)|(back<<1)|signBit（back=入边前一节点；首跳 back=src）
// 返回 map: (dstNode<<1)|signBit → {ticks, path, signs, carH}
struct Found { double ticks; vector<int> path; vector<int> signs; double carH; };
struct PrevS { uint64_t back; double hdg; int sgn; bool used; };
static unordered_map<uint64_t, Found> searchMulti(int srcNode, double srcH, const vector<int>& dstNodes,
                                                  int done, int holdK, bool bothSigns) {
  auto aim = [](double d, int s) { return s == 1 ? d : wrap(d + M_PI); };
  unordered_map<uint64_t, Found> found;
  auto dstHas = [&](int nd) { for (int d : dstNodes) if (d == nd) return true; return false; };
  int nWant = (bothSigns ? (int)dstNodes.size() * 2 : (int)dstNodes.size());
  if (dstHas(srcNode)) {
    for (int s : (bothSigns ? vector<int>{1, -1} : vector<int>{1}))
      found[(uint64_t)srcNode << 1 | (s == 1 ? 0 : 1)] = Found{0, {srcNode}, {}, srcH};
  }
  if ((int)found.size() >= nWant) return found;
  const auto& adj = adjT(done, holdK);
  unordered_map<uint64_t, double> best;
  unordered_map<uint64_t, PrevS> prev;
  best.reserve(1 << 19); prev.reserve(1 << 19);
  using Item = pair<double, uint64_t>;
  priority_queue<Item, vector<Item>, greater<Item>> pq;
  auto skey = [](int node, int back, int s) { return ((uint64_t)node << 13) | ((uint64_t)back << 1) | (uint64_t)(s == 1 ? 0 : 1); };
  auto& s0 = nodes[srcNode];
  for (auto& e : adj[srcNode]) {
    auto& b = nodes[e.first];
    double h = atan2(-(b.first - s0.first), -(b.second - s0.second));
    for (int s : {1, -1}) {
      uint64_t k = skey(e.first, srcNode, s);
      double t = costTurn(fabs(wrap(aim(h, s) - srcH) * 180 / M_PI)) + dtU(e.second);
      auto it = best.find(k);
      if (it == best.end() || t < it->second - 1e-9) { best[k] = t; prev[k] = PrevS{UINT64_MAX, h, s, true}; pq.push({t, k}); }
    }
  }
  while (!pq.empty() && (int)found.size() < nWant) {
    auto [ticks, k] = pq.top(); pq.pop();
    auto it = best.find(k);
    if (it == best.end() || ticks > it->second + 1e-9) continue;
    int cur = (int)((k >> 13) & 0xFFF), back = (int)((k >> 1) & 0xFFF);
    int sgn = (k & 1) ? -1 : 1;
    PrevS& p = prev[k];
    int fKey = (cur << 1) | (sgn == 1 ? 0 : 1);
    if (dstHas(cur) && !found.count(fKey)) {
      // 回溯：PrevS.back = 上游状态 key；首跳 = UINT64_MAX（对应 JS 的 back:null 终止）
      vector<int> pathR, signsR;
      uint64_t kk = k;
      while (true) {
        pathR.push_back((int)((kk >> 13) & 0xFFF));
        PrevS& q = prev.at(kk);
        signsR.push_back(q.sgn);
        if (q.back == UINT64_MAX) break;
        kk = q.back;
      }
      std::reverse(pathR.begin(), pathR.end()); std::reverse(signsR.begin(), signsR.end());
      found[fKey] = Found{ticks, pathR, signsR, aim(p.hdg, sgn)};
    }
    int node = cur;
    auto& a = nodes[node];
    double H = aim(p.hdg, sgn);
    for (auto& e : adj[node]) {
      if (e.first == back) continue;
      auto& b = nodes[e.first];
      double h2 = atan2(-(b.first - a.first), -(b.second - a.second));
      for (int s2 : {1, -1}) {
        uint64_t nk = skey(e.first, node, s2);
        double t = ticks + costTurn(fabs(wrap(aim(h2, s2) - H) * 180 / M_PI)) + dtU(e.second);
        auto nit = best.find(nk);
        if (nit == best.end() || t < nit->second - 1e-9) { best[nk] = t; prev[nk] = PrevS{k, h2, s2, true}; pq.push({t, nk}); }
      }
    }
  }
  return found;
}

// ---- bestTo：候选展平 + 下界剪枝 + 整腿前瞻 ----
struct BestR { double ticks, tot; int tpid, alignC, sign; Found* rf; };  // rf 指向局部（不可跨用）
// 用输出参数传递 Found（避免悬垂）
static bool bestTo(int fromPid, const vector<int>& toCands, int done, int holdK, double srcH,
                   const vector<int>* nextCands,
                   double& outTicks, int& outTpid, Found& outR, int& outSign) {
  double sH = srcH;
  bool hasNext = nextCands && !nextCands->empty();
  vector<int> dstNodes;
  { unordered_set<int> seen; for (int tp : toCands) if (seen.insert(nodeOfPoint[tp]).second) dstNodes.push_back(nodeOfPoint[tp]); }
  auto res = searchMulti(nodeOfPoint[fromPid], sH, dstNodes, done, holdK, true);
  struct Entry { double base, dAl; int tpid, sign, alignC; Found* r; };
  vector<Entry> all;
  for (int tp : toCands) {
    int nd = nodeOfPoint[tp];
    const Pt& dst = pts[tp];
    for (int s : {1, -1}) {
      auto it = res.find((uint64_t)nd << 1 | (s == 1 ? 0 : 1));
      if (it == res.end()) continue;
      Found& r = it->second;
      double dAl = dst.hNull ? 0 : fabs(wrap(dst.h - r.carH) * 180 / M_PI);
      double alignCost = dst.hNull ? 0 : (!dst.aTolNull && dAl <= dst.aTol ? 0 : costTurn(dAl));
      all.push_back({r.ticks + alignCost, dAl, tp, s, (int)alignCost, &r});
    }
  }
  sort(all.begin(), all.end(), [](const Entry& a, const Entry& b) { return a.base < b.base; });
  bool best = false; double bestTot = 0;
  for (auto& e : all) {
    if (best && e.base >= bestTot) break;
    double look = 0;
    if (hasNext) {
      const Pt& dst = pts[e.tpid];
      int done2 = done, hold2 = holdK;
      if (dst.kind == 2) hold2 = dst.pkg;
      else if (dst.kind == 3) { done2 |= (1 << dst.pkg); hold2 = -1; }
      double dep = (!dst.hNull && e.dAl > (dst.aTolNull ? -INFINITY : dst.aTol)) ? dst.h : e.r->carH;
      vector<int> nNodes; { unordered_set<int> seen; for (int np : *nextCands) if (seen.insert(nodeOfPoint[np]).second) nNodes.push_back(nodeOfPoint[np]); }
      auto res2 = searchMulti(nodeOfPoint[e.tpid], dep, nNodes, done2, hold2, false);
      double bestLook = INFINITY;
      for (int np : *nextCands) {
        int nd2 = nodeOfPoint[np];
        const Pt& nDst = pts[np];
        for (int s2 : {1, -1}) {
          auto it2 = res2.find((uint64_t)nd2 << 1 | (s2 == 1 ? 0 : 1));
          if (it2 == res2.end()) continue;
          Found& r2 = it2->second;
          double nAl = nDst.hNull ? 0 : fabs(wrap(nDst.h - r2.carH) * 180 / M_PI);
          double nAlign = nDst.hNull ? 0 : (!nDst.aTolNull && nAl <= nDst.aTol ? 0 : costTurn(nAl));
          if (r2.ticks + nAlign < bestLook) bestLook = r2.ticks + nAlign;
        }
      }
      look = isfinite(bestLook) ? bestLook : 1e6;
    }
    double tot = e.base + look;
    if (!best || tot < bestTot) {
      best = true; bestTot = tot;
      outTicks = e.base; outTpid = e.tpid; outSign = e.sign; outR = *e.r;
    }
  }
  return best;
}

// ---- simplifyPath：Douglas-Peucker + 走廊复核（protectIdx 尾冻保末段方向）----
static vector<int> simplifyPath(const vector<int>& path, const vector<int>& ig, int protectIdx = -1) {
  vector<pair<double,double>> pt;
  for (int nid : path) pt.push_back(nodes[nid]);
  if (pt.size() <= 2) return path;
  int n = (int)pt.size();
  vector<char> keep(n, 0);
  keep[0] = keep[n - 1] = 1;
  if (protectIdx > 0 && protectIdx < n - 1) keep[protectIdx] = 1;
  vector<pair<int,int>> stk; stk.push_back({0, n - 1});
  while (!stk.empty()) {
    auto [lo, hi] = stk.back(); stk.pop_back();
    if (hi <= lo + 1) continue;
    if (segOk(pt[lo].first, pt[lo].second, pt[hi].first, pt[hi].second, P_MARGIN, 0.002, ig)) continue;
    double worst = -1; int wi = lo + 1;
    double ax = pt[lo].first, az = pt[lo].second, bx = pt[hi].first, bz = pt[hi].second;
    double sg = hypot(bx - ax, bz - az);
    for (int k = lo + 1; k < hi; k++) {
      double px = pt[k].first, pz = pt[k].second, d;
      if (sg < 1e-9) d = hypot(px - ax, pz - az);
      else { double t = max(0.0, min(1.0, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / (sg * sg)));
             d = hypot(px - (ax + t * (bx - ax)), pz - (az + t * (bz - az))); }
      if (d > worst) { worst = d; wi = k; }
    }
    keep[wi] = 1;
    stk.push_back({lo, wi}); stk.push_back({wi, hi});
  }
  if (protectIdx > 0 && protectIdx < n - 1) keep[protectIdx] = 1;
  vector<int> out;
  for (int i = 0; i < n; i++) if (keep[i]) out.push_back(path[i]);
  return out;
}

// ---- postProcessLeg（旧管线：净 tick 收益删顶；BFS 兜底用）----
static double turnDegAt(const vector<pair<double,double>>& a, int i) {
  if (i <= 0 || i >= (int)a.size() - 1) return 0;
  double ax = a[i].first - a[i-1].first, az = a[i].second - a[i-1].second;
  double bx = a[i+1].first - a[i].first, bz = a[i+1].second - a[i].second;
  double l1 = hypot(ax, az), l2 = hypot(bx, bz);
  if (l1 < 1e-9 || l2 < 1e-9) return 0;
  double c = max(-1.0, min(1.0, (ax * bx + az * bz) / (l1 * l2)));
  return acos(c) * 180 / M_PI;
}
static inline double turnTicksOf(double deg) { return ceil(max(260.0, (deg * M_PI / 180) / 2.8 * 1000.0) / 20.0); }
static inline double distTicks(const pair<double,double>& a, const pair<double,double>& b) {
  return ceil(hypot(b.first - a.first, b.second - a.second) / 0.025);
}
static vector<pair<double,double>> postProcessLeg(vector<pair<double,double>> pts, const vector<int>& ig) {
  for (int guard = 0; guard < 500; guard++) {
    bool changed = false;
    for (int i = 1; i < (int)pts.size() - 1; i++) {
      if (!segOk(pts[i-1].first, pts[i-1].second, pts[i+1].first, pts[i+1].second, P_MARGIN, 0.002, ig)) continue;
      double degHere = turnDegAt(pts, i);
      if (degHere >= P_MIN_TURN) {
        double before = turnTicksOf(turnDegAt(pts, i-1)) + turnTicksOf(degHere) + turnTicksOf(turnDegAt(pts, i+1));
        double beforeD = distTicks(pts[i-1], pts[i]) + distTicks(pts[i], pts[i+1]);
        double afterD = distTicks(pts[i-1], pts[i+1]);
        vector<pair<double,double>> after;
        for (int k = 0; k < (int)pts.size(); k++) if (k != i) after.push_back(pts[k]);
        double afterT = turnTicksOf(turnDegAt(after, i-1)) + turnTicksOf(turnDegAt(after, i));
        if (before - afterT - (afterD - beforeD) < 2) continue;
      }
      pts.erase(pts.begin() + i);
      changed = true; break;
    }
    if (!changed) break;
  }
  return pts;
}

// ---- dpSignsCore：逐段符号 DP（尾锁 + 返回总成本）----
struct DPRes { vector<int> signs; double cost; };
static DPRes dpSignsCore(const pair<double,double>& startPos, const vector<pair<double,double>>& pts,
                         double startH, const Pt* dst, int lockedTailSign) {
  vector<double> segD;
  double px = startPos.first, pz = startPos.second;
  for (auto& p : pts) {
    double L = hypot(p.first - px, p.second - pz);
    if (L > 1e-4) segD.push_back(atan2(-(p.first - px), -(p.second - pz)));
    px = p.first; pz = p.second;
  }
  if (segD.empty()) return {{}, 0};
  auto aim = [](double d, int s) { return s == 1 ? d : wrap(d + M_PI); };
  auto turnCost = [](double f, double t) { return tt(fabs(wrap(t - f) * 180 / M_PI)); };
  int m = (int)segD.size();
  vector<array<double,2>> cost(m);       // cost[j][0/1] = 段 j 符号 ±1
  vector<array<int,2>> prv(m);
  cost[0][0] = turnCost(startH, aim(segD[0], 1));
  cost[0][1] = turnCost(startH, aim(segD[0], -1));
  prv[0][0] = prv[0][1] = -1;
  for (int j = 1; j < m; j++) {
    for (int i2 = 0; i2 < 2; i2++) {
      int s2 = i2 == 0 ? 1 : -1;
      double bc = INFINITY; int bp = -1;
      for (int s1 : {1, -1}) {
        double c = cost[j-1][s1 == 1 ? 0 : 1] + turnCost(aim(segD[j-1], s1), aim(segD[j], s2));
        if (c < bc) { bc = c; bp = s1 == 1 ? 0 : 1; }
      }
      cost[j][i2] = bc; prv[j][i2] = bp;
    }
  }
  int last = m - 1;
  if (dst && !dst->hNull) {
    for (int s : {1, -1}) {
      int i = s == 1 ? 0 : 1;
      double dAl = fabs(wrap(dst->h - aim(segD[last], s)) * 180 / M_PI);
      cost[last][i] += (!dst->aTolNull && dAl <= dst->aTol) ? 0 : tt(dAl);
    }
  }
  if (lockedTailSign == 1 || lockedTailSign == -1)
    cost[last][lockedTailSign == 1 ? 1 : 0] = INFINITY;
  int sCur = cost[last][0] <= cost[last][1] ? 0 : 1;
  vector<int> signs(m);
  for (int j = last; j >= 0; j--) {
    signs[j] = sCur == 0 ? 1 : -1;
    if (j > 0) sCur = prv[j][sCur];
  }
  return {signs, cost[last][signs[last] == 1 ? 0 : 1]};
}
static vector<int> dpSigns(const pair<double,double>& startPos, const vector<pair<double,double>>& pts,
                           double startH, const Pt* dst, int lockedTailSign) {
  return dpSignsCore(startPos, pts, startH, dst, lockedTailSign).signs;
}

// ---- postProcessLegSym：符号感知净收益消顶（尾冻 len-3）----
static vector<pair<double,double>> postProcessLegSym(vector<pair<double,double>> pts,
        const pair<double,double>& curPos, double curH, const Pt* dst, int lockedTailSign, const vector<int>& ig) {
  auto sumDist = [&](const vector<pair<double,double>>& arr) {
    double t = 0; double px = curPos.first, pz = curPos.second;
    for (auto& p : arr) { t += distTicks({px, pz}, p); px = p.first; pz = p.second; }
    return t;
  };
  auto total = [&](const vector<pair<double,double>>& arr) {
    return dpSignsCore(curPos, arr, curH, dst, lockedTailSign).cost + sumDist(arr);
  };
  for (int guard = 0; guard < 500; guard++) {
    bool changed = false;
    for (int i = 1; i + 2 < (int)pts.size(); i++) {        // 尾冻：i ≤ len-3
      if (!segOk(pts[i-1].first, pts[i-1].second, pts[i+1].first, pts[i+1].second, P_MARGIN, 0.002, ig)) continue;
      double degHere = turnDegAt(pts, i);
      vector<pair<double,double>> after;
      for (int k = 0; k < (int)pts.size(); k++) if (k != i) after.push_back(pts[k]);
      if (degHere >= P_MIN_TURN) {
        if (total(pts) - total(after) < 2) continue;
      } else {
        if (total(pts) - total(after) < 0) continue;
      }
      pts = std::move(after);
      changed = true; break;
    }
    if (!changed) break;
  }
  return pts;
}

// ---- BFS 兜底腿（0.02 网格 + 字符串拉伸）----
static const double GRID_H = 0.02;
static vector<pair<double,double>> bfsFallback(int fromPid, int tpid) {
  const Pt& src = pts[fromPid]; const Pt& dst = pts[tpid];
  vector<int> ig;
  if (src.pkg >= 0) ig.push_back(src.pkg);
  if (dst.pkg >= 0 && dst.pkg != (ig.empty() ? -1 : ig[0])) ig.push_back(dst.pkg);
  auto freeAt = [&](double x, double z) {
    if (marginAt(x, z) < -1e-9) return false;
    for (int k = 0; k < (int)blks.size(); k++) {
      double r = blkRadius(k, ig);
      if (r > 0 && hypot(blks[k].x - x, blks[k].z - z) < r) return false;
    }
    return true;
  };
  double minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (auto& r : roads) for (auto& p : r.pts) {
    minX = min(minX, p.first); maxX = max(maxX, p.first);
    minZ = min(minZ, p.second); maxZ = max(maxZ, p.second);
  }
  minX -= 2; maxX += 2; minZ -= 2; maxZ += 2;
  int NX = (int)ceil((maxX - minX) / GRID_H), NZ = (int)ceil((maxZ - minZ) / GRID_H);
  auto cellOf = [&](double x, double z) { return pair<int,int>{(int)floor((x - minX) / GRID_H + 0.5), (int)floor((z - minZ) / GRID_H + 0.5)}; };
  auto [sxi, szi] = cellOf(src.x, src.z);
  auto [txi, tzi] = cellOf(dst.x, dst.z);
  vector<int> prvCell((size_t)NX * NZ, -1);
  vector<char> seen((size_t)NX * NZ, 0);
  vector<int> q; int q0 = szi * NX + sxi; seen[q0] = 1; q.push_back(q0);
  int target = tzi * NX + txi, hit = -1;
  for (size_t qi = 0; qi < q.size(); qi++) {
    int cur = q[qi];
    if (cur == target) { hit = cur; break; }
    int cx = cur % NX, cz = cur / NX;
    for (auto [dx, dz] : vector<pair<int,int>>{{1,0},{-1,0},{0,1},{0,-1}}) {
      int nx2 = cx + dx, nz2 = cz + dz;
      if (nx2 < 0 || nz2 < 0 || nx2 >= NX || nz2 >= NZ) continue;
      int ni = nz2 * NX + nx2;
      if (seen[ni]) continue;
      double wx = minX + nx2 * GRID_H, wz = minZ + nz2 * GRID_H;
      if (!freeAt(wx, wz)) continue;      // JS: seen 先置1再 freeAt 复核——有差异？JS: seen[ni]=1; if(!freeAt) continue; 同（失败也标 seen）
      seen[ni] = 1;
      prvCell[ni] = cur; q.push_back(ni);
    }
  }
  if (hit < 0) return {};
  vector<int> cells;
  for (int c = hit; c >= 0; c = prvCell[c]) cells.push_back(c);
  reverse(cells.begin(), cells.end());
  vector<pair<double,double>> pt;
  for (int c : cells) pt.push_back({minX + (c % NX) * GRID_H, minZ + (c / NX) * GRID_H});
  pt[0] = {src.x, src.z};
  pt[pt.size() - 1] = {dst.x, dst.z};
  auto okSegL = [&](const pair<double,double>& a, const pair<double,double>& b, double margin) {
    return segOk(a.first, a.second, b.first, b.second, margin, 0.002, ig);
  };
  vector<pair<double,double>> out; out.push_back(pt[0]);
  size_t i = 0;
  while (i + 1 < pt.size()) {
    long long j = (long long)pt.size() - 1;
    for (; j > (long long)i + 1; j--) if (okSegL(pt[i], pt[j], P_MARGIN)) break;
    if (j == (long long)i + 1 && !okSegL(pt[i], pt[j], P_MARGIN)) { out.push_back(pt[i+1]); i++; continue; }
    out.push_back(pt[j]); i = j;
  }
  if (out.size() >= 2) {
    auto last = out.back();
    for (long long k = (long long)out.size() - 2; k > 0; k--)
      if (okSegL(out[k-1], last, P_ANCHOR)) out.erase(out.begin() + k);
  }
  return out;
}

// ================= main =================
int main(int argc, char** argv) {
  if (argc < 3) { fprintf(stderr, "usage: emit2_bin <dump> <out.py>\n"); return 2; }
  ifstream in(argv[1]);
  if (!in) { fprintf(stderr, "cannot open dump\n"); return 2; }
  string line;
  auto tabs = [](const string& s, vector<string>& o) {
    o.clear(); size_t p = 0;
    for (;;) { size_t q = s.find('\t', p); if (q == string::npos) { o.push_back(s.substr(p)); break; } o.push_back(s.substr(p, q - p)); p = q + 1; }
  };
  vector<string> f;
  int nR = 0;
  unordered_map<string, int> blkIdxById;
  while (getline(in, line)) {
    if (line.empty()) continue;
    tabs(line, f);
    const string& t = f[0];
    if (t == "PARAMS") {
      P_VEH_R = stod(f[1]); P_MARGIN = stod(f[2]); P_ANCHOR = stod(f[3]);
      P_MIN_TURN = stod(f[4]); P_BOOST = stod(f[5]); P_CM = stod(f[6]);
    } else if (t == "S") {
      segs.push_back({stod(f[1]), stod(f[2]), stod(f[3]), stod(f[4]), stod(f[5])});
    } else if (t == "Y") {
      int k = stoi(f[1]);
      if (k >= (int)blks.size()) blks.resize(k + 1);
      Blk& b = blks[k];
      b.id = f[2]; b.x = stod(f[3]); b.z = stod(f[4]); b.rFull = stod(f[5]); b.rPhys = stod(f[6]);
      blkIdxById[b.id] = k;
    } else if (t == "T") {
      Pt p;
      p.x = stod(f[2]); p.z = stod(f[3]);
      p.hNull = (f[4] == "null"); p.h = p.hNull ? 0 : stod(f[4]);
      p.kind = stoi(f[5]);
      p.pkg = (f[6] == "-") ? -1 : blkIdxById[f[6]];
      p.aTolNull = (f[7] == "null"); p.aTol = p.aTolNull ? 0 : stod(f[7]);
      p.idx = stoi(f[8]);
      p.label = f[9];
      pts.push_back(std::move(p));
    } else if (t == "B" || t == "D") {
      vector<int> arr;
      for (size_t i = 2; i < f.size(); i++) arr.push_back(stoi(f[i]));
      (t == "B" ? famB : famD)[stoi(f[1])] = std::move(arr);
    } else if (t == "G") {
      int n = stoi(f[1]);
      vector<int> g; g.reserve(n);
      for (int i = 0; i < n; i++) g.push_back(stoi(f[2 + i]));
      gates.push_back(std::move(g));
    } else if (t == "Q") {
      seq.push_back({stoi(f[1]), stoi(f[2]), f[3]});
    } else if (t == "N") {
      int id = stoi(f[1]);
      if (id >= (int)nodes.size()) nodes.resize(id + 1, {-1e9, -1e9});
      nodes[id] = {stod(f[2]), stod(f[3])};
    } else if (t == "NODEOFPOINT") {
      // 头行（计数），数据是下一行纯数字
    } else if (t[0] >= '0' && t[0] <= '9') {
      for (auto& x : f) nodeOfPoint.push_back(stoi(x));
    } else if (t == "E") {
      EdgeR e; e.a = stoi(f[1]); e.b = stoi(f[2]); e.L = stod(f[3]);
      int nh = stoi(f[4]);
      e.hitMask = 0;
      for (int i = 0; i < nh; i++) e.hitMask |= 1ULL << stoi(f[5 + i]);
      edges.push_back(e);
    } else if (t == "R") {
      Road r; r.width = stod(f[1]);
      int np = stoi(f[2]);
      getline(in, line);
      istringstream ss(line); string tok;
      while (getline(ss, tok, ',')) { double a = stod(tok); getline(ss, tok, ','); r.pts.push_back({a, stod(tok)}); }
      roads.push_back(std::move(r));
    } else if (t == "START") {
      stPt = {stod(f[1]), stod(f[2])}; stH = stod(f[3]);
    } else if (t == "GOAL") {
      glPt = {stod(f[1]), stod(f[2])};
    } else if (t == "INTER") {
      GRAB_TICK = stoi(f[1]); REL_TICK = stoi(f[2]);
    }
  }
  if (nodeOfPoint.size() != pts.size()) { fprintf(stderr, "NODEOFPOINT %zu != pts %zu\n", nodeOfPoint.size(), pts.size()); return 2; }
  printf("读取 dump：节点 %zu 边 %zu 点 %zu seq %zu\n", nodes.size(), edges.size(), pts.size(), seq.size());

  // marginAt 桶
  mgMaxAllow = 0;
  for (auto& s : segs) mgMaxAllow = max(mgMaxAllow, s.allow);
  for (int si = 0; si < (int)segs.size(); si++) {
    Seg& s = segs[si];
    int x0 = (int)floor((min(s.ax, s.bx) - mgMaxAllow - MG_FLOOR) / MG_CELL);
    int x1 = (int)floor((max(s.ax, s.bx) + mgMaxAllow + MG_FLOOR) / MG_CELL);
    int z0 = (int)floor((min(s.az, s.bz) - mgMaxAllow - MG_FLOOR) / MG_CELL);
    int z1 = (int)floor((max(s.az, s.bz) + mgMaxAllow + MG_FLOOR) / MG_CELL);
    for (int i = x0; i <= x1; i++) for (int j = z0; j <= z1; j++) mgGrid[mgKey(i, j)].push_back(si);
  }

  int startPid = -1, goalPid = -1;
  for (int i = 0; i < (int)pts.size(); i++) {
    if (pts[i].kind == 0) startPid = i;
    if (pts[i].kind == 1) goalPid = i;
  }
  // 发射状态
  vector<string> lines;
  double curH = stH, curX = stPt.first, curZ = stPt.second;
  int prevPid = startPid, holdK = -1, done = 0;
  gHold = -1; gDoneMask = 0;
  struct SegInfo { string seg; double ticks; long long actual; double dist, fx, fz, tx, tz; bool planMinus; };
  vector<SegInfo> segInfo;
  long long est = 0;
  int nTurn = 0, nMove = 0;
  auto candsOf = [&](const SeqE& s) -> vector<int> {
    if (s.label.rfind("cp#", 0) == 0) return gates[strtol(s.label.c_str() + 3, nullptr, 10)];
    auto it = famB.find(s.pid); if (it != famB.end()) return it->second;
    it = famD.find(s.pid); if (it != famD.end()) return it->second;
    return {s.pid};
  };
  auto nextCandsOf = [&](int i) -> vector<int> {
    if (i + 1 >= (int)seq.size()) return {};
    return candsOf(seq[i + 1]);
  };

  auto tEmit0 = chrono::steady_clock::now();
  for (int i = 1; i < (int)seq.size(); i++) {
    const string& label = seq[i].label;
    vector<int> cands = candsOf(seq[i]);
    gHold = holdK; gDoneMask = (uint64_t)done;          // CUR_HOLD=hold（segOk 动态）
    size_t legLineStart = lines.size();
    double legStartX = curX, legStartY = curZ;
    vector<int> nxt = nextCandsOf(i);
    const vector<int>* nxtP = nxt.empty() ? nullptr : &nxt;
    double bTicks = 0; int bTpid = -1, bSign = 1; Found bR;
    bool ok = bestTo(prevPid, cands, done, holdK, curH, nxtP, bTicks, bTpid, bR, bSign);
    vector<pair<double,double>> planXZ;                 // 段终点
    vector<int> planS;
    double legTicks = -1e9; int usedTpid = -1;
    if (ok) {
      int lockedTail = bR.signs.empty() ? 1 : bR.signs.back();
      int protect = bR.path.size() > 2 ? (int)bR.path.size() - 2 : -1;
      vector<int> simplified = simplifyPath(bR.path, {}, protect);
      vector<pair<double,double>> rawPts;
      for (int nid : simplified) rawPts.push_back(nodes[nid]);
      const Pt* dstP = bTpid >= 0 ? &pts[bTpid] : nullptr;
      auto pts2 = postProcessLegSym(rawPts, {curX, curZ}, curH, dstP, lockedTail, {});
      auto signs = dpSigns({curX, curZ}, pts2, curH, dstP, lockedTail);
      double px = curX, pz = curZ; size_t si = 0;
      for (auto& p : pts2) {
        double L = hypot(p.first - px, p.second - pz);
        if (L > 1e-4) {
          planXZ.push_back(p);
          planS.push_back(si < signs.size() ? signs[si] : 1);
          si++;
        }
        px = p.first; pz = p.second;
      }
      legTicks = bTicks; usedTpid = bTpid;
      printf("[leg %d/%zu] %s -> %s  计划 %.0f tick  累计 %.1fmin\n", i, seq.size() - 1,
             pts[prevPid].label.c_str(), label.c_str(), legTicks,
             chrono::duration<double>(chrono::steady_clock::now() - tEmit0).count() / 60);
    } else {
      for (int tpid : cands) {
        auto f = bfsFallback(prevPid, tpid);
        if (!f.empty()) {
          auto pts2 = postProcessLeg(f, {});
          auto signs = dpSigns({curX, curZ}, pts2, curH, &pts[tpid], 0);
          double px = curX, pz = curZ; size_t si = 0;
          for (auto& p : pts2) {
            double L = hypot(p.first - px, p.second - pz);
            if (L > 1e-4) { planXZ.push_back(p); planS.push_back(si < signs.size() ? signs[si] : 1); si++; }
            px = p.first; pz = p.second;
          }
          legTicks = -1; usedTpid = tpid;
          printf("  ↻ %s -> %s 图不可达，用 BFS 兜底腿（%zu 顶点）\n", pts[prevPid].label.c_str(), pts[tpid].label.c_str(), f.size());
          break;
        }
      }
    }
    if (usedTpid < 0) { fprintf(stderr, "❌ %s -> %s 图与 BFS 均不可达，中止\n", pts[prevPid].label.c_str(), label.c_str()); return 1; }
    // 计划段即时校验（0.002 采样）
    {
      double px = legStartX, pz = legStartY;
      for (size_t k = 0; k < planXZ.size(); k++) {
        double LL = hypot(planXZ[k].first - px, planXZ[k].second - pz);
        if (LL > 1e-9) {
          int nn = max(2, (int)ceil(LL / 0.002));
          double wm = INFINITY;
          for (int q = 0; q <= nn; q++) { double t = (double)q / nn; wm = min(wm, marginAt(px + (planXZ[k].first - px) * t, pz + (planXZ[k].second - pz) * t)); }
          if (wm < -1e-7) printf("  ✗ 计划段即越界: (%.2f,%.2f)->(%.2f,%.2f) worst=%.4f\n", px, pz, planXZ[k].first, planXZ[k].second, wm);
        }
        px = planXZ[k].first; pz = planXZ[k].second;
      }
    }
    long long act = 0; double actDist = 0;
    auto emitTurn2 = [&](double want) {
      double dv = wrap(want - curH);
      double deg = fabs(dv * 180 / M_PI);
      if (deg < P_MIN_TURN) return;
      char buf[64];
      snprintf(buf, sizeof buf, "robot.%s(%.4f)", dv > 0 ? "left_angle" : "right_angle", deg);
      lines.push_back(buf);
      curH = wrap(curH + dv);
      act += (long long)tt(deg); est += (long long)tt(deg); nTurn++;
    };
    auto emitMove2 = [&](double L, int sgn) {
      if (L <= 1e-4) return;
      char buf[64];
      snprintf(buf, sizeof buf, "robot.%s(%.4f)", sgn == 1 ? "forward" : "backward", L * P_CM);
      lines.push_back(buf);
      curX -= sin(curH) * L * sgn;
      curZ -= cos(curH) * L * sgn;
      act += (long long)dtU(L); actDist += L; est += (long long)dtU(L); nMove++;
    };
    for (size_t k = 0; k < planXZ.size(); k++) {
      double L = hypot(planXZ[k].first - curX, planXZ[k].second - curZ);
      if (L > 1e-9) {
        int s = planS[k];
        double want = atan2(-(planXZ[k].first - curX), -(planXZ[k].second - curZ));
        double aim = s == 1 ? want : wrap(want + M_PI);
        double dvDeg = fabs(wrap(aim - curH) * 180 / M_PI);
        if (dvDeg > 1e-6 && dvDeg < P_MIN_TURN)
          printf("  ⚠ 跳过 %.3f° 瞄准角（%s 腿 L=%.2fu %s → 横向偏差上限 %.3fu）\n", dvDeg,
                 pts[prevPid].label.c_str(), L, s == 1 ? "正向" : "倒车", sin(dvDeg * M_PI / 180) * L);
        emitTurn2(aim);
        emitMove2(L, s);
      }
    }
    const Pt& dst = pts[usedTpid];
    if (!dst.hNull) {
      double dAl = fabs(wrap(dst.h - curH) * 180 / M_PI);
      if (!( !dst.aTolNull && dAl <= dst.aTol )) emitTurn2(dst.h);
    }
    if (dst.kind == 2) { lines.push_back("robot.grab()"); holdK = dst.pkg; est += GRAB_TICK; act += GRAB_TICK; }
    else if (dst.kind == 3) {
      lines.push_back("robot.release()"); holdK = -1;
      done |= (1 << dst.pkg); est += REL_TICK; act += REL_TICK;
    }
    char segb[160];
    snprintf(segb, sizeof segb, "%s -> %s", pts[prevPid].label.c_str(), dst.label.c_str());
    segInfo.push_back({segb, legTicks, act, actDist, legStartX, legStartY, curX, curZ, legTicks < 0});
    prevPid = usedTpid;
    (void)goalPid;
  }

  // ---------- 执行折线终检 ----------
  double vx = stPt.first, vz = stPt.second, vh = stH;
  vector<pair<double,double>> poly; poly.push_back({vx, vz});
  for (auto& l : lines) {
    if (l.rfind("robot.forward(", 0) == 0 || l.rfind("robot.backward(", 0) == 0) {
      bool fwd = l[6] == 'f';
      double u = stod(l.substr(l.find('(') + 1)) / P_CM * (fwd ? 1 : -1);
      vx -= sin(vh) * u; vz -= cos(vh) * u;
    } else if (l.rfind("robot.left_angle(", 0) == 0 || l.rfind("robot.right_angle(", 0) == 0) {
      bool left = l[6] == 'l';
      vh += (left ? 1 : -1) * stod(l.substr(l.find('(') + 1)) * M_PI / 180;
      poly.push_back({vx, vz});
    }
  }
  int viol = 0;
  for (size_t i = 0; i + 1 < poly.size(); i++) {
    double ax = poly[i].first, az = poly[i].second, bx = poly[i+1].first, bz = poly[i+1].second;
    double L = hypot(bx - ax, bz - az);
    if (L < 1e-9) continue;
    int n = max(2, (int)ceil(L / 0.001));
    double wm = INFINITY; double wt = 0;
    for (int k = 0; k <= n; k++) { double t = (double)k / n; double mg = marginAt(ax + (bx - ax) * t, az + (bz - az) * t);
      if (mg < wm) { wm = mg; wt = t; } }
    if (wm < -1e-7) {
      viol++;
      if (viol <= 8) printf("   seg %zu worst %.4f @ (%.3f,%.3f) L=%.2f\n", i, wm, ax + (bx - ax) * wt, az + (bz - az) * wt, L);
    }
  }
  if (viol) {
    printf("❌ 终检：执行折线有 %d 段越界（MARGIN_BOOST=%.2f）\n", viol, P_BOOST);
    printf("   → 加大 MARGIN_BOOST 重试\n");
  } else {
    printf("✅ 终检通过：执行折线全程在走廊内（采样 0.001u%s）\n", P_BOOST > 0 ? "，MARGIN_BOOST>0" : "");
  }

  // ---------- 写输出 ----------
  ofstream out(argv[2]);
  for (auto& l : lines) out << l << "\n";
  out.close();

  // ---------- 统计 ----------
  printf("=== 逐段：计划 vs 实发 ===\n");
  long long sumP = 0, sumA = 0;
  double sumStraight = 0, sumTravel = 0;
  for (auto& s : segInfo) {
    sumP += (long long)s.ticks; sumA += s.actual;
    long long gap = s.actual - (long long)s.ticks;
    double st = hypot(s.tx - s.fx, s.tz - s.fz);
    sumStraight += st; sumTravel += s.dist;
    char ratio[16];
    if (st > 1e-9) snprintf(ratio, sizeof ratio, "%.2f", s.dist / st); else snprintf(ratio, sizeof ratio, "-");
    printf("  %-38s 计划 %5lld  实发 %5lld  差 %+5lld  直线 %.2f 行程 %.2f 比 %s\n",
           s.seg.c_str(), (long long)s.ticks, s.actual, gap, st, s.dist, ratio);
  }
  printf("  合计 计划 %lld / 实发 %lld / 差 %lld，直线和 %.2fu，行程 %.2fu，绕行比 %.3f\n",
         sumP, sumA, sumA - sumP, sumStraight, sumTravel, sumStraight > 0 ? sumTravel / sumStraight : 0.0);
  printf("\n指令 %zu（转向 %d，直行 %d）\n", lines.size(), nTurn, nMove);
  printf("估算 %lld tick = %.2fs（满分线 6240 tick）\n", est, est * 0.02);
  printf("✅ 全部转向合法\n");
  printf("已写 %s\n", argv[2]);
  return viol ? 2 : 0;
}
