#!/usr/bin/env python3
"""CDP 注入指定配方目录 → 设参 → 训练 → 报告"""
import json, asyncio, os, sys, glob, time
import websockets

PAGE = sys.argv[1]
RECIPE = sys.argv[2]
WS = 'ws://127.0.0.1:9022/devtools/page/%s' % PAGE
BASE = os.path.dirname(os.path.abspath(__file__))

class CDP:
    def __init__(s, ws): s.ws = ws; s.mid = 0
    async def send(s, m, p=None):
        s.mid += 1
        await s.ws.send(json.dumps({'id': s.mid, 'method': m, 'params': p or {}}))
        while True:
            msg = json.loads(await s.ws.recv())
            if msg.get('id') == s.mid:
                if 'error' in msg: raise RuntimeError(msg['error'])
                return msg.get('result', {})
    async def ev(s, e):
        r = await s.send('Runtime.evaluate', {'expression': e, 'returnByValue': True})
        v = r.get('result', {})
        return v.get('value')

async def get_cnt(c):
    t = await c.ev("(function(){var t=document.body.innerText;var m=t.match(/类别 1\\n(\\d+)/);var m2=t.match(/类别 2\\n(\\d+)/);return JSON.stringify({c1:m?+m[1]:-1,c2:m2?+m2[1]:-1})})()")
    d = json.loads(t)
    return (d['c1'], d['c2']) if btn_idx == 0 else (d['c2'], d['c1'])

async def inject(c, files, btn_idx):
    key = 'c1' if btn_idx == 0 else 'c2'
    start = await c.ev("(function(){var t=document.body.innerText;var m=t.match(/类别 %d\\n(\\d+)/);return m?+m[1]:-1})()" % (btn_idx+1))
    target = start + len(files)
    for i, f in enumerate(files):
        before = await c.ev("(function(){var t=document.body.innerText;var m=t.match(/类别 %d\\n(\\d+)/);return m?+m[1]:-1})()" % (btn_idx+1))
        await c.ev("(function(){var b=[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&b.textContent.trim()==='添加图片');b[%d].click();return 1})()" % btn_idx)
        await asyncio.sleep(0.3)
        root = await c.send('DOM.getDocument', {'depth': -1})
        q = await c.send('DOM.querySelectorAll', {'nodeId': root['root']['nodeId'], 'selector': 'input[type=file]'})
        nids = q['nodeIds']
        ok = False
        for nid in nids:
            node = await c.send('DOM.describeNode', {'nodeId': nid})
            if 'image' not in ' '.join(node['node'].get('attributes', [])):
                continue
            await c.send('DOM.setFileInputFiles', {'files': [f], 'nodeId': nid})
            await asyncio.sleep(0.25)
            await c.ev("(function(){var i=document.querySelectorAll('input[type=file]')[0];i.dispatchEvent(new Event('change',{bubbles:true}));i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()")
            await asyncio.sleep(0.45)
            after = await c.ev("(function(){var t=document.body.innerText;var m=t.match(/类别 %d\\n(\\d+)/);return m?+m[1]:-1})()" % (btn_idx+1))
            if after == before + 1:
                ok = True; break
        if not ok:
            await asyncio.sleep(2)
            for attempt in range(2):
                before = await c.ev("(function(){var t=document.body.innerText;var m=t.match(/类别 %d\\n(\\d+)/);return m?+m[1]:-1})()" % (btn_idx+1))
                await c.ev("(function(){var b=[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&b.textContent.trim()==='添加图片');b[%d].click();return 1})()" % btn_idx)
                await asyncio.sleep(0.5)
                root = await c.send('DOM.getDocument', {'depth': -1})
                q = await c.send('DOM.querySelectorAll', {'nodeId': root['root']['nodeId'], 'selector': 'input[type=file]'})
                for nid in q['nodeIds']:
                    node = await c.send('DOM.describeNode', {'nodeId': nid})
                    if 'image' not in ' '.join(node['node'].get('attributes', [])):
                        continue
                    await c.send('DOM.setFileInputFiles', {'files': [f], 'nodeId': nid})
                    await asyncio.sleep(0.3)
                    await c.ev("(function(){var i=document.querySelectorAll('input[type=file]')[0];i.dispatchEvent(new Event('change',{bubbles:true}));i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()")
                    await asyncio.sleep(0.5)
                    after = await c.ev("(function(){var t=document.body.innerText;var m=t.match(/类别 %d\\n(\\d+)/);return m?+m[1]:-1})()" % (btn_idx+1))
                    if after == before + 1:
                        ok = True; break
                if ok: break
        if not ok:
            print('FAIL', i, f, 'cnt stuck at', before, flush=True)
            sys.exit(4)
        if (i+1) % 25 == 0:
            print(tag_name(btn_idx), i+1, flush=True)

