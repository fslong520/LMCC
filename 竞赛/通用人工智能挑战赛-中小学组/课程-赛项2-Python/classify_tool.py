#!/usr/bin/env python3
"""识物工坊人工分类工具
用法:
  python3 classify_tool.py scan <目录1> [目录2 ...] [--out 工作台目录] [--seed 旧审阅.json] [--inplace]
      # r7-B 预分拣全部目录, 生成 <工作台>/review.html 快审页 (默认 工作台=课程目录/快审工作台)
      # --seed 可把上次导出的 JSON 预置为已审状态, 避免重审
      # --inplace 连 橙子/非橙子/垃圾 子目录一起扫, 且不跨目录搬移 (供已归档池做二次筛)
  python3 classify_tool.py apply <工作台目录> [分类结果.json]
      # 应用快审导出的 JSON, 把图片移入各自来源目录下的 橙子/非橙子/垃圾/
快审页: 浏览器打开 review.html, 1=橙 2=非橙 3=垃圾(废图), ←→切换(自动跳过已审), u=撤销, 「导出分类结果」下载 JSON。
已审标记: 已审图带彩色边框 + 右上角「✓橙子/✓非橙子/✗垃圾」大标 + 顶栏胶囊标签;
          顶部进度条是分布图(橙/非橙/垃圾/未审各一色), 点击可跳到任意位置回看。
进度不丢: 每笔判定即写 localStorage(键含页面路径), 刷新/误关后再开自动恢复, 顶栏「已存档 N」为证。
未审图片原地不动; 特征缓存 _classify_cache.json 跨次复用。
依赖: tensorflow-cpu + pillow + numpy（本机 ~/.venvs/lmcc-tf）
"""
import os, sys, json, zipfile, shutil
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import numpy as np

BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_ZIP = os.path.join(BASE, '赛项2定版_r7_真实86', '识物模型_r7B_平台90_真实86.zip')
IMG_EXT = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')
SORT_DIRS = ('橙子', '非橙子', '垃圾')
DEFAULT_OUT = os.path.join(BASE, '快审工作台')
CACHE_F = os.path.join(BASE, '_classify_cache.json')

# ---------- r7-B 模型 ----------
def load_r7b():
    z = zipfile.ZipFile(MODEL_ZIP)
    mj = json.loads(z.read('model.json')); off = 0; Ps = {}
    for w in mj['weightsManifest'][0]['weights']:
        n = int(np.prod(w['shape']))
        Ps[w['name']] = np.frombuffer(z.read('weights.bin'), dtype='<f4', count=n,
                                      offset=off).reshape(w['shape']); off += n * 4
    W1 = [v for k, v in Ps.items() if k.endswith('kernel') and v.shape[0] == 1280][0]
    b1 = [v for k, v in Ps.items() if k.endswith('bias') and v.shape[0] == 100][0]
    W2 = [v for k, v in Ps.items() if k.endswith('kernel') and v.shape[0] == 100][0]
    b2 = [v for k, v in Ps.items() if k.endswith('bias') and v.shape[0] == 2][0]
    return W1, b1, W2, b2

def predict(F, m):
    W1, b1, W2, b2 = m
    h = np.maximum(F @ W1 + b1, 0); lg = h @ W2 + b2
    p = np.exp(lg - lg.max(axis=1, keepdims=True))
    return (p / p.sum(axis=1, keepdims=True))[:, 0]  # 橙子概率

# ---------- tf 特征（磁盘缓存, key=绝对路径, 跨次复用）----------
def extract_feats(paths, cache):
    import tensorflow as tf
    from tensorflow.keras.applications import MobileNetV2
    from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
    from PIL import Image, ImageOps
    model = MobileNetV2(alpha=0.5, include_top=False, pooling='avg', weights='imagenet')
    miss = [p for p in paths if p not in cache]
    print(f'待提特征 {len(miss)} 张（已缓存 {len(paths)-len(miss)}）', flush=True)
    for i, p in enumerate(miss):
        try:
            im = ImageOps.exif_transpose(Image.open(p)).convert('RGB'); im.thumbnail((224, 224))
            x = preprocess_input(np.array(im, dtype=np.float32))
            v = model.predict(x[None], verbose=0)[0]
        except Exception:
            v = np.zeros(1280, dtype=np.float32)
        cache[p] = v.astype(np.float32).tolist()
        if i % 20 == 0:
            print(f'  {i}/{len(miss)}', flush=True)
    return np.array([cache[p] for p in paths])

