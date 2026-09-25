# 沙箱执行器 A/B 选型记录（W3-T02, §5-1 判据实测出数）

日期：2026-09（WSL Ubuntu · systemd-free · root） · 判据：起停开销 / 逃逸负向 / Windows-WSL 适配

| 判据 | A = Docker 临时容器（shannon/LuaN1ao README:228-229 式） | B = 内核回环桥（oh-my-pi README:135,评分#7 6.8 分） |
|---|---|---|
| 隔离本体 | 容器 mount ns + net ns（工作目录独占挂载、`--network none`） | **进程内** Python/Bun kernel 回环调 agent 自己的 read/search/task——**非隔离机制** |
| 逃逸负向 | **可测且通过**：宿主专有路径（`/mnt/c`）容器内不可见;egress 在 netns 层拒（wget→非零）;`--read-only`+tmpfs+pid/mem 上限（sandbox.test 5/5） | **无法通过**：无 ns/无挂载隔离,“宿主无泄漏”结构性不可能 → 淘汰 |
| 起停开销（本机实测） | `docker run --rm` ×3 = **414 / 432 / 414 ms（中位 414 ms）**;daemon 28.5.2,alpine:3.20 已拉 | n/a（进程内启动） |
| Windows/WSL 适配 | systemd-free：`dockerd --iptables=false` 手动起 + 代理环境拉镜像即用（本记录即为实测环境）;失败时**fail-closed**（`sandbox_unavailable`,绝不回落宿主执行） | 原生进程内,无需适配（但同样无隔离） |
| **选型** | ✅ **采纳 A**（唯一能过逃逸负向的候选） | ❌ 淘汰（保留其回环桥思想为 W4 MCP bridge 参考,非沙箱） |

- 强制点（在所选层）：**host 路径 deny**=仅挂工作目录;**网络白名单**=`--network none` 硬拒全部 egress（正向放行走宿主 G2 allow-list,双层防御）;边界=512m/64 pids/超时。
- 证据：`packages/helmpi-tools/src/sandbox.ts` + `sandbox.test.ts`（5/5,含 docker-gated 三负向）;本机命令 `docker run --rm --network none alpine:3.20 true` 计时如上。
- 残余：正向 egress 白名单（容器内放行 Spec 目标）未做——当前模型由宿主层 G2 负责放行,沙箱层只做 deny-all;若 W4 需要沙箱内主动出网,再加 per-run docker network ACL。
