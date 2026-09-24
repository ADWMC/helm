# SoL-Pi API 兼容核验记录：pi 0.85.1 → fork 0.87.1（W1-T04,核验先于合入）

> 判据来源：方案 §6-W1 任务4（"0.85.1→0.87.1 API 兼容核验记录（**核验先于合入**,因默认开）"）、WG1.4（"API 核验记录 + COMPAT.md 改写完成"）。
> 被核验源：`reference/repos/SoL-Pi`（NVIDIA,MIT,`LICENSE` 2026 NVIDIA CORPORATION;机制名实录：action-fusion / evidence-preserving-reducer / observation-pack / online-context-compact）。
> 核验对象 = fork 当前源（HEAD 起自 upstream `d5629e204`，版本号 0.87.1），命令与输出见下表（2026-09 实测,退出码见 PR/提交记录）。

## 判定摘要：**PASS（全部命中,无缺失 API）**

### 1. 事件（SoL-Pi 使用 11 种,`pi.on(...)`）→ fork `core/extensions/types.ts` 事件表

| 事件 | fork 命中 |
|---|---|
| agent_settled | ✓ (2) |
| before_provider_request | ✓ (2) |
| context | ✓ (2) |
| input | ✓ (4) |
| session_before_tree | ✓ (2) |
| session_compact | ✓ (2) |
| session_shutdown | ✓ (2) |
| session_start | ✓ (2) |
| session_tree | ✓ (2) |
| tool_result | ✓ (2) |
| turn_end | ✓ (2) |

**11/11**。

### 2. coding-agent 导入符号（10）→ fork `packages/coding-agent/src/index.ts` 导出面

BashToolOptions ✓ · CONFIG_DIR_NAME ✓ · createBashToolDefinition ✓ · ExtensionAPI ✓ · ExtensionContext ✓ · ExtensionFactory ✓ · getAgentDir ✓ · SessionEntry ✓ · Theme ✓ · ToolResultEvent ✓ —— **10/10**。

### 3. 跨包子路径（4）

`@earendil-works/pi-agent-core` → `@adwmc/helm-agent-core`（fork 包在）✓ · `pi-ai` → `helm-ai` ✓ · **`pi-ai/compat` → `helm-ai` 导出含 `"./compat"`（package.json:18）** ✓ · `pi-tui` → `helm-tui` ✓ —— **4/4**（vendor 时 import 机械改名,同 T01 手法）。

### 4. `ExtensionContext` 属性（SoL-Pi 使用 3）

`cwd`（types.ts:327）✓ · `sessionManager`（:329）✓ · `isProjectTrusted()`（:344）✓ —— **3/3**。

### 5. 其它依赖面

- `registerTool` ×4、`getAgentDir`/`CONFIG_DIR_NAME`（其 `runtime-paths.ts` 落盘路径）——随符号面通过。
- node 内建（path/fs/fs-promises/crypto/os/url）与 `typebox` ×4 —— fork 根依赖在,无版本敏感 API。
- **工具闭集影响**：四机制的 `registerTool` 在 lite 模式受 G3 门控（W2 接线;T04 仅注册进 full/deep 面时经 kernel 工具面开关,单测见效率机制开关联测）。

### 结论

**可以合入**：无 API 缺失、无签名变更命中、无事件移除命中。合入形态 = vendor 进 `packages/helmpi-kernel/src/efficiency/sol-pi/`（SPDX 头保留,`@earendil-works/*` → `@adwmc/helm-*` 改名）+ kernel 内建默认加载 + `.helm/config.json` 逐项可关（默认开,偏离上游 opt-in 默认=本决策）+ 双载守卫。
