# W2 任务书：模型防御层六道闸 natively 接线

> 上级：PLAN-product.md §6 Wave 2｜状态：未开始；依赖：W1 波门 WG1.1–WG1.7 全绿。

## 0. 完成定义（DoD）

WG2.1–WG2.3 全绿 + 证据归档 + PLAN §8.1 追加记录（并守 §7.5 每波三件套底线）。

## 1. 目标与范围

- 目标：模型防御层 G1–G6 六道闸在 fork 内原生接线、每闸带负向测试（§6 Wave 2，验收锚 §4.1 A-G1…A-G6）。
- In：G2 `tool_call` 事前 block；G1 prompt 三段 + 动态轮间注入；G3 ToolName 闭集 + task 工具；G4 预算硬限额 + watcher 档（默认关）+ EVI 诊断子集下限 + 估值上报校验器；G5 精确切片校验；G6 回归监控；真机 suite `docs/tests/2026-fork-gates/`（§6 Wave 2 任务1–6 与交付物）。
- Out（显式不做）：CAI 注入消毒四层（W3 任务3，验=WG3.2，§4.1 G2 注）；沙箱执行器（W3 任务2）；Spec/SOW lint L1–L6（W3 任务1，§2.7.1）；mid-token 流中断（评分 #2 的 P2 版，§2.6.1）；hashline 编辑（评分 #4 P2，§2.6.1）。

## 2. 前置条件

- W1 波门 WG1.1–WG1.7 全绿：kernel 迁入、默认扩展、配置分离、tool-memory 召回段、i18n（G1 prompt 永久 en，§1.6）。
- 环境按方案 §8.1 环境栈（WSL ext4 克隆、ci 用户、fixloop、swap、权威命令 `npm test`）。
- 无待拍板决策：评分 #1/#2/#3/#11 判定已在 §2.6.1/§2.7 定案，本波只执行不改判。

## 3. 任务分解（W2-T01…T08；一任务一逻辑提交，分类对齐 §3.6.2 总账）

#### W2-T01 G2 工具闸：`tool_call` 事前 block

- 改什么：kernel `host/` 挂 `tool_call` 扩展事件 handler（`extensions/types.ts:1037,1039,1233-1238`，扩展腿零上游 diff，§3.6.2「ScopeGate 事前 block」行），判定复用 `kernel/src/scope.ts`。
- 步骤：
  1. scope 不过/高风险未批 → `block:true` + `scope_denied` journal，I14 语义保留（§6 W2 任务1）。
  2. 负向测试：越权 target 执行**前**被 block，journal 时间戳早于工具日志（§4.1 G2 行）。
  3. CAI 注入消毒不落本 handler（归 W3 任务3，验=WG3.2，§4.1 G2 注）。
  4. 验证：`npm test` 与 `npm run check` 均 exit 0。
- 产出：事前拦截 handler + ≥1 条负向测试。
- 关联断言：§4.1 G2（A-G2）；WG2.2 实证①时序（§7.2）。

#### W2-T02 G1 提示词闸：prompt 三段 + 动态轮间注入

- 改什么：`system-prompt.ts:9-32/:195`（appendSystemPrompt 位）、`runner.ts:1329-1347`（before_agent_start）、turn 事件 `types.ts:1370-1436`（§3.6.2 W2「system prompt 段」行）。
- 步骤：
  1. per-mode（lite/full）forceSystemPrompt 两档，接 `selectToolSurface`（ADR-001 继承；HCOT 档不实现，§6 W2 任务2）。
  2. 三段落地：mode 分档结构段 + S1 温和子集段（目标归一化直接执行/知识按需读/Run 层不中途问人，§4 定调清单）+ 工具记忆召回段（W1 基建、token 上限、stale 不注入）。
  3. 轮间注入：turn 边界检出 off-script → 注入 system reminder 下轮生效（评分 #2 降级形态，§2.6.1）；mid-token 版列 P2 不实现。
  4. 负向断言：无 HCOT 指令段、S1 段存在、召回段超限截断、未检出不注入（§4.1 G1 行 + §2.6.1 #2 口径）。
  5. 验证：`npm test`（G1 用例）exit 0。
- 产出：per-mode prompt 三段 + 轮间注入 + 负向测试。
- 关联断言：§4.1 G1（A-G1）；评分 #2（7.6 分，§2.6.1）；召回段沿 WG1.6 口径。