def walk_imgs(root, include_sorted=False):
    """include_sorted=True 时连 橙子/非橙子/垃圾 子目录一起走（用于对已归档池做二筛）"""
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        if not include_sorted:
            dirnames[:] = [d for d in dirnames if d not in SORT_DIRS and not d.startswith('.')]
        else:
            dirnames[:] = [d for d in dirnames if not d.startswith('.')]
        for fn in sorted(filenames):
            if fn.lower().endswith(IMG_EXT):
                out.append((root, os.path.relpath(os.path.join(dirpath, fn), root),
                            os.path.abspath(os.path.join(dirpath, fn))))
    return out

# ---------- scan ----------
def cmd_scan(roots, outdir, seed_f=None, inplace=False):
    items = []
    for r in roots:
        r = os.path.abspath(r)
        items += walk_imgs(r, include_sorted=inplace)
    if not items:
        print('目录无图片'); sys.exit(1)
    paths = [p for _, _, p in items]
    cache = json.load(open(CACHE_F)) if os.path.exists(CACHE_F) else {}
    F = extract_feats(paths, cache)
    json.dump(cache, open(CACHE_F, 'w'))
    p = predict(F, load_r7b())
    entries = []
    for (root, rel, full), po in zip(items, p):
        pred = '橙子' if po > 0.5 else '非橙子'
        entries.append({'id': full, 'root': os.path.dirname(full) if inplace else root,
                        'rel': rel, 'pred': pred, 'p': round(float(po), 3),
                        'unc': round(abs(float(po) - 0.5) * 2, 3)})
    if inplace:  # 原地二筛：按原目录序排，不打乱
        entries.sort(key=lambda x: x['id'])
    else:
        entries.sort(key=lambda x: x['unc'])  # 最不确定优先审
    seed = {}
    if seed_f and os.path.exists(seed_f):
        seed = json.load(open(seed_f))
        while isinstance(seed, str):
            seed = json.loads(seed)
        ids = {e['id'] for e in entries}
        seed = {k: v for k, v in seed.items() if k in ids}
    n_o = sum(1 for x in entries if x['pred'] == '橙子')
    os.makedirs(outdir, exist_ok=True)
    manifest = {'roots': [os.path.abspath(r) for r in roots], 'total': len(entries),
                'pred_orange': n_o, 'pred_not': len(entries) - n_o, 'items': entries,
                'decisions': seed}
    json.dump(manifest, open(os.path.join(outdir, '_manifest.json'), 'w'),
              ensure_ascii=False, indent=1)
    write_review(outdir, manifest)
    print(f'扫描完成: {len(entries)} 张（{len(roots)} 个目录）, 模型预判 橙 {n_o} / 非橙 {len(entries)-n_o}')
    if seed:
        print(f'已预置 {len(seed)} 条旧审阅结果')
    print(f'打开快审页: file://{outdir}/review.html')
    print('审完点「导出分类结果」, 再跑: classify_tool.py apply', outdir)

