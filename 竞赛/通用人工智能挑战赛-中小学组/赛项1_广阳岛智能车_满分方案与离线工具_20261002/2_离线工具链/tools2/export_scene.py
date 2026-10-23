#!/usr/bin/env python3
"""导出当前任务的权威场景数据（复用平台页面 JS API），供离线建模用。
用法: uv run tools2/export_scene.py <页码ID> <输出目录>
产物: scene_<任务名>.json  含 roads/checkpoints/goal/deliveries/start
      auth_<任务名>.json   含 world/sim/inter/packages/robotPose
"""
import subprocess, json, os, sys

PAGE = sys.argv[1] if len(sys.argv) > 1 else "0B4557E4C3B38D1BB66D038A49BF2B34"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/fslong/lmcc-gy3-route-opt/data2"
U = ["python3", "/home/fslong/.config/opencode/skills/urlgo/urlgo"]
env = dict(os.environ); env["PATH"] = "/usr/bin:/bin:/usr/local/bin"

def ev(js):
    r = subprocess.run(U + ["eval", PAGE, js], capture_output=True, text=True, env=env)
    return r.stdout.strip()

def fetch(js_expr, name):
    """把 JS 表达式的结果以 JSON 字符串挂到 window.__x，分片取回。"""
    setup = f'''(function(){{try{{
      window.__x = JSON.stringify({js_expr});
    }}catch(e){{window.__x="ERR "+e.message}} return (window.__x||"").length;}})()'''
    L = json.loads(ev(setup))
    if L <= 3:
        print(f"  {name}: 空或出错 ->", ev("window.__x"))
        return None
    parts = []
    for i in range(0, L, 1400):
        parts.append(json.loads(ev(f"window.__x.slice({i},{i+1400})")))
    s = "".join(parts)
    if s.startswith("ERR"):
        print(f"  {name}: {s}")
        return None
    return json.loads(s)

os.makedirs(OUT, exist_ok=True)

# 任务配置（含道路、检查点、交付）
mission = fetch('''(() => {
  const m = activeMission;
  return {
    taskId: m.taskId, mapId: m.mapId,
    start: m.start, goal: m.goal,
    checkpoints: (m.checkpoints||[]).map(c => ({id:c.id, label:c.label, position:c.position})),
    deliveries: m.deliveries || [],
    packageRadius: m.packageRadius,
    checkpointRadius: m.checkpointRadius,
    goalRadius: m.goalRadius,
    roads: (m.roads||[]),
    speedZones: m.speedZones||[],
    prohibitedZones: m.prohibitedZones||[],
    objective: m.objective || null
  };
})()''', "mission")
if mission:
    json.dump(mission, open(os.path.join(OUT, 'scene_mission.json'), 'w'), ensure_ascii=False, indent=1)
    print(f"  mission: taskId={mission.get('taskId')} 检查点={len(mission.get('checkpoints',[]))} 交付={len(mission.get('deliveries',[]))} 道路={len(mission.get('roads',[]))}")

auth = fetch('''(() => {
  const w = JSON.parse(JSON.stringify(simulationWorldDefinition({includePackages:true})));
  const s = JSON.parse(JSON.stringify(simulationDefinition()));
  const inter = JSON.parse(JSON.stringify(packageInteractionDefinition()));
  const pk = activeMission.packages.map(p => ({id:p.id,x:p.x,z:p.z,category:p.category||null,radius:p.radius||null}));
  return {world:w, sim:s, inter:inter, packages:pk,
          robotPose:{x:robotPose.x,z:robotPose.z,heading:robotPose.heading},
          missionStart:activeMission.start, goal:activeMission.goal,
          packageRadius:activeMission.packageRadius};
})()''', "auth")
if auth:
    json.dump(auth, open(os.path.join(OUT, 'auth_scene.json'), 'w'), ensure_ascii=False, indent=1)
    print(f"  auth: 包裹={len(auth.get('packages',[]))} 碰撞体={len(auth.get('world',{}).get('colliders',[]))}")
    print(f"  起点 {auth.get('robotPose')}")
    for p in auth.get('packages', []):
        print(f"    {p['id']:28s} ({p['x']:8.4f},{p['z']:8.4f}) {p['category']}")