#### W2-T03 G3 档位闸：ToolName 闭集 + task 工具

- 改什么：`core/tools/index.ts:95`（闭集）、`:118-139`（工厂 switch）；新增 `packages/helmpi-tools/src/task.ts`（§3.6.2 W2 两行）。
- 步骤：
  1. 闭集 `+= "task"` + 门控 `helmpi_stats` 等按 mode 裁剪（§3.6.2 W2「ToolName 闭集」行）。
  2. task.ts：spawn/回收 child_process、bounded；设计基准 = oh-my-pi task 四件套（隔离 worktree/每 worker 独立工具面/schema 校验类型化 yield/steering-revive-kill，`oh-my-pi/README.md:163-171`，评分 #1，§2.6/§2.6.1）。
  3. 负向：lite 模式调用 gated 工具被拒；正向：task spawn/回收 smoke（§4.1 G3 行）。
  4. 真机注意：spawn 断言按 §8.1 环境栈跑（WSL ext4 克隆 + ci 用户），留 ECONNREFUSED 计数。
  5. 验证：`npm test` 与 `npm run check` 均 exit 0。
- 产出：闭集裁剪 + `task.ts` + smoke 测试。
- 关联断言：§4.1 G3（A-G3）；评分 #1（9.4 分全采纳，WG2.1 断言参照，§2.6.1）。

#### W2-T04 G4 循环闸：supervise 预算挂 session 钩子

- 改什么：session 钩子 `types.ts:1375-1439`、事件表 `types.ts:1370-1436`、`kernel/src/supervise.ts`（§3.6.2 W2「supervise 预算」行）。
- 步骤：
  1. kindStreak/decisions/token 三硬限额挂钩，超额 → instead/failed 路径（§6 W2 任务4）。
  2. 负向：预算耗尽产生 `token_budget_exhausted` 失败而非静默继续（I10，§4.1 G4 行）。
  3. journal 熔断行留样本（入 §6 证据清单）。
  4. 验证：`npm test` exit 0。
- 产出：钩子接线 + 熔断负向测试。
- 关联断言：§4.1 G4（A-G4）预算列；WG2.2 实证③ token 熔断（§7.2）。

#### W2-T05 G4 增强：watcher 档 + EVI 子集下限 + 估值上报校验器

- 改什么：`.helm/` 自有配置 schema（Spec 开关，配置分离）+ `kernel/src/supervise.ts`/journal 表；watcher 挂 §4 表 G4 行钩子（`types.ts:1370-1436`），裁决全 trace 留痕。
- 步骤：
  1. watcher 档：Spec 开关默认关，开启时每 N 轮廉价模型复核自报/证据（评分 #3，§2.6.1/§4 表 G4 行）。
  2. 负向断言：未配置 = watcher 不跑（默认关，入 WG2.1 测试名清单，§7.2）。
  3. EVI 诊断子集下限：EVI>边际成本的子集必跑、每省略必留 justification、acquisition/utilization 二分审计（评分 #11，§4 表 G4 行）。
  4. 估值上报校验器：unknown+basis 枚举 vs 工具日志分类 **correct/fail/hallucination 三值**入 journal（评分 #11，§4 表 G4 行）。
  5. 负向：无留痕省略=失败、三值齐全断言（§4.1 G4 行）；验证：`npm test` exit 0。
- 产出：watcher 档（默认关）+ 下限断言 + 校验器。
- 关联断言：§4.1 G4（A-G4）；评分 #3（7.2 分）、#11（8.7 分，§2.6.1/§2.7）。

#### W2-T06 G5 完成闸：证据精确切片校验

- 改什么：`kernel/src/completion.ts` + `kernel/src/evidence.ts`（§4 表/§4.1 G5 行；PG 语义 `CONTEXT.md:59-67,74`）。
- 步骤：
  1. finish 校验落地：复述丢弃、截断永不完成、自述不能作证据（§6 W2 任务5）。
  2. 负向：复述型证据被拒 → finish 失败；正向：精确切片通过；I19 coverage 门保持绿（§4.1 G5 行）。
  3. 验证：`npm test` 与 `npm run check` 均 exit 0。
- 产出：切片校验 + 正/负测试对。
- 关联断言：§4.1 G5（A-G5）；WG2.2 实证②复述证据被拒（§7.2）。