def write_review(outdir, m):
    data = json.dumps(m, ensure_ascii=False)
    html = f"""<!DOCTYPE html><html lang=zh><head><meta charset=utf-8>
<title>识物工坊·人工分类</title><style>
body{{font-family:system-ui;background:#14161a;color:#e8e8e8;margin:0}}
#bar{{position:fixed;top:0;left:0;right:0;background:#1e2128;padding:10px 16px;
display:flex;gap:18px;align-items:center;z-index:9;border-bottom:1px solid #333}}
#stage{{height:72vh;display:flex;align-items:center;justify-content:center;padding:56px 8px 8px}}
#img{{max-width:94vw;max-height:70vh;border:1px solid #444;box-shadow:0 0 24px #0008}}
#info{{position:fixed;bottom:0;left:0;right:0;background:#1e2128;padding:10px 16px;
display:flex;gap:16px;align-items:center;z-index:9;border-top:1px solid #333;font-size:14px}}
kbd{{background:#333;border:1px solid #555;border-radius:4px;padding:1px 7px;font-size:13px}}
.tag{{padding:2px 9px;border-radius:10px;font-size:13px}}
.o{{background:#7a4a00;color:#ffcf80}}.n{{background:#004a4a;color:#80e0e0}}
#prog{{flex:2;height:11px;background:#333;border-radius:4px;overflow:hidden;cursor:pointer;display:block}}
button{{background:#345;border:none;color:#ddd;padding:6px 14px;border-radius:5px;
cursor:pointer;font-size:14px}}button:hover{{background:#467}}
#path{{font-size:12px;color:#999;max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
#mark{{position:fixed;top:52px;right:12px;padding:8px 20px;border-radius:8px;
font-size:22px;font-weight:700;z-index:10;box-shadow:0 3px 14px #000c;display:none}}
.mk-o{{background:#b96d00;color:#fff}}.mk-n{{background:#006e6e;color:#fff}}.mk-x{{background:#8a1f1f;color:#fff}}
#img.already{{border-width:5px}}
#img.b-o{{border-color:#ffae42;box-shadow:0 0 26px #ffae4266}}
#img.b-n{{border-color:#3fd0d0;box-shadow:0 0 26px #3fd0d066}}
#img.b-x{{border-color:#ff5252;box-shadow:0 0 26px #ff525266}}
#cur{{font-size:13px;padding:3px 10px;border-radius:10px;background:#333;color:#aaa}}
</style></head><body>
<div id=bar>
 <span id=t></span>
 <span class="tag n" id=predtag></span>
 <span>置信 <b id=p></b></span>
 <span id=prog><canvas id=map width=1200 height=11 style="width:100%;height:100%"></canvas></span>
 <span id=cur></span>
 <span id=saved style="font-size:12px;color:#8a8"></span>
 <button onclick=undo()>↩ 撤销(u)</button>
 <button onclick=exportJ()>💾 导出分类结果</button>
</div>
<div id=mark></div>
<div id=stage><img id=img></div>
<div id=info>
 <span><kbd>1</kbd> 橙子</span><span><kbd>2</kbd> 非橙子</span><span><kbd>3</kbd> 垃圾/废图</span>
 <span><kbd>←</kbd><kbd>→</kbd> 切换</span>
 <span id=path></span>
 <span id=stat></span>
</div>
<script>
const M = {data};
let i = 0; const D = M.items; const dec = {{}};
for (let k=0;k<D.length;k++) dec[D[k].id] = null;  // null=未审
const SEED = M.decisions || {{}};
for (const k in SEED) if (k in dec) dec[k] = SEED[k];   // 预置旧审阅
// ---- 本地自动存档: 刷新/误关不丢进度 (key 按页面路径区分) ----
const LSKEY = 'lmcc_review:' + location.pathname;
function snapshot() {{
  const out = {{}}; for (const k in dec) if (dec[k]!==null) out[k]=dec[k];
  return out;
}}
function saveLocal() {{
  const out = snapshot();
  try {{ localStorage.setItem(LSKEY, JSON.stringify(out)); }} catch(e) {{}}
  const el = document.getElementById('saved');
  if (el) el.textContent = '已存档 ' + Object.keys(out).length;
}}
function loadLocal() {{
  try {{
    const s = JSON.parse(localStorage.getItem(LSKEY) || '{{}}');
    let n = 0;
    for (const k in s) if (k in dec) {{ dec[k] = s[k]; n++; }}
    return n;
  }} catch(e) {{ return 0; }}
}}
const nLocal = loadLocal();
// ---- 进度分布图: 每位一像素条, 色=已审结果, 灰=未审, 白框=当前位置 ----
const CV = document.getElementById('map'), CX = CV.getContext('2d');
function drawMap() {{
  const W = CV.width, H = CV.height;
  CX.fillStyle = '#2a2d33'; CX.fillRect(0,0,W,H);
  const cw = W / D.length;
  for (let k=0;k<D.length;k++) {{
    const v = dec[D[k].id];
    if (v===null) continue;
    CX.fillStyle = v==='橙子' ? '#ffae42' : v==='非橙子' ? '#3fd0d0' : '#ff5252';
    CX.fillRect(k*cw, 0, Math.max(cw, 1), H);
  }}
  CX.fillStyle = '#fff'; CX.fillRect(i*cw, 0, Math.max(cw*3, 2), H);
}}
document.getElementById('prog').addEventListener('click', e => {{
  const r = e.currentTarget.getBoundingClientRect();
  i = Math.min(D.length-1, Math.max(0, Math.floor((e.clientX-r.left)/r.width*D.length)));
  show();
}});
function show() {{
  const it = D[i];
  const img = document.getElementById('img');
  img.src = it.id;
  document.getElementById('t').textContent = (i+1)+' / '+D.length;
  const tag = document.getElementById('predtag');
  tag.textContent = '预判 '+it.pred; tag.className = 'tag '+(it.pred==='橙子'?'o':'n');
  document.getElementById('p').textContent = it.p.toFixed(2);
  document.getElementById('path').textContent = it.rel;
  // ---- 已审标记：切回旧图一眼看出已改过 ----
  const cur = dec[it.id];
  const mk = document.getElementById('mark');
  img.className = '';
  if (cur === null) {{
    mk.style.display = 'none';
    document.getElementById('cur').textContent = '未审';
    document.getElementById('cur').style.background = '#333';
    document.getElementById('cur').style.color = '#aaa';
  }} else {{
    const glyph = cur==='橙子' ? '✓ 橙子' : cur==='非橙子' ? '✓ 非橙子' : '✗ 垃圾';
    const k = cur==='橙子' ? 'o' : cur==='非橙子' ? 'n' : 'x';
    mk.textContent = glyph; mk.className = 'mk-'+k; mk.style.display = 'block';
    img.className = 'already b-'+k;
    const cc = cur==='橙子' ? '#ffae42' : cur==='非橙子' ? '#3fd0d0' : '#ff5252';
    document.getElementById('cur').textContent = '已审: '+glyph;
    document.getElementById('cur').style.background = cc;
    document.getElementById('cur').style.color = '#111';
  }}
  const done = Object.values(dec).filter(v=>v!==null).length;
  drawMap();
  document.getElementById('stat').textContent = '已审 '+done+' | 橙 '
    +Object.values(dec).filter(v=>v==='橙子').length
    +' | 非橙 '+Object.values(dec).filter(v=>v==='非橙子').length
    +' | 垃圾 '+Object.values(dec).filter(v=>v==='垃圾').length;
}}
function set(v) {{ dec[D[i].id] = v; saveLocal(); next(); }}
function next() {{ // 跳到下一个未审
  for (let s=1;s<=D.length;s++) {{ const j=(i+s)%D.length;
    if (dec[D[j].id]===null) {{ i=j; show(); return; }} }}
  i = Math.min(i+1, D.length-1); show();
}}
function move(d) {{ // 方向键: 跳过已审, 只在未审图之间移动 (要回看已审图点进度条)
  for (let s=1;s<=D.length;s++) {{ const j=(i+d*s+D.length*100)%D.length;
    if (dec[D[j].id]===null) {{ i=j; show(); return; }} }}
  i=(i+d+D.length)%D.length; show();
}}
function undo() {{ // 撤销最近一次
  for (let s=1;s<=D.length;s++) {{ const j=(i-s+D.length*2)%D.length;
    if (dec[D[j].id]!==null) {{ dec[D[j].id]=null; saveLocal(); i=j; show(); return; }} }}
}}
function exportJ() {{
  const out = snapshot();
  const n = Object.keys(out).length;
  if (!n) {{ alert('还没有已审图片'); return; }}
  const b = new Blob([JSON.stringify(out,null,1)],{{type:'application/json'}});
  const a = document.createElement('a'); a.href=URL.createObjectURL(b);
  a.download='分类结果.json'; a.click();
}}
document.addEventListener('keydown', e => {{
  if (e.key==='1') set('橙子'); else if (e.key==='2') set('非橙子');
  else if (e.key==='3') set('垃圾'); else if (e.key==='ArrowRight') move(1);
  else if (e.key==='ArrowLeft') move(-1); else if (e.key==='u'||e.key==='U') undo();
}});
window.addEventListener('beforeunload', saveLocal);
setInterval(saveLocal, 5000);
if (nLocal) console.log('已从本地存档恢复 '+nLocal+' 条');
// 开页直接落到第一个未审图, 不用手动翻过已审区
if (dec[D[0].id] !== null) {{ for (let k=0;k<D.length;k++) if (dec[D[k].id]===null) {{ i=k; break; }} }}
saveLocal();
show();
</script></body></html>"""
    open(os.path.join(outdir, 'review.html'), 'w').write(html)

