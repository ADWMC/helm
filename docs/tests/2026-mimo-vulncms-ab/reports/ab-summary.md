# A/B 对比：mimo-v2.6-flash + 本地靶场 18080

## 环境
- 模型: xiaomi/mimo-v2.6-flash（auth ready）
- 靶场: 本地 VulnCMS (gh 搜到 DVWA/ juice-shop 等因无 Docker/PHP 未跑)，Python 起在 127.0.0.1:18080
- SoL-Pi: 已 `pi install git:github.com/NVlabs/SoL-Pi`，`sol-pi.json` 开了 actionFusion+observationPack

## 结果

| 项 | A 无扩展 | B 带 helmpi (+SoL-Pi) | B2 带扩展+持久会话 |
|----|---------|----------------------|---------------------|
| 退出码 | 0 | 0 | 0 |
| 耗时 | 87.3s | 64.3s | 52.5s |
| 完成 SQLi 验证 | ✓ FLAG | ✓ FLAG + E-002/003 | ✓ FLAG + E-002/003 |
| helmpi_status | 无 | **已调用并回显** | **已调用并回显** |
| case/evidence | 无 | cases/18080-webapp E-001..003 | cases/helmpi-18080 E-001..003 |
| 路由/证据链 | 散文报告 | PRIMARY route + E-id 引用 | 同左 + findings 记案 |
| SoL-Pi | 未加载 | **--no-session 时报错未启用** | **无 Extension error，已启用** |

## SoL-Pi 结论
- 包已在 `pi list`
- 用 `--no-session` 会报 `SoL-Pi requires a persistent Pi session directory`（未启用）
- 持久会话（默认）B2：**stderr 无 SoL-Pi 错误 → 已启用**

## helmpi 增量价值（相对 A）
1. 强制/引导调用 `helmpi_status`（配置与开关可见）
2. `route_task` PRIMARY 路由
3. **E 编号证据链** 落盘 `cases/*/evidence/`
4. findings 写入 case，结论可引用 E-id
5. 同等或更短耗时下交付同等/更结构化报告
### D：仅 helmpi（无 SoL-Pi）
- 94.4s，exit 0；helmpi_status + route_task(PRIMARY har) + E-001..004
- SoL-Pi 未加载
- 证明：helmpi 证据链不依赖 SoL-Pi