#### W2-T07 G6 状态闸：回归监控（不动）

- 改什么：`kernel/src/ledger.ts`/`export.ts` 零改动（§6 W2 任务6「ledger/report 不动」），只补回归断言。
- 步骤：
  1. 断言 findings→exit 2、报告 md+json 字段一致性（§4.1 G6 行）。
  2. 确认 ledger 单写者/journal 全量留痕回归绿（§4 表 G6 行）。
  3. SARIF 输出不落本波（§4.1 G6 注：可移 W5）。
  4. 验证：`npm test` exit 0。
- 产出：G6 回归断言（代码零改动）。
- 关联断言：§4.1 G6（A-G6）。

#### W2-T08 真机 suite：`docs/tests/2026-fork-gates/`

- 改什么：新增 suite 目录（MANIFEST/evidence/runs/stats.json），对齐 `docs/tests/STANDARD.md`（§6 Wave 2 交付物）。
- 步骤：
  1. 四实证：事前拦截时序 / 复述证据被拒 / token 熔断 / lite-full 工具面差异（§7.2 WG2.2 摘要）。
  2. 自主性实证：Run 层全程零人工决策点，无编号菜单/无 ask_user、仅入口 Spec/scope 输入（§1.3 落地约束③，§7.2 WG2.2）。
  3. R-gate n≥3、token 六列入 stats.json（§7.4）。
  4. 跑法用 §8.1 环境栈（WSL ext4 克隆 + ci 用户，权威命令 `npm test`）。
  5. 验证：suite 全 exit 0，MANIFEST+evidence+stats.json 齐。
- 产出：真机 suite + 实证记录（WG2.2/WG2.3 证据源）。
- 关联断言：§4.1 六闸实证汇总；WG2.2/WG2.3（§7.2）。

## 4. 波门验收（判据单源 = PLAN §7.2，此处只引用 ID + 一句话摘要，不复制定义）

- **WG2.1** 单测矩阵：`npm test` 六闸负向矩阵——§4.1 六行断言全绿、每闸 ≥1 负向、含 G4 watcher 默认关负向断言（§6 另记 `npm run check` exit 0）；证据落点=测试名清单。
- **WG2.2** 真机 suite `docs/tests/2026-fork-gates/`：四实证 + Run 层零人工决策点自主性实证、R-gate n≥3；证据落点=MANIFEST+evidence。
- **WG2.3** 回归：测试总数 ≥ 合并基线（fork 578 + 内核 75 + 新增）只增、suite token 六列齐；证据落点=stats.json。

## 5. 风险与回滚

- 直改腿热点 rebase 冲突面：`tools/index.ts`、`system-prompt.ts`、`agent-session.ts` 三热点（§3.6.3）——每个直改独立 `fork(coding-agent): …` 提交，冲突按提交粒度重解（§3.6.4，W0「取上游+重打改名」先例）；回滚=revert 对应单提交即单闸回退。
- task 工具 spawn 验证：`child_process` spawn/回收受本机 WSL 环境栈影响（§8.1：WSL2 回环竞态、/mnt/c 9p 慢 IO、路径空格坑）——真机断言必须在 WSL ext4 克隆 + ci 用户下跑并留 ECONNREFUSED 计数；环境级问题按 §8.1 处置，不改上游测试语义（§3.6.6）。
- watcher 额外 token 成本：每 N 轮复核增加开销——默认关兜底（评分 #3 判定，§2.6.1），Spec 开关可控、紧急即关并 journal。
- 波门不可跳、测试只增不减（§7.1）；rebase 演练每波必跑（§3.6.4，WG0.4 先例）。

## 6. 证据清单

- `npm test` 全量日志（exit code + 六闸负向测试名清单，对齐 §4.1 六行断言）+ `npm run check` exit 0 日志。
- 真机 suite `docs/tests/2026-fork-gates/`：MANIFEST + evidence + stats.json（token 六列，WG2.3 落点）。
- journal 样本三类：`scope_denied` block 行（时间戳早于工具日志）、`token_budget_exhausted` 熔断行、估值分类 correct/fail/hallucination 三值行。
- 波门证据落点对齐 §7.2（测试名清单 / MANIFEST+evidence / stats.json）；归档后在 PLAN §8.1 追加本波记录。