# ---------- apply ----------
def cmd_apply(workdir, dec_f=None):
    workdir = os.path.abspath(workdir)
    if dec_f is None:
        # 依次找: 工作台/分类结果.json -> 工作台/_rescue_*.json(页面存档救出) -> ~/下载/分类结果.json
        cands = [os.path.join(workdir, '分类结果.json')]
        import glob as _glob
        cands += sorted(_glob.glob(os.path.join(workdir, '_rescue_*.json')))
        cands.append(os.path.expanduser('~/下载/分类结果.json'))
        dec_f = next((c for c in cands if os.path.exists(c)), cands[0])
        print('分类结果来源:', dec_f)
    if not os.path.exists(dec_f):
        print('未找到 分类结果.json（可传第二参数指定路径）'); sys.exit(1)
    dec = json.load(open(dec_f))
    while isinstance(dec, str):  # 防双重编码
        dec = json.loads(dec)
    man_f = os.path.join(workdir, '_manifest.json')
    id2root = {}
    if os.path.exists(man_f):
        for it in json.load(open(man_f))['items']:
            id2root[it['id']] = it['root']
    stats = {}
    for fid, cls in dec.items():
        if not os.path.exists(fid):
            print('缺文件跳过:', fid); continue
        root = id2root.get(fid) or os.path.dirname(fid)
        dst_dir = os.path.join(root, cls)
        os.makedirs(dst_dir, exist_ok=True)
        dst = os.path.join(dst_dir, os.path.basename(fid))
        k = 1
        while os.path.exists(dst):
            base, ext = os.path.splitext(os.path.basename(fid))
            dst = os.path.join(dst_dir, f'{base}_{k}{ext}'); k += 1
        shutil.move(fid, dst)
        stats[cls] = stats.get(cls, 0) + 1
    print('归档完成:', stats)
    print('未审图片原地不动; 下轮 scan 只提新增图特征')

if __name__ == '__main__':
    argv = sys.argv[1:]
    if not argv or argv[0] not in ('scan', 'apply'):
        print(__doc__); sys.exit(1)
    if argv[0] == 'scan':
        dirs = [a for a in argv[1:] if not a.startswith('--')]
        out = DEFAULT_OUT
        seed_f = None
        if '--out' in argv:
            out = argv[argv.index('--out') + 1]
            dirs = [d for d in dirs if d != out]
        if '--seed' in argv:
            seed_f = argv[argv.index('--seed') + 1]
            dirs = [d for d in dirs if d != seed_f]
        if not dirs:
            print(__doc__); sys.exit(1)
        cmd_scan(dirs, out, seed_f, inplace='--inplace' in argv)
    else:
        cmd_apply(argv[1] if len(argv) > 1 else DEFAULT_OUT,
                  argv[2] if len(argv) > 2 else None)
