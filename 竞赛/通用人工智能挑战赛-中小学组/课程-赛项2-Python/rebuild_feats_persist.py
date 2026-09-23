#!/usr/bin/env python3
"""重建全部特征缓存（持久版，从 LMCC 数据源）"""
import os, glob, sys
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
import numpy as np

BASE = '/home/fslong/Documents/blog/uploads/statics/lesson/LMCC/竞赛/通用人工智能挑战赛-中小学组/课程-赛项2-Python'
TEST = f'{BASE}/测试素材'
RAR = '/home/fslong/桌面/赛项2交付/橙子识别图集'
OUT = '/var/tmp/feat2'
os.makedirs(OUT, exist_ok=True)

# 检查 TF 是否可用
try:
    import tensorflow as tf
    m = tf.keras.applications.MobileNetV2(alpha=0.5, include_top=False, pooling='avg', weights='imagenet')
    from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
    from tensorflow.keras.preprocessing import image as kimg
    ENGINE = 'tf'
    print('ENGINE: TF')
except ImportError:
    ENGINE = 'none'
    print('ENGINE: none - 需要安装 tensorflow 或用替代特征提取器')

def feats_tf(files, tag):
    out = []
    for i, f in enumerate(files):
        try:
            from PIL import Image, ImageOps
            im = Image.open(f); im = ImageOps.exif_transpose(im).convert('RGB')
            im.thumbnail((224, 224))
            x = preprocess_input(np.array(im, dtype=np.float32))
            out.append(m.predict(x[None], verbose=0)[0])
        except Exception as e:
            print(f'  WARN {f}: {e}', flush=True)
            out.append(np.zeros(1280, dtype=np.float32))
        if (i+1) % 100 == 0: print(f'  {tag} {i+1}/{len(files)}', flush=True)
    return np.array(out)

pools = {
    'old_orange': sorted(glob.glob(f'{TEST}/orange/*.jpg')),
    'old_hard': sorted(glob.glob(f'{TEST}/not_orange/*.jpg')),
    'old_easy': sorted(glob.glob(f'{TEST}/not_orange_easy/*.jpg')),
    'r7_orange': sorted(glob.glob(f'{BASE}/赛项2定版_r7_真实86/orange/*.jpg')),
    'r7_not': sorted(glob.glob(f'{BASE}/赛项2定版_r7_真实86/not_orange/*.jpg')),
    'n88_orange': sorted(glob.glob(f'{BASE}/赛项2定版_非橙88/orange/*.jpg')),
    'n88_not': sorted(glob.glob(f'{BASE}/赛项2定版_非橙88/not_orange/*.jpg')),
    'r8_not': sorted(glob.glob(f'{BASE}/赛项2定版_r8_非橙86/not_orange/*.jpg')),
    'rar_orange': sorted(glob.glob(f'{RAR}/橙子/*')),
    'rar_not': sorted(glob.glob(f'{RAR}/非橙子/*')),
    'r5_raw': sorted(glob.glob(f'{TEST}/_新增候选_r5/orange_r5/*.jpg')) + sorted(glob.glob(f'{TEST}/_新增候选_r5/notor_r5/*.jpg')),
    'r7_raw': sorted(glob.glob(f'{TEST}/_新增候选_r7/notor_r7/*.jpg')),
    'r8_raw': sorted(glob.glob(f'{TEST}/_新增候选_r8/notor_r8/*.jpg')),
    'r9_raw': sorted(glob.glob(f'{TEST}/_新增候选_r9/orange_r9/*.jpg')),
    'r10_raw': sorted(glob.glob(f'{TEST}/_新增候选_r10/notor_r10/*.jpg')),
}

total = sum(len(v) for v in pools.values())
print(f'共 {total} 张待提特征', flush=True)

if ENGINE == 'none':
    print('无 TF 引擎，尝试预提取缓存...', flush=True)
    sys.exit(1)

for tag, files in pools.items():
    if not files: continue
    # 检查是否已存在
    if os.path.exists(f'{OUT}/{tag}.npz'):
        d = np.load(f'{OUT}/{tag}.npz', allow_pickle=True)
        if len(d['names']) == len(files):
            print(f'{tag}: 缓存命中 {len(files)} 张，跳过', flush=True)
            continue
    F = feats_tf(files, tag)
    np.savez_compressed(f'{OUT}/{tag}.npz', F=F, names=np.array(files))
    print(f'{tag}: {len(files)} → {F.shape}', flush=True)
print('ALL DONE')
