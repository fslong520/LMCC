#!/usr/bin/env python3
"""配方 I 全量注入+训练（0 起点校验）"""
import json, asyncio, os, sys
import websockets
PAGE = sys.argv[1]
WS = 'ws://127.0.0.1:9022/devtools/page/%s' % PAGE
BASE = '/home/fslong/Documents/blog/uploads/statics/lesson/LMCC/竞赛/通用人工智能挑战赛-中小学组/课程-赛项2-Python'

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
        return r.get('result', {}).get('value')

async def main():
    man = json.load(open(f'{BASE}/recipe_I/manifest.json'))
    print('配方 I 橙', len(man['orange']), '非橙', len(man['not_orange']), flush=True)
    async with websockets.connect(WS, max_size=50*1024*1024) as ws:
        c = CDP(ws)
        for btn_idx, files in [(0, man['orange']), (1, man['not_orange'])]:
            for i, f in enumerate(files):
                await c.ev("(function(){var b=[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&b.textContent.trim()==='添加图片');b[%d].click();return 1})()" % btn_idx)
                await asyncio.sleep(0.3)
                root = await c.send('DOM.getDocument', {'depth': -1})
                q = await c.send('DOM.querySelectorAll', {'nodeId': root['root']['nodeId'], 'selector': 'input[type=file]'})
                for nid in q['nodeIds']:
                    node = await c.send('DOM.describeNode', {'nodeId': nid})
                    if 'image' not in ' '.join(node['node'].get('attributes', [])): continue
                    await c.send('DOM.setFileInputFiles', {'files': [f], 'nodeId': nid})
                    await asyncio.sleep(0.3)
                    await c.ev("(function(){var i=document.querySelectorAll('input[type=file]')[0];i.dispatchEvent(new Event('change',{bubbles:true}));i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()")
                await asyncio.sleep(0.4)
                if (i+1) % 25 == 0:
                    t = await c.ev("(function(){var t=document.body.innerText;var m=t.match(/类别 1\\n(\\d+)/);var m2=t.match(/类别 2\\n(\\d+)/);return (m?m[1]:'?')+'/'+(m2?m2[1]:'?')})()")
                    print(i+1, '页面', t, flush=True)
        await asyncio.sleep(2)
        t = await c.ev("(function(){var t=document.body.innerText;var m=t.match(/类别 1\\n(\\d+)/);var m2=t.match(/类别 2\\n(\\d+)/);return JSON.stringify({c1:m?+m[1]:-1,c2:m2?+m2[1]:-1})})()")
        print('注入完成', t, flush=True)
        # 训练（先关高级面板）
        await c.ev("(function(){var els=[...document.querySelectorAll('button,[role=button],summary')].filter(e=>e.offsetParent&&/收起|高级训练设置/.test(e.textContent));els.forEach(e=>e.click());return 1})()")
        await asyncio.sleep(1)
        await c.ev("(function(){var b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/开始训练/.test(b.textContent));if(b)b.click();return 1})()")
        print('训练启动', flush=True)
        for _ in range(40):
            await asyncio.sleep(6)
            done = await c.ev("(function(){var t=document.body.innerText;var i=t.indexOf('训练模型');return /模型已就绪/.test(t.slice(i)) })()")
            if done: break
        await asyncio.sleep(2)
        t = await c.ev("(function(){var t=document.body.innerText;var i=t.indexOf('训练模型');return t.slice(i,i+200)})()")
        print('结果:', t, flush=True)

asyncio.run(main())