def tag_name(idx): return '橙' if idx==0 else '非橙'

async def main():
    man = json.load(open(f'{BASE}/recipe_{RECIPE}/manifest.json'))
    print('配方', RECIPE, '橙', len(man['orange']), '非橙', len(man['not_orange']), flush=True)
    async with websockets.connect(WS, max_size=50*1024*1024) as ws:
        c = CDP(ws)
        # 等页面就绪：2 个添加按钮出现
        for _ in range(20):
            nb = await c.ev("(function(){return [...document.querySelectorAll('button')].filter(b=>b.offsetParent&&b.textContent.trim()==='添加图片').length})()")
            if nb == 2: break
            await asyncio.sleep(1)
        # 前置校验：必须是空项目
        t0 = await c.ev("(function(){var t=document.body.innerText;var m=t.match(/类别 1\\n(\\d+)/);var m2=t.match(/类别 2\\n(\\d+)/);return JSON.stringify({c1:m?+m[1]:-1,c2:m2?+m2[1]:-1})})()")
        d0 = json.loads(t0)
        if d0['c1'] != 0 or d0['c2'] != 0:
            print('页面非空', t0, '— 请先清空项目', flush=True); sys.exit(2)
        await inject(c, man['orange'], 0)
        await inject(c, man['not_orange'], 1)
        await asyncio.sleep(1)
        t = await c.ev("(function(){var t=document.body.innerText;var m=t.match(/类别 1\\n(\\d+)/);var m2=t.match(/类别 2\\n(\\d+)/);return JSON.stringify({c1:m?+m[1]:-1,c2:m2?+m2[1]:-1})})()")
        print('注入完成', t, flush=True)
        d1 = json.loads(t)
        exp_c1, exp_c2 = len(man['orange']), len(man['not_orange'])
        if abs(d1['c1']-exp_c1) > 2 or abs(d1['c2']-exp_c2) > 2:
            print('注入计数不符！预期', exp_c1, exp_c2, flush=True); sys.exit(3)
        # 高级设置：5 轮 8 批
        await c.ev("(function(){var b=[...document.querySelectorAll('button,summary,[role=button]')].find(b=>b.offsetParent&&/高级训练设置/.test(b.textContent));if(b)b.click();return 1})()")
        await asyncio.sleep(1)
        await c.ev("(function(){var ns=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;var eps=[...document.querySelectorAll('input[type=number]')].find(i=>i.offsetParent);ns.call(eps,'5');eps.dispatchEvent(new Event('input',{bubbles:true}));eps.dispatchEvent(new Event('change',{bubbles:true}));var sel=[...document.querySelectorAll('select')].find(s=>s.offsetParent&&s.value==='16');if(sel){sel.value='8';sel.dispatchEvent(new Event('change',{bubbles:true}));}return 1})()")
        # 训练
        await c.ev("(function(){var b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/开始训练/.test(b.textContent));b.click();return 1})()")
        print('训练启动，等待...', flush=True)
        for _ in range(30):
            await asyncio.sleep(5)
            done = await c.ev("(function(){return /训练完成|模型已就绪/.test(document.body.innerText)})()")
            if done: break
        await asyncio.sleep(2)
        t = await c.ev("(function(){var t=document.body.innerText;var i=t.indexOf('训练');return t.slice(i, i+260)})()")
        print('训练结果:', t[:260], flush=True)

asyncio.run(main())
