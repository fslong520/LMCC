#!/usr/bin/env python3
"""识物工坊人工分类工具
用法:
  python3 classify_tool.py scan <目录1> [目录2 ...] [--out 工作台目录]
      # r7-B 预分拣全部目录, 生成 <工作台>/review.html 快审页 (默认 工作台=课程目录/快审工作台)
  python3 classify_tool.py apply <工作台目录> [分类结果.json]
      # 应用快审导出的 JSON, 把图片移入各自来源目录下的 橙子/非橙子/垃圾/
快审页: 浏览器打开 review.html, 1=橙 2=非橙 3=垃圾(废图), ←→切换, u=撤销, 「导出分类结果」下载 JSON。
未审图片原地不动; 特征缓存 _classify_cache.json 跨次复用。
"""
import os, sys, json, zipfile, shutil
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import numpy as np

BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_ZIP = '/home/fslong/桌面/赛项2最终版_真实86/【提交用】识物模型_真实86分.zip'
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

def walk_imgs(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SORT_DIRS and not d.startswith('.')]
        for fn in sorted(filenames):
            if fn.lower().endswith(IMG_EXT):
                out.append((root, os.path.relpath(os.path.join(dirpath, fn), root),
                            os.path.abspath(os.path.join(dirpath, fn))))
    return out

# ---------- scan ----------
def cmd_scan(roots, outdir):
    items = []
    for r in roots:
        r = os.path.abspath(r)
        items += walk_imgs(r)
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
        entries.append({'id': full, 'root': root, 'rel': rel,
                        'pred': pred, 'p': round(float(po), 3),
                        'unc': round(abs(float(po) - 0.5) * 2, 3)})
    entries.sort(key=lambda x: x['unc'])  # 最不确定优先审
    n_o = sum(1 for x in entries if x['pred'] == '橙子')
    os.makedirs(outdir, exist_ok=True)
    manifest = {'roots': [os.path.abspath(r) for r in roots], 'total': len(entries),
                'pred_orange': n_o, 'pred_not': len(entries) - n_o, 'items': entries}
    json.dump(manifest, open(os.path.join(outdir, '_manifest.json'), 'w'),
              ensure_ascii=False, indent=1)
    write_review(outdir, manifest)
    print(f'扫描完成: {len(entries)} 张（{len(roots)} 个目录）, 模型预判 橙 {n_o} / 非橙 {len(entries)-n_o}')
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
#prog{{flex:1;height:7px;background:#333;border-radius:4px;overflow:hidden}}
#prog i{{display:block;height:100%;background:#4a90d9}}
button{{background:#345;border:none;color:#ddd;padding:6px 14px;border-radius:5px;
cursor:pointer;font-size:14px}}button:hover{{background:#467}}
#path{{font-size:12px;color:#999;max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
</style></head><body>
<div id=bar>
 <span id=t></span>
 <span class="tag n" id=predtag></span>
 <span>置信 <b id=p></b></span>
 <span id=prog><i id=fill></i></span>
 <button onclick=undo()>↩ 撤销(u)</button>
 <button onclick=exportJ()>💾 导出分类结果</button>
</div>
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
function show() {{
  const it = D[i];
  document.getElementById('img').src = it.id;
  document.getElementById('t').textContent = (i+1)+' / '+D.length;
  const tag = document.getElementById('predtag');
  tag.textContent = '预判 '+it.pred; tag.className = 'tag '+(it.pred==='橙子'?'o':'n');
  document.getElementById('p').textContent = it.p.toFixed(2);
  document.getElementById('path').textContent = it.rel;
  const done = Object.values(dec).filter(v=>v!==null).length;
  document.getElementById('fill').style.width = (done/D.length*100)+'%';
  document.getElementById('stat').textContent = '已审 '+done+' | 橙 '
    +Object.values(dec).filter(v=>v==='橙子').length
    +' | 非橙 '+Object.values(dec).filter(v=>v==='非橙子').length
    +' | 垃圾 '+Object.values(dec).filter(v=>v==='垃圾').length;
}}
function set(v) {{ dec[D[i].id] = v; next(); }}
function next() {{ // 跳到下一个未审
  for (let s=1;s<=D.length;s++) {{ const j=(i+s)%D.length;
    if (dec[D[j].id]===null) {{ i=j; show(); return; }} }}
  i = Math.min(i+1, D.length-1); show();
}}
function move(d) {{ i=(i+d+D.length)%D.length; show(); }}
function undo() {{ // 撤销最近一次
  for (let s=1;s<=D.length;s++) {{ const j=(i-s+D.length*2)%D.length;
    if (dec[D[j].id]!==null) {{ dec[D[j].id]=null; i=j; show(); return; }} }}
}}
function exportJ() {{
  const out = {{}}; for (const k in dec) if (dec[k]!==null) out[k]=dec[k];
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
show();
</script></body></html>"""
    open(os.path.join(outdir, 'review.html'), 'w').write(html)

# ---------- apply ----------
def cmd_apply(workdir, dec_f=None):
    workdir = os.path.abspath(workdir)
    if dec_f is None:
        dec_f = os.path.join(workdir, '分类结果.json')
    if not os.path.exists(dec_f):
        dec_f2 = os.path.expanduser('~/下载/分类结果.json')
        print(f'未找到 {dec_f}, 试 {dec_f2}')
        dec_f = dec_f2 if os.path.exists(dec_f2) else dec_f
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
        if '--out' in argv:
            out = argv[argv.index('--out') + 1]
        if not dirs:
            print(__doc__); sys.exit(1)
        cmd_scan(dirs, out)
    else:
        cmd_apply(argv[1] if len(argv) > 1 else DEFAULT_OUT,
                  argv[2] if len(argv) > 2 else None)
