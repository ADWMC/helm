# W4 任务书：逆向域

> 上级：[`../PLAN-product.md`](../PLAN-product.md) §6 Wave 4｜状态：未开始｜依赖：**W2 波门全绿**（WG2.1–2.3；W3 可并行——方案 §6 依赖行「W3 与 W4 在 W2 后可并行」）｜波门判据单源 = 方案 §7.2，本文件引用不复制｜ID：任务 `W4-T{NN}`，波门只引 `WG4.x`

## 0. 完成定义（DoD）

WG4.1–4.3 全绿 + 证据按 §6 归档 + 方案 §8.1 追加本波记录；收尾执行 `git rebase upstream/main` 演练（README 执行规则 2）。

## 1. 目标与范围

一句话目标：落地逆向域五件套——**双域一个内核，换 playbook 和工具面**（方案 §5.2），门禁层（scope/evidence/finish/六道闸）复用。

- **In**：① `references/re/**` 知识包 ② MCP bridge 真实 e2e（fake-server → 真 Ghidra，补 §8 残余）③ `Spec.targetKind` 扩展 + 样本 hash 白名单 scope ④ 逆向 playbook finish 门复用 ⑤ `docs/tests/2026-fork-re/` 端到端 suite。
- **Out（显式）**：渗透管线（归 W3）；Ghidra 之外的多 RE 后端扩展（IDA 等只留观察位，不引）；沙箱（归 W3）。

## 2. 前置条件

- **上游状态**：W1 内核迁入完成（mcp-bridge/scope/ledger/completion 随 kernel 迁入，方案 §6-W1 任务1）；WG2.1–2.3 全绿。
- **环境**：Ghidra + Ghidra MCP/OGhidra 可运行（`reference/repos/OGhidra/README.md:31-45`，本地模型保隐私）；crackme/样本来源就绪。
- **需用户拍板的决策**：无——W4 任务与波门方案已定，本任务书不新增决策。

## 3. 任务分解（一任务一逻辑提交，对齐方案 §3.6.2 总账 W4 行「增」）

### W4-T01 RE 知识包 `references/re/**`
- **【改什么文件】** 新增 `references/re/**`（方案 §3.6.1 树 `re/` 行，现不存在）+ `references/index.md` 挂按需读入口。
- **【步骤 checklist】**
  - [ ] 按 open-reverselab 范式 **Scenario→信号→方法→攻击链→工具映射** 组织，**自有内容改写**（`reference/repos/open-reverselab/README.md:47-54` 仅作范式参照，不搬运原文）
  - [ ] 每条链可执行：信号可复现、终点落到工具/证据（范式「不可执行的步骤不进知识库」的自有改写）
  - [ ] `references/index.md` 收录索引；`npm run check` exit 0（留退出码）
- **【产出】** RE 领域知识包 + 索引。**【关联】** WG4.3（T04/T05 的知识层）。

### W4-T02 MCP bridge 真实 e2e
- **【改什么文件】** `packages/helmpi-kernel/src/mcp-bridge.ts`（方案 §3.6.1:340 标注「W4 接真 Ghidra」）+ `.helm/` 自有 MCP server 配置（§3.6.3 配置面）。
- **【步骤 checklist】**
  - [ ] 起真实 Ghidra MCP（OGhidra 桥，Planning→Execution→Review 循环）
  - [ ] bridge（newline JSON-RPC）完成 **≥1 次真实往返**，ScopeGate 内联 fail-closed 语义不动
  - [ ] fake-server 用例标注作废；往返失败 → 按方案 §7.2 原文「失败则残余风险显式续记」记入 §8 残余行与 §8.1
  - [ ] `npm test` exit 0（留退出码）
- **【产出】** e2e 往返日志。**【关联】** WG4.2。（方案另列可选 sentinel-reverse 本地后端，非波门要求。）

### W4-T03 `Spec.targetKind` 扩展 + 样本 hash 白名单
- **【改什么文件】** kernel `config.ts` Spec schema、`scope.ts` 的 `validateScopeQuery`（§3.6.2 W4 行锚）、`.helm/` spec/scope 白名单配置。
- **【步骤 checklist】**
  - [ ] `targetKind: url|host|sample_hash` 三值入 Spec schema，非法值拒绝（严格 schema）
  - [ ] `validateScopeQuery` **fail-closed 语义不变**（I13/I14）；sample_hash 模式 = 样本 hash 白名单精确比对（逆向形态，替代 URL glob，§5.2）
  - [ ] 负向用例：hash 不在白名单 → 任何工具调用执行**前** block + journal（时间戳序）
  - [ ] `npm test` exit 0（既有 fail-closed 负向回归不破）
