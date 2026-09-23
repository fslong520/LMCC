# -*- coding: utf-8 -*-
"""第十轮：橙色圆形瓜果（柠檬/南瓜/甜瓜等）——模型最易误判的形态"""
import json, os, sys, time, urllib.parse, urllib.request, hashlib
HERE="/home/fslong/Documents/blog/uploads/statics/lesson/LMCC/竞赛/通用人工智能挑战赛-中小学组/课程-赛项2-Python/05-备赛准备"
OUT=os.path.join(HERE,"..","测试素材","_新增候选_r10")
UA={"User-Agent":"LingyiOJ-Lesson/1.0 (teaching)"}
QUERIES={"notor_r10":[
 "lemon whole fruit yellow","lemon pile market","lemon closeup peel texture",
 "lemon fruit tree branch","lemon cut slice","lemon single fruit white",
 "yellow lemon basket","lemon supermarket display","lemon fruit wooden table",
 "pumpkin whole orange","pumpkin pile harvest","orange pumpkin field",
 "pumpkin closeup ribbed","pumpkin stack market","pumpkin single fruit",
 "cantaloupe melon whole","orange cantaloupe sliced","melon fruit whole round",
 "honeydew melon whole","melon market pile","persimmon pile market",
 "persimmon single fruit orange","apricot pile fruit","peach pile fruit",
 "quince fruit whole yellow","golden delicious apple pile",
 "grapefruit pile whole","pomelo pile whole fruit","yuzu pile fruit",
 "tangerine pile market","mandarin pile box fruit","kumquat pile fruit",
 "yellow papaya whole","mango pile market","orange squash vegetable",
 "butternut squash whole","sweet potato pile","carrot pile market",
 "orange ball pit toy","orange balloon pile"]}
PER_Q=8; PAGES=2; MIN_KB=6
def search(q,page=1,size=20):
    url=("https://api.openverse.org/v1/images/?q="+urllib.parse.quote(q)+
         f"&page_size={size}&page={page}&license_type=all")
    return json.loads(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30).read().decode())
os.makedirs(OUT,exist_ok=True); seen=set()
for tag,queries in QUERIES.items():
    d=os.path.join(OUT,tag); os.makedirs(d,exist_ok=True); got=0
    for q in queries:
        for pg in range(1,PAGES+1):
            try: js=search(q,pg)
            except Exception as e:
                print(f"  {q} p{pg} {str(e)[:30]}"); time.sleep(2); continue
            for it in js.get("results",[])[:PER_Q]:
                u=it.get("url")
                if not u: continue
                h=hashlib.md5(u.encode()).hexdigest()[:10]
                if h in seen: continue
                seen.add(h)
                fn=os.path.join(d,f"r10_{h}.jpg")
                if os.path.exists(fn): continue
                try:
                    data=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=25).read()
                    if len(data)<MIN_KB*1024: continue
                    open(fn,"wb").write(data); got+=1
                except Exception: pass
            time.sleep(0.4)
        print(f"  {q} → {got}", flush=True)
    print(f"{tag}: {len(os.listdir(d))} 张")
