
## LMCC 任务二（离线优化工程）
- 工程目录 /home/fslong/lmcc-gy3-route-opt/（git 管理），文档在 docs/，候选在 routes2/candidates/
- 重放必须用 GY_DATA_DIR=data2 GY_FULL=full_task2.json（replay2 默认读任务三数据，曾踩坑）
- 仿真世界是演化的：包裹被抓走后原地堆消失；路线图必须按 (done,hold) 配置建（EDGE_RECORDS+adjFor 模式）
- 当前最优 T2_ord8：98.9 分 / 147.1s / 13-13 / 零越界（满分线 124.8s）
