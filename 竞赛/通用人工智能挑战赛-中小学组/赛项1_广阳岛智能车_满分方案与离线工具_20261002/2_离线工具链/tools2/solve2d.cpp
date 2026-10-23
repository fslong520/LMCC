// 任务二 顺序联合求解 —— C++ 高速版（tools2/solve2d.js --dump 输出为输入）
// 语义与 JS 版逐项对齐：
//   dtU(u)=max(1,ceil(u/0.025))  tt(deg)=ceil(max(260,deg*π/180/2.8*1000)/20)
//   costTurn 对称 min(tt(d),tt(180-d))；对齐角 min(dAl,180-dAl)；族内 min 计价
//   状态 at=锚点（grab/rel 用 fam[0]=基线锚点；cp 到达记圆心 gates[i][0]）
//   边枚举：长度上限、margin 采样 0.002、阻挡者预过滤、hit ∩ active = ∅
// 用法: solve2d <dump> <out.json>
#include <bits/stdc++.h>
using namespace std;

static inline double dtU(double u) { return max(1.0, ceil(u / 0.025)); }
static inline double tt(double deg) { return ceil(max(260.0, deg * M_PI / 180.0 / 2.8 * 1000.0) / 20.0); }
static inline double wrap(double a) { double w = fmod(a + M_PI, 2 * M_PI); if (w < 0) w += 2 * M_PI; return w - M_PI; }
static const double MIN_TURN_DEG = 1.0;
static inline double costTurn(double d) {
  if (d < MIN_TURN_DEG) return 0;
  return min(tt(d), tt(max(0.0, 180.0 - d)));
}

// ---- dump 输入 ----
static double P_BUCKET, P_MAXL, P_MAXL_TASK, P_MARGIN, P_ANCHOR;
struct Seg { double ax, az, bx, bz, allow; };
struct Pkg { string id; double x, z, rFull, rPhys; bool obs; int bit; };
struct Pt { double x, z, h; bool hNull; int kind; string pkg; double aTol; bool aTolNull; string label; };
struct EdgeRec { int a, b; double L; uint64_t hit; };

static vector<Seg> segs;
static vector<Pkg> pkgs;
static vector<int> carryIdx;            // carry 序 -> pkgs 下标
static vector<string> carryIds;
static vector<Pt> pts;
static vector<vector<int>> gates;       // cp -> pids（[0]=圆心）
static unordered_map<string, vector<int>> famB, famD; // pkg -> pids（fam[0]=基线锚点）
static vector<pair<double,double>> nodes;
static vector<int> nodeOfPoint;

// marginAt：桶索引（复刻 JS BUCKET=2.0，负坐标 floor）
static unordered_map<long long, vector<int>> buckets;
static long long bkey(int i, int j) { return ((long long)i << 32) ^ (unsigned)j; }
static double segDistSeg(double px, double pz, const Seg& s) {
  double dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz;
  double t = L2 == 0 ? 0 : max(0.0, min(1.0, ((px - s.ax) * dx + (pz - s.az) * dz) / L2));
  return hypot(px - (s.ax + t * dx), pz - (s.az + t * dz));
}
static double marginAt(double x, double z) {
  int bi = (int)floor(x / P_BUCKET), bj = (int)floor(z / P_BUCKET);
  double best = -INFINITY; bool any = false;
  for (int di = -1; di <= 1; di++) for (int dj = -1; dj <= 1; dj++) {
    auto it = buckets.find(bkey(bi + di, bj + dj));
    if (it == buckets.end()) continue;
    for (int si : it->second) {
      double m = segs[si].allow - segDistSeg(x, z, segs[si]);
      if (m > best) best = m;
      any = true;
    }
  }
  if (!any) for (auto& s : segs) { double m = s.allow - segDistSeg(x, z, s); if (m > best) best = m; }
  return best;
}

// ---- 图 ----
static vector<EdgeRec> edgeRecs;
static vector<char> isTaskNode;
static vector<vector<int>> pidsOfNode;  // node -> [pid...]（锚点边忽略策略）
static vector<int> pkgOfPid;            // pid -> pkgs idx or -1

