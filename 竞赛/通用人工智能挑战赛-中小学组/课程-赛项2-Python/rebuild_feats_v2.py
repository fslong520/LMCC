#!/usr/bin/env python3
import os, glob, json
import numpy as np
import torch, torch.nn as nn
from torchvision.models import mobilenet_v2
from torchvision.transforms import transforms as T
from PIL import Image, ImageOps

OUT = '/var/tmp/feat2'
os.makedirs(OUT, exist_ok=True)
m = mobilenet_v2(weights=None, pretrained=True)
m.eval()
feats = nn.Sequential(*list(m.features.children()))
nn = torch.nn
preprocess = T.Compose([T.Resize((224,224)), T.ToTensor(),
    T.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225])])

BASE = os.path.dirname(os.path.abspath(__file__))
TEST = f'{BASE}/测试素材'
RAR = '/home/fslong/桌面/赛项2交付/橙子识别图集'
R12 = '/var/tmp/r12_fetch'

def all_files():
    import glob
    pools = {
        'old_orange': sorted(glob.glob(f'{TEST}/orange/*.jpg')),
        'old_hard':   sorted(glob.glob(f'{TEST}/not_orange/*.jpg')),
        'old_easy':   sorted(glob.glob(f'{TEST}/not_orange_easy/*.jpg')),
        'r7_orange':  sorted(glob.glob(f'{BASE}/赛项2定版_r7_真实86/orange/*.jpg')),
        'r7_not':     sorted(glob.glob(f'{BASE}/赛项2定版_r7_真实86/not_orange/*.jpg')),
        'n88_orange': sorted(glob.glob(f'{BASE}/赛项2定版_非橙88/orange/*.jpg')),
        'n88_not':    sorted(glob.glob(f'{BASE}/赛项2定版_非橙88/not_orange/*.jpg')),
        'r8_not':     sorted(glob.glob(f'{BASE}/赛项2定版_r8_非橙86/not_orange/*.jpg')),
        'rar_orange': sorted(glob.glob(f'{RAR}/橙子/*')),
        'rar_not':    sorted(glob.glob(f'{RAR}/非橙子/*')),
        'r5_raw':     sorted(glob.glob(f'{TEST}/_新增候选_r5/orange_r5/*.jpg'))+sorted(glob.glob(f'{TEST}/_新增候选_r5/notor_r5/*.jpg')),
        'r7_raw':     sorted(glob.glob(f'{TEST}/_新增候选_r7/notor_r7/*.jpg')),
        'r8_raw':     sorted(glob.glob(f'{TEST}/_新增候选_r8/notor_r8/*.jpg')),
        'r9_raw':     sorted(glob.glob(f'{TEST}/_新增候选_r9/orange_r9/*.jpg')),
        'r10_raw':    sorted(glob.glob(f'{TEST}/_新增候选_r10/notor_r10/*.jpg')),
    }
    # r12 新抓
    no12 = sorted(glob.glob(f'{R12}/not_orange_r12/*.jpg')) if os.path.isdir(f'{R12}/not_orange_r12') else []
    o12  = sorted(glob.glob(f'{R12}/orange_r12/*.jpg')) if os.path.isdir(f'{R12}/orange_r12') else []
    pools['r12_not'] = no12
    pools['r12_orange'] = o12
    return pools

def extract(files, tag):
    out = []
    for i in range(0, len(files), 16):
        batch = files[i:i+16]
        imgs = []
        for f in batch:
            try:
                im = ImageOps.exif_transpose(Image.open(f)).convert('RGB')
                imgs.append(preprocess(im))
            except:
                imgs.append(torch.zeros(3,224,224))
        x = torch.stack(imgs)
        with torch.no_grad():
            h = feats(x)
            h = torch.nn.functional.adaptive_avg_pool2d(h, 1).flatten(1)
        out.append(h.numpy())
        if i % 200 < 16:
            print(f'  {tag} {i+min(16,len(files)-i)}/{len(files)}', flush=True)
    return np.concatenate(out, axis=0).astype(np.float32)

pools = all_files()
total = sum(len(v) for v in pools.values())
print(f'共 {total} 张', flush=True)
for tag, files in pools.items():
    fp = f'{OUT}/{tag}.npz'
    if os.path.exists(fp):
        d = np.load(fp, allow_pickle=True)
        if len(d['names']) == len(files):
            print(f'{tag}: 缓存 {len(files)} 张，跳过', flush=True)
            continue
    if not files:
        print(f'{tag}: 空池', flush=True)
        continue
    F = extract(files, tag)
    np.savez_compressed(fp, F=F, names=np.array(files, dtype=object))
    print(f'{tag}: {len(files)} → {F.shape}', flush=True)
print('ALL DONE', flush=True)
