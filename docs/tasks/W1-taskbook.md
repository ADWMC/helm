# W1 任务书：内核搬家 + 基建七件套

> 上级：[`PLAN-product.md`](../PLAN-product.md) §6 Wave 1｜状态：**未开始**｜依赖：W0 波门 WG0.1–0.4 全绿（✅ 已达成,见 §8.1）

## 0. 完成定义（DoD）

- WG1.1–WG1.7 **全部绿**（判据单源=方案 §7.2,本书只引用）
- 证据归档（§6 清单）+ 方案 §8.1 追加本波记录
- 波末例行 `git rebase upstream/main` 演练 exit 0（方案 §3.6.4 纪律）
- **双基线合并重定**：fork 578 测试文件 + 内核 75 合并后取新基线（方案 §7.1 规则3）

## 1. 目标与范围

**一句话**：把 helm-pi 内核迁入 fork 成为内建默认扩展，并一次落齐 SoL-Pi/配置分离/tool-memory/i18n 四项基建，使 W2 起所有闸有处接线。

**In**：kernel 迁移、内建默认加载、CLI 七命令、SoL-Pi 内置（默认开）、配置分离+`HELM_*` env、tool-memory、i18n 基建、原仓处置。
**Out**：直改腿热点中属 W2 的三处（tools/index、system-prompt、agent-session——loader/args 属本波）；G1–G6 接线（W2）；engagement/沙箱（W3）；逆向（W4）；评测（W5）；**HCOT 永不**（§0 决策）；Web UI（§5.3）。

## 2. 前置条件

- [ ] 环境栈就位（方案 §8.1：WSL ext4 镜像 `/home/ci/helm`、ci 用户、fixloop.so、伪造 osrelease、rg/fd、swap fstab 常驻、build 步代理）——复跑一条 gate 验活
- [ ] fork 仓干净（`git status` 零未跟踪垃圾）+ `git fetch upstream` 可达
- [x] **双仓处置已拍板（2026-09）：归档+文档随迁**——T08 = docs/（PLAN/tasks/STANDARD/suites）迁入 fork，helm-pi 转 read-only + README 指向（不再是开工阻塞）
- [ ] 参考源在位：`reference/repos/SoL-Pi`（四机制原文）、helm-pi `src/`（迁移源）
- [ ] 无其他待决策项（HCOT/SoL-Pi 默认开/配置分离/env 名/温和子集均已定,见 §0 决策表）

## 3. 任务分解

### W1-T01 · kernel 迁入
- 改：helm-pi `src/**`（ledger/scope/evidence/completion/playbook(+yaml)/export/mcp-bridge/supervise/tool-surface/propose/loop/config/index/cli/host 适配层）→ fork `packages/helmpi-kernel/`；对应测试同迁；新 `package.json`（`@adwmc/helm-kernel`）+ workspace 引用接线（根 `package.json` workspaces、tsconfig、vitest.base alias）
- 步骤：
  - [ ] 建包骨架 + 迁移源码/测试（保持 I1–I19 语义零改动——纯搬迁）
  - [ ] 接线 workspace/alias/build（kernel 入 `npm run build` 链尾或独立 build 步）
  - [ ] `npm run check` exit 0（tsgo/biome/ts-imports 全过）
  - [ ] 迁移测试在 fork 内跑绿 + **与 578 合并计数**
- 产出：kernel 包 + 双基线合并报告
- 关联：WG1.1（迁移零丢失）

### W1-T02 · 内建默认扩展加载
- 改：fork `packages/coding-agent/src/core/extensions/loader.ts:751,772-778`——内建 registry 随 CLI 启动即挂（不再依赖用户 `.pi/extensions`）；`helmpi_validate_scope` **保持首个注册**语义（deny→journal 先于一切工具）
- 步骤：内建注册点实现 → 启动自检 journal 写入 kernel 初始化事件 → 与用户扩展共存顺序测试（用户扩展后挂）
- 产出：内建加载接线 + journal 样本
- 关联：WG1.2（内核活体：journal init + validate-scope exit 语义与原仓一致）

### W1-T03 · CLI 七命令注册
- 改：`packages/coding-agent/src/cli/args.ts`（`--system-prompt` 同层 `:121` 旁）注册 **§1.5 全部七命令**：`helm spec init|run|resume|report|validate-scope|attack-coverage|doctor`；`helmpi` 等价别名（bin 三名已就位）；原 `src/cli.ts` 三子命令行为不变
- 步骤：命令表+分发接入 → `helm --help` 全列 → 别名等价冒烟 → doctor 占位可调（真探测逻辑依赖 T06,本波返回"未初始化"语义并入 journal）
- 产出：命令面单源=§1.5 落地
- 关联：WG5.4①（注册本波完成,W5 端到端验）

### W1-T04 · SoL-Pi 内置（默认开）
- 改：vendor NVlabs 四机制 → `helmpi-kernel/src/efficiency/{action-fusion,observation-pack,evidence-reducer,online-compact}.ts`（MIT/NVlabs 归因保留）；**0.85.1→0.87.1 API 兼容核验记录（先于合入——默认开的前置）**；四机制默认开、helm 自有配置逐项可关（开关不进 pi settings,配置分离）；双载守卫（外部 NVlabs 扩展在场→禁外部+journal）；改写 `docs/COMPAT.md`（三扩展共存→原生+检测）
- 步骤：
  - [ ] 逐机制 API diff 核验（其明文只用公开扩展 API `SoL-Pi/README.md:45`,预期零补丁）→ 记录 `docs/solpi-compat-0.85.1-to-0.87.1.md`
  - [ ] vendor+归因+默认开接线+单项紧急关闭开关（漂移一键关,§8 风险行缓解）
  - [ ] 双载守卫（读宿主扩展列表仅作检测）+ journal
  - [ ] 四机制单测 + **默认开断言** + 每机制 opt-out 负向 + reducer 失败不动原结果
  - [ ] COMPAT.md 改写