- **【产出】** targetKind 扩展 + hash scope 负向测试 + journal 时间戳样本。**【关联】** WG4.1。

### W4-T04 逆向 playbook + finish 门复用
- **【改什么文件】** `references/playbooks/reverse.yaml`（已有 v1 骨架 scope→…→close，intake `refs: toolbox/decision-tree.md` 悬空）接 `references/re/**`；finish 门走 `completion.ts` **零改动复用**（§5.2 门禁层复用零改动）。
- **【步骤 checklist】**
  - [ ] playbook 阶段/交付物对齐逆向域：**函数级 claim 同样要证据切片**（G5 语义，§5.2/§6 任务4）
  - [ ] finish 门 coverage（I19）落 ledger coverage 表（§3.6.1:320），留记录样本
  - [ ] 悬空 ref 改指本波知识包；`npm run check`（含 lint-playbooks 4 项）exit 0
- **【产出】** reverse.yaml 完整版 + coverage 记录样本。**【关联】** WG4.3。

### W4-T05 crackme 端到端 suite
- **【改什么文件】** 新增 `docs/tests/2026-fork-re/`（MANIFEST.txt/evidence/report/stats.json）。
- **【步骤 checklist】**
  - [ ] 1 个真实 crackme/样本，授权前提确认（见 §5：SOW/授权在 Session 层）
  - [ ] recon→定位→证据切片→finish（coverage 门）全链跑通
  - [ ] STANDARD 全项：真机真调用、R-gate n≥3 每 attempt `stats.json`、wall/active 双时钟、token 六列、报告 md+json（`docs/tests/STANDARD.md`）
  - [ ] suite 命令 + 退出码留档；`MANIFEST.txt` 刷新
- **【产出】** 真机逆向 suite（方案 §6-W4 交付物）。**【关联】** WG4.3。

## 4. 波门验收（单源 = 方案 §7.2，此处仅判据摘要）

- **WG4.1**：hash 白名单负向——工具执行**前** block + journal 时序（I13/I14 逆向形态）｜证据：journal 时间戳。
- **WG4.2**：真实 Ghidra MCP ≥1 次成功往返；不成则残余风险显式续记｜证据：e2e 日志。
- **WG4.3**：1 个 crackme 全链 suite + STANDARD 全项｜证据：`docs/tests/2026-fork-re/`。

## 5. 风险与回滚

- **Ghidra 环境不可用**：WG4.2 按 §7.2 原文允许残余风险显式续记——fake-server 残余在 §8 残余行/§8.1 续记，不改判据、不以 fake-server 充绿。
- **样本获取合规**：crackme/样本须授权前提；SOW/授权硬门在 Session 层（方案 §0「授权时机归 Session Spec 硬门」），任务层不越权放行，无授权不开 T05。
- **RE 无网络外联的语义差异**：逆向无外联 → `allowExternal` 默认关反而是最安全档（§5.2）；targetKind 扩展不得被误读为放宽外联，默认关配负向断言钉住。
- **hash 计算成本**：大样本 SHA256 走 tool_call 事前路径，可能拉长拦截时机——以 journal 耗时记录核验，任何优化不得放宽 fail-closed 语义。
- **回滚**：每任务一提交；回滚 = `git revert` 单任务粒度；每波结束 `git rebase upstream/main`（§3.6.4；W4 直改上游约 0–1 文件，§3.6.5 W4 行）。

## 6. 证据清单

| 证据 | 内容 | 落点 | 关联 |
|---|---|---|---|
| journal 时间戳 | hash scope 执行前 block 行（时序可核） | kernel journal（`scope_denied` 类事件） | WG4.1 |
| MCP 往返日志 | 真实 Ghidra ≥1 往返；失败则残余续记 | e2e 日志 | WG4.2 |
| suite 三件套 | `MANIFEST.txt` + evidence + report + 每 attempt `stats.json` | `docs/tests/2026-fork-re/` | WG4.3 |
| coverage 记录样本 | finish 门 I19 coverage 表摘录 | ledger coverage → suite evidence | WG4.3 |
| 波末记录 | §8.1 追加本波进度与证据索引 | 方案 §8.1 | DoD |