struct AdjE { int v; double L; };
static vector<vector<vector<AdjE>>> adjTables;
static unordered_map<uint32_t, int> adjTableIdx;
static const vector<vector<AdjE>>& adjT(int done, int holdIdx) {
  uint32_t key = (uint32_t)done | ((uint32_t)holdIdx << 16);
  auto it = adjTableIdx.find(key);
  if (it != adjTableIdx.end()) return adjTables[it->second];
  int n = (int)nodes.size();
  vector<vector<AdjE>> t((size_t)n);
  uint64_t active = 0;
  for (int k = 0; k < (int)pkgs.size(); k++) {
    const Pkg& p = pkgs[k];
    if (!p.obs && p.bit >= 0 && (done & (1 << p.bit))) continue;  // 已送达
    if (holdIdx < (int)carryIdx.size() && k == carryIdx[holdIdx]) continue;  // 手持（原地堆消失）
    active |= 1ULL << k;
  }
  for (auto& e : edgeRecs) {
    if (e.hit & active) continue;
    t[e.a].push_back({e.b, e.L});
    t[e.b].push_back({e.a, e.L});
  }
  int ix = (int)adjTables.size();
  adjTables.push_back(std::move(t));
  adjTableIdx[key] = ix;
  return adjTables[ix];
}

// ---- 单源搜索（复刻 searchFrom：状态 (node, back) 禁立即折返）----
struct Rec { double ticks, hdg; bool ok; };
static vector<Rec> searchFrom(int srcNode, double srcH, int done, int holdIdx) {
  const auto& adj = adjT(done, holdIdx);
  int n = (int)nodes.size();
  unordered_map<uint64_t, double> best, hdgOf;
  best.reserve(1 << 18); hdgOf.reserve(1 << 18);
  using Item = pair<double, uint64_t>;
  priority_queue<Item, vector<Item>, greater<Item>> pq;
  auto key = [](int node, int back) { return ((uint64_t)node << 16) | (uint32_t)back; };
  auto& s = nodes[srcNode];
  for (auto& e : adj[srcNode]) {
    auto& b = nodes[e.v];
    double h = atan2(-(b.first - s.first), -(b.second - s.second));
    uint64_t k = key(e.v, srcNode);
    double t = costTurn(fabs(wrap(h - srcH) * 180 / M_PI)) + dtU(e.L);
    auto it = best.find(k);
    if (it == best.end() || t < it->second) { best[k] = t; hdgOf[k] = h; pq.push({t, k}); }
  }
  while (!pq.empty()) {
    auto [ticks, k] = pq.top(); pq.pop();
    auto it = best.find(k);
    if (it == best.end() || ticks > it->second + 1e-9) continue;
    int cur = (int)(k >> 16), back = (int)(k & 0xFFFF);
    auto& a = nodes[cur];
    double ph = hdgOf[k];
    for (auto& e : adj[cur]) {
      if (e.v == back) continue;
      auto& b = nodes[e.v];
      double h = atan2(-(b.first - a.first), -(b.second - a.second));
      uint64_t nk = key(e.v, cur);
      double t = ticks + costTurn(fabs(wrap(h - ph) * 180 / M_PI)) + dtU(e.L);
      auto nit = best.find(nk);
      if (nit == best.end() || t < nit->second) { best[nk] = t; hdgOf[nk] = h; pq.push({t, nk}); }
    }
  }
  vector<Rec> byNode((size_t)n, Rec{0, 0, false});
  for (auto& kv : best) {
    int node = (int)(kv.first >> 16);
    auto& cur = byNode[node];
    if (!cur.ok || kv.second < cur.ticks) cur = Rec{kv.second, hdgOf[kv.first], true};
  }
  if (!byNode[srcNode].ok) byNode[srcNode] = Rec{0, srcH, true};
  return byNode;
}

// ---- resOf 缓存（瘦体；超限整清）----
static const int RES_CAP = 6000;
static unordered_map<uint32_t, vector<Rec>> RES;
static const vector<Rec>& resOf(int pid, int done, int holdIdx) {
  uint32_t key = (uint32_t)pid | ((uint32_t)done << 10) | ((uint32_t)holdIdx << 26);
  auto it = RES.find(key);
  if (it != RES.end()) return it->second;
  auto r = searchFrom(nodeOfPoint[pid], pts[pid].hNull ? 0 : pts[pid].h, done, holdIdx);
  if ((int)RES.size() >= RES_CAP) RES.clear();
  return RES.emplace(key, std::move(r)).first->second;
}