- 关联：WG1.4（判据含 API 核验记录 + COMPAT 改写完成）

### W1-T05 · 配置分离 + env 更名
- 改：产品配置文件就位（`.helm/config.json` + `spec.json` + 效率/防御开关全在其内；**格式照 pi 做**——JSON 结构/键名风格随 pi、未知键拒绝校验、不发明新格式）；断言产品代码**不读写 pi settings.json**（读仅限双载守卫处）；env `PI_CODING_AGENT_DIR/SESSION_DIR/标志` → **`HELM_CODING_AGENT_*`**（`config.ts:508-509` 字面量、`cli/setup.ts:6`、`rpc-entry.ts:7`、~10 测试文件 stub 同步——WG0.2 同类机械活,建议子代理代跑后人工复核）
- 步骤：schema 文件+校验器 → env 三处改名 → 测试 stub 扫尾 → `grep settings.json` 写入=0 扫描 → `PI_CODING_AGENT*` 残留=0 扫描
- 关联：WG1.5（三判据:写入 0 / FUNC_HITS=0 / schema 负向过）

### W1-T06 · 工具位置记忆 tool-memory
- 改：`helmpi-kernel/src/tool-memory/{db,schema,recall}.ts`——retain/learn/recall 动词；存 `.helm/` 自有 SQLite；条目=路径/端点+probe 命令+`last_verified_at`；Run 开局召回→G1 prompt 记忆段（token 上限,stale 不注入）；**默认开**；替代静态 `docs/TOOL-MEMORY.md`（迁移其条目为首批,逐条补 probe）
- 步骤：db/schema 实现+严格校验 → recall 注入段（token 上限+stale 降级）→ 负向测试（伪造路径→复验失败→标 stale 不可信）→ doctor 占位改接探测写入
- 关联：WG1.6（四判据）

### W1-T07 · i18n 基建
- 改：`helmpi-kernel/i18n/{en,zh-CN}.json` 单源 catalog + `t(key,params)` API + locale 解析链（helm config `locale`→`HELM_LOCALE`→en,逐键回退）；**机检面/模型面 en 冻结**（journal/json/exit/G1 prompt 永不本地化）；CJK 宽度接 pi-tui stringWidth（断字不断串）
- 步骤：catalog+API → locale 链入 helm config schema → parity 单测（key 集+占位符集相等）→ 缺 key 回退断言 → 机检面不本地化负向 → CJK 渲染快照
- 关联：WG1.7（四断言,§1.6）

### W1-T08 · 原仓处置（**依赖用户拍板,见 §2**）
- 改：helm-pi 原仓 → read-only 归档 + README 指向 fork（建议方案）；`docs/tasks/`/`PLAN-product.md` 迁移或双写策略随决策定
- 步骤：用户拍板 → 执行归档 → §8 勾销记录
- 关联：WG1.3（决策已执行并记录）

## 4. 波门验收（判据单源=方案 §7.2,此处仅索引）

| 波门 | 对应任务 | 一句话判据 |
|---|---|---|
| WG1.1 | T01 | `npm test`+`npm run check` exit 0;双基线合并重定后全绿 |
| WG1.2 | T02 | journal init 事件存在 + validate-scope deny→非 0+journal |
| WG1.3 | T08 | §0 双仓决策已执行入档 |
| WG1.4 | T04 | 默认开断言+每机制 opt-out+reducer 证据保留+双载守卫 journal+**API 核验记录+COMPAT.md 改写** |
| WG1.5 | T05 | settings.json 写入=0;`PI_CODING_AGENT*` FUNC_HITS=0;schema 未知键拒绝 |
| WG1.6 | T06 | 只写 .helm SQLite;伪造路径→stale 负向;召回超限截断;默认开 |
| WG1.7 | T07 | key/占位符 parity;缺 key 回退;机检/模型面无 zh 负向;CJK 渲染断言 |

## 5. 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| 双基线合并后测试口径漂移 | WG1.1 一次重定、之后单调（§7.1 规则3） | 合并计数单独成提交,可 revert |
| SoL-Pi 默认开 × API 漂移（§8 高风险行） | **核验先于合入** + 单项紧急开关 | 关开关（运行时回滚）或 revert vendor 提交 |
| env 改名连坐 ~10 测试 | 子代理机械代改+人工复核,同 WG0.2 流程 | 独立提交可 revert |
| tool-memory 默认开写幻觉路径 | probe+last_verified 必填、stale 降级（WG1.6 负向钉死） | 关 tool-memory 开关（配置项） |
| 双载守卫误禁外部扩展 | journal 留痕可追溯;仅禁 NVlabs 同名 | revert 守卫提交 |
| T08 决策悬空阻塞波收官 | §2 前置显式列出,开工即问 | — |

## 6. 证据清单（归档位置）

- 双基线合并报告（578+75 计数与 diff）→ 本波 §8.1 记录附数字
- journal 样本：kernel init / scope_denied / 双载守卫 / doctor 写入
- 扫描输出：settings.json 写入=0、`PI_CODING_AGENT*`=0、i18n parity、SoL-Pi API 核验记录文档
- `npm test`/`npm run check` 全量日志（ext4 镜像,环境栈 §8.1）
- COMPAT.md 改写 diff、TOML/schema 负向测试输出
