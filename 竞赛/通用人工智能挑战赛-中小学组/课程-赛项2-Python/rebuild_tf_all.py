#!/usr/bin/env python3
"""tf 全池特征重建（含 r13/r14），泛化基准用"""
import os, glob, sys, json
os.environ['TF_CPP_MIN_LOG_LEVEL']='3'
import numpy as np, tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
from PIL import Image, ImageOps

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = f'{BASE}/feat2_tf'
os.makedirs(OUT, exist_ok=True)
m = MobileNetV2(alpha=0.5, include_top=False, pooling='avg', weights='imagenet')

def feat(files):
    out=[]
    for f in files:
        try:
            im=ImageOps.exif_transpose(Image.open(f)).convert('RGB'); im.thumbnail((224,224))
            x=preprocess_input(np.array(im,dtype=np.float32))
            out.append(m.predict(x[None],verbose=0)[0])
        except Exception:
            out.append(np.zeros(1280,dtype=np.float32))
    return np.array(out)

RAR='/home/fslong/桌面/赛项2交付/橙子识别图集'
R13=f'{BASE}/r13_fetch'; R14=f'{BASE}/r14_fetch'; R12=f'{BASE}/r12_fetch'
pools = {
    'old_orange': sorted(glob.glob(f'{BASE}/测试素材/orange/*.jpg')),
    'old_hard':   sorted(glob.glob(f'{BASE}/测试素材/not_orange/*.jpg')),
    'old_easy':   sorted(glob.glob(f'{BASE}/测试素材/not_orange_easy/*.jpg')),
    'r7_orange':  sorted(glob.glob(f'{BASE}/赛项2定版_r7_真实86/orange/*.jpg')),
    'r7_not':     sorted(glob.glob(f'{BASE}/赛项2定版_r7_真实86/not_orange/*.jpg')),
    'n88_orange': sorted(glob.glob(f'{BASE}/赛项2定版_非橙88/orange/*.jpg')),
    'n88_not':    sorted(glob.glob(f'{BASE}/赛项2定版_非橙88/not_orange/*.jpg')),
    'r8_not':     sorted(glob.glob(f'{BASE}/赛项2定版_r8_非橙86/not_orange/*.jpg')),
    'r5_orange':  sorted(glob.glob(f'{BASE}/测试素材/_新增候选_r5/orange_r5/*.jpg')),
    'r5_not':     sorted(glob.glob(f'{BASE}/测试素材/_新增候选_r5/notor_r5/*.jpg')),
    'r7_raw':     sorted(glob.glob(f'{BASE}/测试素材/_新增候选_r7/notor_r7/*.jpg')),
    'r8_raw':     sorted(glob.glob(f'{BASE}/测试素材/_新增候选_r8/notor_r8/*.jpg')),
    'r9_orange':  sorted(glob.glob(f'{BASE}/测试素材/_新增候选_r9/orange_r9/*.jpg')),
    'r10_raw':    sorted(glob.glob(f'{BASE}/测试素材/_新增候选_r10/notor_r10/*.jpg')),
    'r13_orange': sorted(glob.glob(f'{R13}/orange_r13/*.jpg')),
    'r13_not':    sorted(glob.glob(f'{R13}/not_orange_r13/*.jpg')),
    'r14_orange': sorted(glob.glob(f'{R14}/orange_r14/*.jpg')),
    'r14_not':    sorted(glob.glob(f'{R14}/not_orange_r14/*.jpg')),
    'r12_orange': sorted(glob.glob(f'{R12}/orange_r12/*.jpg')) if os.path.isdir(f'{R12}/orange_r12') else [],
    'r12_not':    sorted(glob.glob(f'{R12}/not_orange_r12/*.jpg')) if os.path.isdir(f'{R12}/not_orange_r12') else [],
}
total = sum(len(v) for v in pools.values())
print('共 %d 张（TF %s，CPU）'%(total, tf.__version__), flush=True)
for tag, files in pools.items():
    fp = f'{OUT}/{tag}.npz'
    if os.path.exists(fp):
        try:
            d = np.load(fp, allow_pickle=True)
            if len(d['names']) == len(files):
                print(f'{tag}: 命中 {len(files)}', flush=True)
                continue
        except Exception:
            os.remove(fp)
    if not files:
        print(f'{tag}: 空', flush=True); continue
    print(f'{tag}: 提取 {len(files)}...', flush=True)
    F = feat(files)
    np.savez_compressed(fp, F=F, names=np.array(files, dtype=object))
    print(f'{tag}: {F.shape}', flush=True)
print('ALL DONE', flush=True)