static double costToPt(int fromPid, int toPid, int done, int holdIdx) {
  const auto& r = resOf(fromPid, done, holdIdx);
  int nid = nodeOfPoint[toPid];
  const Pt& dst = pts[toPid];
  if (nid < 0 || nid >= (int)r.size() || !r[nid].ok) return INFINITY;
  double hdg = r[nid].hdg;
  double dAl1 = dst.hNull ? 0 : fabs(wrap(dst.h - hdg) * 180 / M_PI);
  double dAl = dst.hNull ? 0 : min(dAl1, 180.0 - dAl1);
  double extra = dst.hNull ? 0 : (!dst.aTolNull && dAl <= dst.aTol ? 0 : costTurn(dAl));
  return r[nid].ticks + extra;
}

// ---- 顺序搜索 ----
// 状态 key 位布局：cp[0..2] done[3..18] nhold[19..23] at[24..32]（N<=30, at<=511）
static inline uint64_t skey(int cp, int done, int nhold, int at) {
  return (uint64_t)cp | ((uint64_t)done << 3) | ((uint64_t)nhold << 19) | ((uint64_t)at << 24);
}

int main(int argc, char** argv) {
  if (argc < 3) { fprintf(stderr, "usage: solve2d <dump> <out.json>\n"); return 2; }
  ifstream in(argv[1]);
  if (!in) { fprintf(stderr, "cannot open dump\n"); return 2; }
  string line;
  auto tabs = [](const string& s, vector<string>& out) {
    out.clear(); size_t p = 0;
    for (;;) { size_t q = s.find('\t', p); if (q == string::npos) { out.push_back(s.substr(p)); break; } out.push_back(s.substr(p, q - p)); p = q + 1; }
  };
  vector<string> f;
  int ri = 0;
  while (getline(in, line)) {
    if (line.empty()) continue;
    tabs(line, f);
    const string& t = f[0];
    if (t == "PARAMS") {
      P_BUCKET = stod(f[10]);
      P_MAXL = stod(f[3]); P_MAXL_TASK = stod(f[4]);
      P_MARGIN = stod(f[6]); P_ANCHOR = stod(f[7]);
    } else if (t == "S") {
      segs.push_back({stod(f[1]), stod(f[2]), stod(f[3]), stod(f[4]), stod(f[5])});
    } else if (t == "ROADS") {
      // 头行只给数量，R 行随后
    } else if (t == "R") {
      (void)f; // widths 不再需要（节点已由 JS 采样导出）；跳过坐标行
      getline(in, line);
    } else if (t == "PKGS") {
      pkgs.resize(stoul(f[1]));
    } else if (t == "P") {
      int k = stoi(f[1]);
      Pkg& p = pkgs[k];
      p.id = f[2]; p.x = stod(f[3]); p.z = stod(f[4]);
      p.rFull = stod(f[6]); p.rPhys = stod(f[7]);
      p.obs = f[8] == "1"; p.bit = stoi(f[9]);
    } else if (t == "CARRY") {
      carryIds.push_back(f[2]);
    } else if (t == "T") {
      Pt p;
      p.x = stod(f[2]); p.z = stod(f[3]);
      p.hNull = (f[4] == "null"); p.h = p.hNull ? 0 : stod(f[4]);
      p.kind = stoi(f[5]);
      p.pkg = (f[6] == "-") ? "" : f[6];
      p.aTolNull = (f[7] == "null"); p.aTol = p.aTolNull ? 0 : stod(f[7]);
      p.label = f[9];
      pts.push_back(std::move(p));
    } else if (t == "G") {
      int n = stoi(f[1]);
      vector<int> g; g.reserve(n);
      for (int i = 0; i < n; i++) g.push_back(stoi(f[2 + i]));
      gates.push_back(std::move(g));
    } else if (t == "B" || t == "D") {
      vector<int> arr;
      for (size_t i = 2; i < f.size(); i++) arr.push_back(stoi(f[i]));
      (t == "B" ? famB : famD)[f[1]] = std::move(arr);
    } else if (t == "N") {
      int id = stoi(f[1]);
      if (id >= (int)nodes.size()) nodes.resize(id + 1, {-1e9, -1e9});
      nodes[id] = {stod(f[2]), stod(f[3])};
    } else if (t == "NODEOFPOINT") {
      // 头行 "NODEOFPOINT\tN" 仅计数；真正的数据是下一行纯数字（无 tag）
    } else if (t[0] >= '0' && t[0] <= '9') {
      // NODEOFPOINT 数据行：纯 tab 分隔整数
      for (auto& x : f) nodeOfPoint.push_back(stoi(x));
    }
  }
  // carryIdx 重建（pkgs 下标）+ bit 对齐 carry 序
  for (auto& id : carryIds) {
    int k = -1;
    for (int i = 0; i < (int)pkgs.size(); i++) if (pkgs[i].id == id) { k = i; break; }
    if (k < 0) { fprintf(stderr, "carry id not found: %s\n", id.c_str()); return 2; }
    pkgs[k].bit = (int)carryIdx.size();
    carryIdx.push_back(k);
  }
  if (nodeOfPoint.size() != pts.size()) { fprintf(stderr, "NODEOFPOINT size %zu != pts %zu\n", nodeOfPoint.size(), pts.size()); return 2; }
  for (int nid : nodeOfPoint) if (nid < 0 || nid >= (int)nodes.size()) { fprintf(stderr, "nodeOfPoint out of range: %d\n", nid); return 2; }
  int N = (int)carryIds.size(), FULL = (1 << N) - 1;
  int goalPid = -1;
  for (size_t i = 0; i < pts.size(); i++) if (pts[i].kind == 1) { goalPid = (int)i; break; }
  if (goalPid < 0) { fprintf(stderr, "no goal point\n"); return 2; }

  // 桶（marginAt 用）
  for (int si = 0; si < (int)segs.size(); si++) {
    Seg& s = segs[si];
    int x0 = (int)floor(min(s.ax, s.bx) / P_BUCKET), x1 = (int)floor(max(s.ax, s.bx) / P_BUCKET);
    int z0 = (int)floor(min(s.az, s.bz) / P_BUCKET), z1 = (int)floor(max(s.az, s.bz) / P_BUCKET);
    for (int i = x0; i <= x1; i++) for (int j = z0; j <= z1; j++) buckets[bkey(i, j)].push_back(si);
  }

  int nN = (int)nodes.size();
  isTaskNode.assign(nN, 0);
  pidsOfNode.assign(nN, {});
  pkgOfPid.assign(pts.size(), -1);
  for (size_t i = 0; i < nodeOfPoint.size(); i++) {
    isTaskNode[nodeOfPoint[i]] = 1;
    pidsOfNode[nodeOfPoint[i]].push_back((int)i);
    if (!pts[i].pkg.empty())
      for (int k = 0; k < (int)pkgs.size(); k++) if (pkgs[k].id == pts[i].pkg) { pkgOfPid[i] = k; break; }
  }

  // ---- 边枚举 ----
  auto t0 = chrono::steady_clock::now();
  for (int i = 0; i < nN; i++) {
    double ax = nodes[i].first, az = nodes[i].second;
    for (int j = i + 1; j < nN; j++) {
      double bx = nodes[j].first, bz = nodes[j].second;
      double L = hypot(bx - ax, bz - az);
      bool anchorish = isTaskNode[i] || isTaskNode[j];
      double capL = anchorish ? P_MAXL_TASK : P_MAXL;
      if (L < 1e-9 || L > capL) continue;
      double margin = anchorish ? P_ANCHOR : P_MARGIN;
      uint64_t igMask = 0;
      for (int pid : pidsOfNode[i]) if (pkgOfPid[pid] >= 0) igMask |= 1ULL << pkgOfPid[pid];
      for (int pid : pidsOfNode[j]) if (pkgOfPid[pid] >= 0) igMask |= 1ULL << pkgOfPid[pid];
      Seg ab{ax, az, bx, bz, 0};
      vector<int> near;
      for (int k = 0; k < (int)pkgs.size(); k++) {
        double r = ((igMask >> k) & 1) ? pkgs[k].rPhys : pkgs[k].rFull;
        if (segDistSeg(pkgs[k].x, pkgs[k].z, ab) < r) near.push_back(k);
      }
      double req = margin >= P_MARGIN - 1e-12 ? 0.0005 : -0.0005;
      int n = max(2, (int)ceil(L / 0.002));
      uint64_t hit = 0; bool fail = false;
      for (int k = 0; k <= n && !fail; k++) {
        double t = (double)k / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        if (marginAt(px, pz) < req) { fail = true; break; }
        for (int bi : near) {
          double r = ((igMask >> bi) & 1) ? pkgs[bi].rPhys : pkgs[bi].rFull;
          if (hypot(pkgs[bi].x - px, pkgs[bi].z - pz) < r) hit |= 1ULL << bi;
        }
      }
      if (fail) continue;
      edgeRecs.push_back({i, j, L, hit});
    }
  }
  printf("候选边 %zu（建边 %.1fs，节点 %d）\n", edgeRecs.size(),
         chrono::duration<double>(chrono::steady_clock::now() - t0).count(), nN);
  fflush(stdout);

  // ---- 诊断 ----
  auto reach = [&](int done, int holdIdx) {
    const auto& adj = adjT(done, holdIdx);
    vector<char> seen(nN, 0);
    int src = nodeOfPoint[0];
    seen[src] = 1;
    vector<int> q{src};
    while (!q.empty()) { int c = q.back(); q.pop_back();
      for (auto& e : adj[c]) if (!seen[e.v]) { seen[e.v] = 1; q.push_back(e.v); } }
    return seen;
  };
  {
    const char* tags[] = {"空手全堆", "拿t1", "t1已送", "全送"};
    int t1bit = -1;
    for (int i = 0; i < N; i++) if (carryIds[i].find("target-1") != string::npos) t1bit = i;
    int cfg[4][2];
    cfg[0][0] = 0;            cfg[0][1] = N;
    cfg[1][0] = 0;            cfg[1][1] = t1bit;
    cfg[2][0] = FULL & ~(1 << t1bit); cfg[2][1] = N;
    cfg[3][0] = FULL;         cfg[3][1] = N;
    for (int c = 0; c < 4; c++) {
      auto seen = reach(cfg[c][0], cfg[c][1]);
      string miss;
      for (size_t i = 0; i < pts.size(); i++)
        if (pts[i].kind != 0 && !seen[nodeOfPoint[i]]) miss += pts[i].label + " ";
      printf("[诊断] %s 不可达: %s\n", tags[c], miss.empty() ? "无" : miss.c_str());
    }
  }
  fflush(stdout);

  // ---- 顺序搜索（v6 语义：族 min 计价、at=锚点、cp at=圆心）----
  auto tS = chrono::steady_clock::now();
  struct QItem { double t; uint64_t k; };
  struct QCmp { bool operator()(const QItem& a, const QItem& b) const { return a.t > b.t; } };
  unordered_map<uint64_t, double> bestS;
  unordered_map<uint64_t, uint64_t> prevK;
  priority_queue<QItem, vector<QItem>, QCmp> pq;
  bool hasGoal = false; double goalT = 0; uint64_t goalKey = 0;
  auto pushS = [&](double t, uint64_t k) { pq.push({t, k}); };
  uint64_t k0 = skey(0, 0, N, 0);
  bestS[k0] = 0; prevK[k0] = 0;
  pushS(0, k0);
  long long pops = 0;
  while (!pq.empty()) {
    auto cur = pq.top(); pq.pop();
    pops++;
    auto bit = bestS.find(cur.k);
    if (bit == bestS.end() || cur.t > bit->second + 1e-9) continue;
    int cp = (int)(cur.k & 7);
    int done = (int)((cur.k >> 3) & 0xFFFF);
    int nhold = (int)((cur.k >> 19) & 0x1F);
    int at = (int)((cur.k >> 24) & 0x1FF);
    if (nhold > N) nhold = N;
    if (cp >= (int)gates.size() && done == FULL && nhold == N) {
      double tot = cur.t + costToPt(at, goalPid, done, nhold);
      if (!hasGoal || tot < goalT) { hasGoal = true; goalT = tot; goalKey = cur.k; }
      continue;
    }
    struct Cand { int kind; int to; int ncp, ndone, nhold; int cpIdx; const vector<int>* fam; };
    vector<Cand> moves; moves.reserve(8 + N);
    if (cp < (int)gates.size()) moves.push_back({0, -1, cp + 1, done, nhold, cp, nullptr});
    if (nhold < N) {
      const string& pkgId = carryIds[nhold];
      auto it = famD.find(pkgId);
      const vector<int>* fam = it != famD.end() ? &it->second : nullptr;
      int anchor = fam ? (*fam)[0] : -1;
      if (anchor < 0) for (size_t i = 0; i < pts.size(); i++) if (pts[i].kind == 3 && pts[i].pkg == pkgId) { anchor = (int)i; break; }
      moves.push_back({1, anchor, cp, done | (1 << nhold), N, -1, fam});
    } else {
      for (int bi = 0; bi < N; bi++) {
        if (done & (1 << bi)) continue;
        const string& pkgId = carryIds[bi];
        auto it = famB.find(pkgId);
        const vector<int>* fam = it != famB.end() ? &it->second : nullptr;
        int anchor = fam ? (*fam)[0] : -1;
        if (anchor < 0) for (size_t i = 0; i < pts.size(); i++) if (pts[i].kind == 2 && pts[i].pkg == pkgId) { anchor = (int)i; break; }
        moves.push_back({2, anchor, cp, done, bi, -1, fam});
      }
    }
    for (auto& m : moves) {
      double cost; int atAfter;
      if (m.kind == 0) {
        const vector<int>& g = gates[m.cpIdx];
        double bc = INFINITY;
        for (int pid : g) { double c = costToPt(at, pid, done, nhold); if (c < bc) bc = c; }
        cost = bc; atAfter = g[0];          // 圆心锚（缩 fromPid 集合 → 缓存命中率）
      } else {
        int ha = m.kind == 1 ? nhold : N;    // drop: hold=cur.hold（堆消失）；grab: null
        double bc = INFINITY;
        if (m.fam) {
          for (int pid : *m.fam) { double c = costToPt(at, pid, done, ha); if (c < bc) bc = c; }
        } else if (m.to >= 0) {
          bc = costToPt(at, m.to, done, ha);
        }
        cost = bc; atAfter = m.to;           // at 记基线锚点（v6 语义）
      }
      if (!isfinite(cost)) continue;
      double nt = cur.t + cost;
      uint64_t nk = skey(m.ncp, m.ndone, m.nhold, atAfter);
      auto nit = bestS.find(nk);
      if (nit == bestS.end() || nt < nit->second - 1e-9) {
        bestS[nk] = nt; prevK[nk] = cur.k;
        pushS(nt, nk);
      }
    }
    if (pops % 20000 == 0) {
      printf("  ...pops=%lld states=%zu res=%zu (%.0fs)\n", pops, bestS.size(), RES.size(),
             chrono::duration<double>(chrono::steady_clock::now() - tS).count());
      fflush(stdout);
    }
  }
  if (!hasGoal) { printf("无解\n"); return 1; }
  // 回溯
  vector<uint64_t> seqK;
  uint64_t k = goalKey;
  while (true) {
    seqK.push_back(k);
    if (k == k0) break;
    auto it = prevK.find(k);
    if (it == prevK.end()) break;
    k = it->second;
  }
  reverse(seqK.begin(), seqK.end());
  printf("完成 %.1fs，pops=%lld states=%zu\n",
         chrono::duration<double>(chrono::steady_clock::now() - tS).count(), pops, bestS.size());

  const int INT = 288;
  long long ticks = (long long)llround(goalT);
  int totalTicks = (int)ticks + INT;
  printf("\n=== 最优序列 ===\n");
  for (size_t i = 0; i < seqK.size(); i++) {
    int at = (int)((seqK[i] >> 24) & 0x1FF);
    int cp = (int)(seqK[i] & 7);
    int nh = (int)((seqK[i] >> 19) & 0x1F);
    printf("  %2zu %-22s cp已过=%d 手持=%s\n", i, pts[at].label.c_str(), cp,
           nh < N ? carryIds[nh].c_str() : "空");
  }
  printf("\n行驶+转向 %lld + 交互 %d = %d tick = %.2fs\n", ticks, INT, totalTicks, totalTicks * 0.02);
  printf("满分线 124.8s = 6240 tick，%s\n", totalTicks <= 6240 ? "✅ 达标" : "❌ 差");

  auto jesc = [](const string& s) { string o; for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; } return o; };
  ofstream out(argv[2]);
  out << "{\n \"ticks\": " << ticks << ",\n \"total\": " << totalTicks << ",\n \"seq\": [\n";
  for (size_t i = 0; i < seqK.size(); i++) {
    int at = (int)((seqK[i] >> 24) & 0x1FF);
    int cp = (int)(seqK[i] & 7);
    int done = (int)((seqK[i] >> 3) & 0xFFFF);
    int nh = (int)((seqK[i] >> 19) & 0x1F);
    out << "  { \"label\": \"" << jesc(pts[at].label) << "\", \"pid\": " << at
        << ", \"cp\": " << cp << ", \"done\": " << done << ", \"hold\": ";
    if (nh < N) out << "\"" << jesc(carryIds[nh]) << "\""; else out << "null";
    out << " }" << (i + 1 < seqK.size() ? "," : "") << "\n";
  }
  out << " ]\n}\n";
  printf("已写 %s\n", argv[2]);
  return 0;
}
