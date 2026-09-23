# 赛项2 · 本地评测协议（2026-09-20 重建）

上轮评测脚本随 /var/tmp 清理丢失，本文件重建并固定评测口径。所有新模型（本地训练头或平台导出）一律用本协议测分，与旧记录（86.60 等）不直接可比。

## 推理链路（复刻平台）

1. 页面 `http://127.0.0.1:3000/`（`/tmp/opencode/www/index.html`，python3 -m http.server 3000 常驻）
   - CDN 加载 tfjs 4.22，加载训练台同款特征提取器 `competition.chenlongrobot.com/models/mobilenet-v2-050/model.json`（TFHub 图模型，嵌入节点 `module_apply_default/MobilenetV2/Logits/AvgPool`，输出 1280 维）
   - 预处理：canvas 224×224 中心裁方、白底、`px*2/255-1`（与 @tensorflow-models/mobilenet v2 一致）
2. 头模型：zip 内 model.json + weights.bin（fp32 裸拼）经 `tf.io.fromMemory` 加载，predict 取两类别 softmax
3. CDP 通道：`/tmp/opencode/cdp.py`（Runtime.evaluate + awaitPromise）

## 测试集（固定，manifest.csv 为准）

| 子集 | 域 | 橙 | 非橙 | 说明 |
|---|---|---:|---:|---|
| TEST-P | 手机拍摄（新图集 RAR） | 46 | 95 | 最接近比赛保密测试域；已剔 13 张与训练集感知重复（aHash 8×8 dist≤1） |
| TEST-W | 网络图 | 28 | 277 | 测试素材/orange+not_orange+not_orange_easy 剔训练 md5 后余量 |

- 剔重：TEST-W 按 md5；TEST-P 按 aHash（字节不同内容同）
- **总分 = (橙召回 + 非橙排除) / 2**，与赛规公式一致；主看 TEST-P，TEST-W 作参考
- TEST-P 非橙被剔 13 张中：8 张与训练非橙同内容（新图集15张入训者）；**5 张跨类冲突**（86/87/88/89/97.png 与训练橙子 040-044 同图）：目验 86/87 为真橙（RAR 标错），88 剥皮橘络存疑、89 果干、97 丑橘——**即 r7-B 训练橙类含 2-3 张可疑标注（果干/丑橘）**，后续实验可试修正

## 与旧记录的关系

旧 86.60 系上轮临时测试集（已失），新协议分数普遍偏低属正常（TEST-W 难例池大得多）。横向比较以同协议为准：存档模型校准值见 experiment_log。

## 运行

```bash
python3 /tmp/opencode/embed_batch.py    # 批量算 embedding → eval/emb_cache/
python3 /tmp/opencode/eval_model.py <模型.zip>   # 任一平台格式 zip 出分
```
