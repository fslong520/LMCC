#!/usr/bin/env python3
"""torch MobileNet 特征缓存重建"""
import os, glob, sys
os.environ['TORCH_CUDNN_V8_API_DISABLED'] = '1'
import numpy as np
import torch, torch.nn as nn
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights
from torchvision.transforms import transforms as T
from PIL import Image, ImageOps

OUT = '/var/tmp/feat2'
os.makedirs(OUT, exist_ok=True)

m = mobilenet_v2(weights=MobileNet_V2_Weights.IMAGENET1K_V1)
m.eval()
# 提取 features（去掉最后 fc）
features = nn.Sequential(*list(m.features.children()))
preprocess = T.Compose([
    T.Resize((224, 224)),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

def extract(files, batch=16):
    out = []
    for i in range(0, len(files), batch):
        batch_files = files[i:i+batch]
        imgs = []
        for f in batch_files:
            try:
                im = ImageOps.exif_transpose(Image.open(f)).convert('RGB')
                imgs.append(preprocess(im))
            except Exception:
                imgs.append(torch.zeros(3, 224, 224))
        if imgs:
            x = torch.stack(imgs).cuda() if torch.cuda.is_available() else torch.stack(imgs)
            with torch.no_grad():
                h = features(x)
                h = nn.functional.adaptive_avg_pool2d(h, 1).flatten(1)
            out.append(h.cpu().numpy())
        if i % 200 < batch:
            print(f'  {i}/{len(files)}', flush=True)
    return np.concatenate(out) if out else np.zeros((0, 1280), dtype=np.float32)

BASE = '/home/fslong/Documents/blog/uploads/statics/lesson/LMCC/竞赛/通用人工智能挑战赛-中小学组/课程-赛项2-Python'
TEST = f'{BASE}/测试素材'
RAR = '/home/fslong/桌面/赛项2交付/橙子识别图集'

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
print(f'共 {total} 张待提特征（torch {torch.__version__}）', flush=True)

for tag, files in pools.items():
    if not files: continue
    print(f'{tag}: {len(files)} 张...', flush=True)
    F = extract(files)
    np.savez_compressed(f'{OUT}/{tag}.npz', F=F, names=np.array(files))
    print(f'{tag}: {F.shape}', flush=True)
print('ALL DONE')
