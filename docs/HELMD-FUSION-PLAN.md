# helm × helm-d 融合方案（对比 → 入口设计 → 分阶段落地）

> **状态**：方案稿（待拍板，未开工）。日期 2026-09-30。
> **性质**：决策文档。活动架构基线仍是 [`REDESIGN.md`](REDESIGN.md)；本文只回答"两个项目怎么合、入口怎么更高级、旧痛点怎么闭合"。
> **事实来源**：本仓 `packages/**` 实测 + `docs/old-project-painpoints.md` + `docs/plan-helmd-methodology-integration.md` + `reference/repos/helm-d`（浅克隆，commit 见 `reference/repos/helm-d/.git`）。

---

## 0. 一句话结论

**helm-d 赢在"确定性入口"（信号→域→工具两张表 + 首轮锚定 + 按需知识），输在"没有账本与门"；helm 恰好相反。**
融合的正确形态不是把 helm-d 塞进 helm，而是**把 helm-d 的两张确定性表升级成 helm 的门与坐标**：样本进来先算分诊（不许猜），分诊产物（域坐标 + playbook + 工具 + 存证格式）落进 case，再由 helm 既有的账本 / 阶段门 / 完成链接管执行与判完成。

---

## 1. 两个项目的机制对比（逐项实测）

### 1.1 定位与形态

| 维度 | helm-d（旧） | helm（现） |
|---|---|---|
| 宿主 | DSH（Cordis 深插件 + preset 双源） | Pi 扩展（`before_agent_start` 单点注入） |
| 形态 | 9 个 bundle 包：`helmd` 主包 + `router` + `bootstrap` + `toolbox` + `skill-{ai-security,android,evidence,malware,native,protocol,web}` | 3 个包：`helmpi-kernel`（插件+知识）/ `helmpi-tools` / `helm-coding-agent`（宿主壳+CLI） |
| 知识 | 每 bundle 自带 `references/`，`refRoot` = `import.meta` 包根（**永远可读**）· 362 文件 / 3220 KB | 单点 `packages/helmpi-kernel/references/`，**解析走 cwd**（装态读不到）· 106 篇 / 811 KB（S1 已移植） |
| 工具面 | README 称 **33 个工具**（含 `tool_recommend` 等确定性工具） | **13 个**内核工具（见 1.3） |
| 注入 | 单一 persona（`complete: true`）+ `AGENTS.md` 作为 system-reminder | `composeSystemPrompt` 合成段：`<helm_s1>` + `<helm_phase>` + `<helm_normalize>` + 可选记忆/提醒 |
| 状态 | 会话上下文 + `CASE.md`（**无可重放账本**） | `.helm/ledger.db` + phase journal（**双账本**）、case 工作区 |
| 门 | 方法论写在 persona/AGENTS，**无代码强制** | Spec + L1–L6 lint 阻断 + G2 scope gate（fail-closed）+ G4 预算硬停 + finish misframing 门 |
| 完成判定 | 散文 + 关案弱检查（`end_case` 计数/正则） | `completion.ts compileFinish`（`done_when` / `finish_basis` / receipt 精确切片校验） |
| 分发 | Release tarball + `install.ps1/sh` 写 preset | npm 包 + 二进制载荷 + 一键脚本（四门绿） |
| UI | 自造设置卡抢 `settings.plugin.item`（抢位事故） | 命令面优先（`helm init/run/report/doctor/validate-scope`） |

### 1.2 helm-d 的三件"确定性"资产（真正值钱的东西）

**① 域路由表**（`reference/repos/helm-d/packages/router/src/index.ts:11-29`）

```
native: 'PE/ELF/Mach-O/shellcode -> @helm-d/skill-native'
shell : 'packer/UPX/VMP/Themida/OLLVM -> detect_packer -> skill-native'
strings: 'signature/URL/error-string -> scan_strings -> skill-native'
crypto: 'XOR/Base64/Hex/AES -> xor_bruteforce/encoding_detect -> skill-native'
ioc   : 'IOC/hash/domain -> ioc_extract/yara_gen -> skill-malware'   … 共 17 条
```

三段式：**信号 → 工具 → 知识包**。它是"可发现性元数据"，由 `skill_catalog` 工具暴露。

**② 工具推荐表**（`packages/toolbox/src/index.ts:13-85`）

```
tool  : '工具获取: 先查本机 → 无则除 C 盘外最大盘建 X:\Reverse\ 下载 → 超时先探代理…'
vmp   : 'VMP → VMPStaticUnpacker … | 替代: 动态 dump | 存证: unpacked PE'
pe_inspector: 'PE 恶意检测 → pe-inspector（Unipacker 脱壳+ClamAV/YARA+EMBER）| 存证: JSON+HTML'
```

**信号 → 工具 | 替代 | 存证格式**，由 `tool_recommend` 工具暴露；查不到时的兜底是硬编码的
`'triage-and-route: detect_packer + scan_strings + create_case + hash_artifact'`（`:107`）——
**这条兜底本身就是"分诊链"的声明**。

**③ 纯规则脚本**（无模型参与）

- `packages/router/scripts/module_router.py`：关键词 → 模块名清单（9 组规则）
- `packages/router/scripts/index_skills.py`：扫 `skills/*/SKILL.md` frontmatter → 生成 `references/generated-index.md`

另有两件"工程清洁度"资产：
- `packages/bootstrap/src/index.ts:88-99`：首轮工具收窄（只暴露 shell+common，promote 后放开；子代理豁免；缺工具则 warn-once 并**降级为全量**而不是残废）
- `packages/router/src/seam.ts`：能力缝（`ctx.fs` / `ctx.subprocess` 优先、本地 node 兜底）、输出上限 256 KB、`python/py/python3` 解析——**宿主可拔**

### 1.3 helm 的工具面实测（13 个）

```
helmpi_validate_scope · helmpi_status · helmpi_mode · tool_memory · helmpi_phase
begin_case · save_evidence · record_finding · route_task · case_status
read_reference · skill_index · normalize_input
```

**零命中**（对 helm-d 的确定性动作工具逐一核过）：
`tool_recommend` ✗ · `find_tool` ✗ · `sample_intake` ✗ · `scan_strings` ✗ · `detect_packer` ✗ · `yara_gen` ✗ · `ioc_extract` ✗

**含义**：helm 现在会让模型"读 index.md 自己找域"（`skills` 的 description 规范写得很好，但这仍是**模型自觉**）；
helm-d 里由表回答的问题（该用哪个工具、存证成什么格式、该读哪一篇），helm 侧现在是空白。

### 1.4 helm 的 route_task 现状

`packages/helmpi-kernel/src/router.ts`：16 条 `kw` 表 + `matchRoute`（纯关键词计分）+ `renderRoute`
输出 `PRIMARY / 依据 / 备选 / 建议: read_reference index 或 tool 首件 → 路由到 <key>`（`:65-89`）。

**它是提示，不是接线**：route 命中后，没有任何机制把"该读的那一篇 + 该跑的 playbook"落到模型手里。
命中 `shell` 时，模型拿到的是一行 `PRIMARY: shell — 保护器/壳`，而不是
`references/re/packed-elf-entropy-chain.md` 的坐标。

---

## 2. 旧痛点 × 现状 × 本方案负责闭合的部分

按 `old-project-painpoints.md` 的杀伤力排序逐条对照（✅ 已闭合 / 🔶 本方案补 / ➖ 已决策不做）：

| # | helm-d 旧痛点 | helm 现状 | 本方案 |
|---|---|---|---|
| A | **宿主耦合 / preset 双源 / 静默残废**（44 工具→0 平台工具事故） | ✅ 不进 Cordis preset 深水；单点 `before_agent_start`；分发四门绿 | 🔶 加"启动自检"：断言期望工具集 + 知识根可读（把静默残废变成启动即报） |
| B1 | **无权威状态**（靠会话 + CASE.md） | ✅ ledger.db + journal + case 工作区 | ➖ 不动 |
| B2 | **完成断裂四层**（单步/阶段/关案/语义 goal） | 🔶 `compileFinish` 已有 `done_when`/`finish_basis`/receipt 切片；**缺** GoalVerifier（L4）与 Domain 阶段门测试 | 🔶 **P2**：分诊产物驱动阶段门 + L4 可选 oracle |
| B-阶段门 | **无代码强制的阶段门** | 🔶 playbook YAML 已有（api/web-pentest/ctf/reverse），但**没有"出口交付物齐了才准进下一阶段"的断言** | 🔶 **P2**：playbook gate 落成 Domain 测试 |
| B-范围 | **范围靠 persona 声称** | ✅ ScopeGate（G2 fail-closed）+ exit 3 | ➖ 不动 |
| C | **行为层与知识层纠缠**（persona 16k、references 637+ md） | ✅ persona 已收敛进 `<helm_s1>`；知识精选（S1 落地 106 篇，现盘 125 篇）+ 索引完整性门 | ➖ 不搬 331 个工具表/CVE |
| D | **UI 抢位** | ✅ 命令面优先 | ➖ 不做 UI 抢位 |
| E | **发布摩擦** | ✅ 四门（shrinkwrap / install-lock / consumer / check） | 🔶 载荷补 `references/`（P0） |
| F | **值得原样继承 7 条** | 🔶 已继承 4 条（按需读 / 证据文化 / 六域体量 / 五步流程骨架） | 🔶 **P1 补**：工具推荐阶梯 + 首轮锚定（见 §3） |

**一句话**：A/B1/C/D/E 大体已闭合；**B2 的"阶段门+语义 goal" 与 F 的"确定性入口"是本方案的两个主战场**。

---

## 3. 更高级的入口设计（本方案的核心）

### 3.1 为什么"分诊算出来"比"模型猜"高级

现状链路：模型拿到样本 → 自己决定读哪篇 index → 自己决定用什么工具 → 自己决定存证格式。
风险：漏读、错读、跳基线（helm-d §8 反理性化表里的"先快速看一眼"/"我知道这个壳"正是这种失败的名单化）。

**目标链路**：样本进来 → **一次确定性分诊** → 产出结构化坐标 → 坐标落 case → 首轮注入 → 模型按坐标执行。

```
样本/materials
   │  intake（确定性：magic/哈希/段熵/壳签名/字符串头/PE 结构）
   ▼
intake.json  { type, arch, sha256, entropy{whole,perSection}, packer{name,signals[]},
               signals[], domain, refs[具体文件], playbook, tools[{name,why,evidenceFmt}],
               next[编号化第一步], confidence }
   │
   ├─► case 工作区（与 evidence/findings 同级，随案持久化）
   ├─► 首轮注入：<helm_intake> 段（P1）—— 坐标进上下文，不用模型找
   └─► 门联动（P2）：intake.playbook 成为本案阶段门；出口交付物缺 evidence_refs 不准进下一阶段
```

### 3.2 比 helm-d 高级在哪（三点，逐一对照实现）

| # | helm-d 的做法 | 本方案 | 高在哪 |
|---|---|---|---|
| 1 | `bootstrap` **收窄工具集**防首轮乱翻 | 首轮**给知识坐标**（refs+playbook+工具表），**不收窄工具** | helm-d 收窄工具曾直接把会话打残（事故 A）；坐标注入是加法不是减法，无残废风险；模型不必"猜该读哪篇" |
| 2 | `router` 表 + `tool_recommend` 表是**两个包里的两份数据**，靠模型分别去问 | **单源表**（一张 `signals.yaml`：信号→域→引用→工具→存证格式→playbook），由 router、intake、skill_index **共用同一加载器** | 消除双份表漂移；表项可被测试钉住（引用必须存在） |
| 3 | 表是**建议**（"模型自主判断，不作为硬性规则"） | 表仍是建议，但**坐标的存在性与门的出口是断言**：intake 给的 refs 文件必须存在、playbook 必须存在、阶段出口必须带 evidence_refs | 建议归建议、可验证归可验证——这正是 painpoints §3 的验收标准 8「方法论可测」 |

### 3.3 入口形态（三种，同一实现）

```powershell
# ① 显式：CLI（人/CI 用）
helm intake samples\SAMPLE.exe            # → intake.json + 打印坐标
helm intake samples\SAMPLE.exe --json     # 机读

# ② 会话内：内核工具（模型用，但不需要它判断——表已经算好了）
sample_intake path="samples/SAMPLE.exe"   # 返回同结构；已存在则读缓存

# ③ 自动：case 建立时若工作区有样本且无 intake.json → 首轮提醒"先跑 sample_intake"
```

三种入口**同一实现**（一个纯函数 + 一个脚本壳），保证 CLI 与会话内结果逐字节一致（可断言）。

---

## 4. 更高级的解法（把 helm-d 的建议升级成 helm 的门）

| 能力 | helm-d | 本方案（helm） |
|---|---|---|
| 阶段推进 | AGENTS §4 六阶段（人点选决策点） | playbook YAML 阶段门 + **Domain 测试**断言出口交付物带 `evidence_refs` |
| 单步完成 | 无 `done_when` | ✅ 已有 `compileFinish`；**补**：intake 的 `next[]` 每项附 `done_when` 建议 |
| 关案 | `end_case` 计数 + 正则 | ✅ 结构门已有；**补** L4 语义门（可选 oracle：flag/hash/脚本断言），拿不出 oracle 时如实标"语义目标未证明" |
| 收敛 | 无（PentestGPT 式空转被记录在案） | 复用 `kindStreak` 上限 + intake 的 `next[]` 排序（先静态后动态、先分诊后深挖） |
| 知识 | 637+ md 全量分发 | 精选知识体（现 125 篇 / 834 KB，10 域）+ 索引完整性门（已有） + **P1 表驱动坐标** |

---

## 5. 分阶段落地方案

### P0 — 解析面 + 载荷面（消除"装了读不到"）

| 改动 | 位置 | 验收 |
|---|---|---|
| `resolveReferencesRoot()`：**包根优先**（`import.meta` → 安装态 `dist/../references`）+ **cwd 兜底**（工作区自定义域覆盖） | `packages/helmpi-kernel/src/index.ts`（`read_reference:971` / `skill_index:984`）、`cli.ts:156`、`index.ts:116` | 三种安装态（源码检出 / npm / 二进制载荷）下 `skill_index` 均列出 10 个域；`read_reference re/index.md` 出熵链索引 |
| 载荷补知识：拷贝清单加 `references` | `scripts/build-binaries.sh`（`cp -r docs` 同级） | 解包载荷后 `references/` 存在且域数=10 |
| doctor 增 RE 探针（crackme/PE 场景） | `helm-commands.ts` `PROBE_SET` | `helm doctor` 报 `strings/readelf/file/python3` 等；RE 工具缺失只标 stale 不失败 |

### P1 — 确定性分诊入口（本方案主体）

| 改动 | 位置 | 验收 |
|---|---|---|
| **单源信号表** `references/signals.yaml`（信号→域→refs→工具→存证格式→playbook），由 router/intake/skill_index 共用加载器 | 新建 `packages/helmpi-kernel/src/signals.ts` + `references/signals.yaml` | 表加载器单测；表项指向的文件**必须存在**（扩展 `references-index.test.ts` 的门） |
| `sample_intake` 内核工具（确定性：magic/哈希/段熵/壳签名/字符串头/PE 结构；纯读，不执行样本） | 新 `packages/helmpi-kernel/src/intake.ts` + 工具注册 | 对 `crackme`（无壳）与构造的 UPX 样本断言 `packer.name`、`domain`、`refs` 三项 |
| `helm intake <path>` CLI（同一实现） | `packages/coding-agent/src/cli/helm-commands.ts` + `helm-intake.ts` | CLI 输出 == 工具输出（同 fixture 对比） |
| `intake.json` 落 case + 首轮 `<helm_intake>` 坐标注入 | 内核 index.ts（提醒/段落装配处） | 新 case 首轮提示含 refs 具体路径与 playbook 名 |
| 关掉"模型自己猜域"的旧路：`route_task` 输出追加 `refs` 坐标 | `router.ts renderRoute` | 命中 `shell` 时输出含 `references/re/packed-elf-entropy-chain.md` |

### P2 — 门联动与完成链加固

| 改动 | 位置 | 验收 |
|---|---|---|
| `intake.playbook` → 本案阶段门（出口交付物需带 `evidence_refs`） | `playbooks/*.yaml` + kernel 门 | Domain 测试：缺 refs 时拒绝进下一阶段 |
| L4 GoalVerifier：可选 oracle（flag/hash/脚本）判定语义 goal；无 oracle 如实标注 | 新 `packages/helmpi-kernel/src/goal-verifier.ts` | 两个用例：oracle 通过 → `verified`；无 oracle → 报告标 `语义目标未证明` |
| helm-d §8 质量门禁落成断言（"不因一条字符串推断调用链"等） | `packages/helmpi-kernel/src/*.test.ts` | 断言测试集 ≥6 条 |

### 可选 P3（先不排期）

`tool_recommend` / `find_tool` / `scan_strings` / `detect_packer` / `yara_gen` / `ioc_extract` 六个确定性工具搬运 —— **前置条件**：先确认它们过 helm 的 G2 网关（helm-d 沙箱机制弱，见 R2），否则只搬"表"不搬"手"。

### 轻量替代路径：技能形态（skill-first，待拍板）

**动机**：P1 的内核改造（新工具注册 + 表加载器 + CLI 同实现 + 断言）偏重；`plan-helmd-methodology-integration.md §4.1:275-280` 已定过原则——**"形态：技能，不是工具"**（零新增权限面、走 `bash` 照过 Gateway 五门、零新增依赖）。先把"分诊表 + 流程 + 坐标"做成技能文本，用出稳定表结构后再机械化。

**技能落点（实测路径，别写错目录）**：

| 层级 | 目录 | 来源 | 现况 |
|---|---|---|---|
| **用户级**（装一次，所有工作区生效） | `~/.helm/agent/skills/` | `getAgentDir()/skills`；`package-manager.ts:931`（`globalBaseDir = this.agentDir`）+ `:2418` + `:2513` 采集 | 目录**不存在**（`~/.helm/agent` 存在：auth.json / models-store.json / settings.json / phase.db / sessions） |
| **项目级**（随工作区，可提交 git） | `<cwd>/.helm/skills/` | `resource-loader.ts:889` + `package-manager.ts:2424` + `:2461` | 本仓不存在 |
| 其他可用 | `~/.agents/skills/`；settings `skills` 自定义目录 | `package-manager.ts:2428` / `settings-manager.ts:140,471` | 均不存在 |

> **`CONFIG_DIR_NAME` 实测 = `.helm`**（`config.ts:504` 读 `pkg.piConfig.configDir`；coding-agent `package.json` 的 `piConfig = {name:"helm", configDir:".helm"}`）。
>
> ⚠️ **同时发现一处死文件问题**：仓库自带的 4 个技能在 **`.pi/skills/`**（`add-llm-provider` / `interactive-testing` / `release` / `web-fetch`），而 helm 的发现路径是 `.helm/skills` —— 全源码**没有 `.pi` 兼容扫描**（只有 `experimental/server.ts:50` 一处用 `.pi/server`，与技能无关）。⇒ 这 4 个技能对 helm 的自动发现是**死的**，只有 `AGENTS.md` 里"手工 load 文件"那条路在用。修法：迁到 `.helm/skills/`（或确认宿主兼容后再定）。

**两条安装路径（可并存，都不动内核）**：

| 通道 | 动作 | 落点 | 幂等/开关 |
|---|---|---|---|
| **安装脚本**（`install/install` / `install.ps1` / npm 薄壳） | 载荷多带一份 `skills/`，解包后写入**用户级**技能目录 | `~/.helm/agent/skills/<name>.md` | 幂等覆盖；`--no-skills` 可关 |
| **`helm init` 向导**（已写 `.helm/spec.json`） | 顺手写**项目级**技能 + 坐标提示 | `<cwd>/.helm/skills/<name>.md` | 已存在则不覆盖（同 `--force` 语义） |

**硬依赖不变**：技能是文本，它给出的坐标（`references/...`）必须先可达 —— 即 **P0 那两处（解析链 + 载荷拷贝）与技能同批交付**，否则技能再准也是空指针。

**复用建议（顺带发现）**：`config.ts` 已有 `getPackageDir()`（bun 二进制 → `dirname(process.execPath)`；node → `dist/`；tsx → 包根）—— P0 的 references 根解析**直接复用它**，不要手搓三种形态判断。

#### 已定需求：技能随安装脚本分发（技能 = helm 的一部分）

**要求**（用户拍板）：知识技能不是可选附件，**随载荷分发，由安装脚本落盘**。

**实测约束（三条，决定做法）**：

| # | 事实 | 锚点 | 影响 |
|---|---|---|---|
| 1 | 发现函数在 **pi 模式**下认**技能根目录下的任意 `.md`**（`dir === root`），并递归子目录；agents 模式只认子目录 `.md` | `package-manager.ts:404-431`（`shouldIncludeMarkdownFile`）+ `:383`（`SKILL.md`） | 平铺 `~/.helm/agent/skills/x.md` **可用**；不必强制一技能一目录 |
| 2 | 技能文件 = **frontmatter（`name`/`description`）+ 正文** | `.pi/skills/release.md` 实测 | 每份技能必须带 frontmatter，否则目录里认不出描述 |
| 3 | **仓库根 `.helm/` 被 gitignore** | `.gitignore:48` `**/.helm/` | 源若放 `.helm/skills/` **进不了库**，需白名单手术 |

**顺带更正**：仓库 4 个技能（`.pi/skills/*.md`）对 helm 的自动发现是死的 —— 原因是**目录名**（helm 的 `CONFIG_DIR_NAME=".helm"`，全源码无 `.pi` 兼容扫描），**不是文件名或格式**（pi 模式接受平铺 `.md`，它们格式完全合规）。

**交付链（单源三用）**：

```
源（唯一真源，入库）
  └─ 候选 A：<repo>/.helm/skills/*.md   ← 需 .gitignore 白名单（下方），开发态与装态同构
     候选 B：<repo>/skills/*.md        ← 零 .gitignore 改动，但开发态不自动发现
        │
        ├─► 二进制载荷：build-binaries.sh 新增一条 `cp -r <源> "$OUTPUT_DIR/$platform/skills"`
        ├─► 安装脚本：解包后 `skills/*.md` → `~/.helm/agent/skills/`（用户级，一次装好、所有工作区生效）
        │             install / install.ps1 各加一步；幂等；`--no-skills` 可关
        └─► npm 薄壳 postinstall：写同一用户级目录（复用现有 postinstall.mjs，新增一步）
```

**候选 A 的 .gitignore 白名单（精确形态，只放行根级）**：

```gitignore
**/.helm/          # 现有：所有层级忽略
!/.helm/           # 放行根级 .helm 目录本身
/.helm/*           # 根级内容默认仍忽略（保状态文件不被误提交）
!/.helm/skills/    # 只放行根级技能目录
```

**验收（命令 + 断言）**：

1. 载荷：解包后 `skills/*.md` 数 ≥ 源文件数，逐文件 sha256 与源一致。
2. 安装：`install.ps1 -DryRun` 计划含技能拷贝；真装后 `~/.helm/agent/skills/<skill>.md` 存在且 sha256 == 源。
3. 发现生效：在**任意工作区**启动 helm 会话，技能出现在技能目录（可读 `settings`/启动日志的技能清单；或加一条 kernel 自检断言"用户级技能目录非空且至少 N 份带 frontmatter"）。
4. 幂等：重跑安装器不产生 `.bak` 堆叠、不改动与源一致的文件。

**待拍板**：源放 **候选 A**（改 .gitignore，开发态即用）还是 **候选 B**（零改动，仅装态可用）；以及是否把现有 4 个技能一并迁移并纳入载荷（建议一并，避免"产品自带技能一半死一半活"）。

#### 实现状态：已落地（2026-09-30，候选 A + 一并迁移）

| 项 | 落地 |
|---|---|
| 技能源 | `.helm/skills/`（迁移 4 个 + 新增 `sample-intake.md`） |
| 入库 | `.gitignore` 白名单（根级 `.helm/skills/` 放行，其余 `.helm` 仍忽略） |
| 载荷 | `scripts/build-binaries.sh` 拷 `skills/`；源树缺目录时告警不中断（安装器已有 "no skills in payload" 兜底） |
| 安装脚本 | `install/install`、`install.ps1`：装到 `(HELM_CODING_AGENT_DIR\|~/.helm/agent)/skills`，内容比对幂等；`--no-skills` / `-NoSkills` / `HELM_INSTALL_SKILLS=0` 可关 |
| npm 薄壳 | `packages/helm-installer`：`postinstall` + `lib/payload.mjs::installSkills` 同一落点，输出 `skills: N updated, M unchanged` |
| 验证 | 包测试 11/11 · bash 安装器 5/5 · PS1 安装器 4/4 · 载荷拷贝逻辑 2/2 · 宿主发现链 4/4（仓库 `.helm/skills` 5 个技能被识别 + 用户级目录被识别 + description 进系统提示 + 空环境对照）· `npm run check` exit 0 |
| 顺带修复 | 两个整仓遍历自检脚本（`check-pinned-deps`、`check-ts-relative-imports`）会把 vendored 第三方克隆当产品代码扫 → 已按 `.gitignore` 意图跳过 `reference/`、`research/` |

**发布流依赖**：源码归档用 `git archive <commit>`，故 `.helm/skills/**` 必须**入库**后发行包才带技能（未入库时 build 只告警）。



---

## 6. 风险与待决

| # | 风险 | 说明 | 缓解 |
|---|---|---|---|
| R1 | **表与实现漂移** | 信号表、router kw 表、references 目录三处描述同一件事 | 单源 `signals.yaml` + 启动/测试断言（P0/P1 已有门） |
| R2 | **搬来的脚本绕过网关** | helm-d 的脚本未经 helm ScopeGate | P3 前置：逐个确认走 `bash` → G2；不满足只搬表 |
| R3 | **分诊误判** | 熵阈值/签名误报（自研壳、非标准段名） | intake 输出带 `confidence` 与 `signals[]`；拿不出信号只标 `unverified`（沿用现有证据纪律） |
| R4 | **噪声底** | 6 题库单次对比无效（`plan-helmd-methodology-integration.md §5.6`，实测 6/18 vs 11/18） | 效果类验收改 ≥5 run 或 ≥120s；机制类验收用断言不用统计 |
| R5 | **知识体量回涨** | 搬全部 331 个工具表 = 回到旧膨胀 | 明确不做（§7），只补 15 篇方法论级 + 表 |

**待你拍板**：① P0 是否立即做（消除装态读不到，半天量）；② P1 表格式（`signals.yaml` 单源 vs 沿用 router.ts 内联表）；③ P2 的 L4 是否采用"可选 oracle + 如实标注"的弱判定。

---

## 7. 明确不做

1. **不搬** 331 个工具表 / CVE / PoC（旧膨胀主因，`plan-helmd-methodology-integration §2.3` 已判）。
2. **不引入** Cordis preset 双源与深插件模型（事故 A 根因）。
3. **不把 persona 塞回 prompt**（`<helm_s1>` 已收敛；知识一律按需读）。
4. **不做** UI 抢位（命令面优先）。
5. **不把** 分诊表写成硬规则替代模型判断——表给坐标，判断仍归模型；**可验证的只有"坐标存在"与"门出口合规"**。

---

## 附：与既有文档的关系（实测核对，2026-09-30）

| 文档 | 关系 |
|---|---|
| `old-project-painpoints.md` | 本文的痛点来源（只读历史） |
| `plan-helmd-methodology-integration.md` | **已落地 S1，本文接续不重复**（详见下表） |
| `REDESIGN.md` | 架构基线；本文不改其不变量，P2 的 GoalVerifier 需与其完成链对齐后落地 |
| `references/index.md` | 知识入口；P1 的单源表是它的**机器可读版**，不替代它 |

### 与 `plan-helmd-methodology-integration.md` 的分工（核实过，不是重提）

| 那份方案 | 状态（实测） | 本文关系 |
|---|---|---|
| **S1** 补 references 知识体 | ✅ **完成**：提交 `5bc58463f`；盘上 **125 篇 / 834.4 KB / 10 个域**（含 `playbooks/`、`re/`）；4 个索引门测试在跑（`references-index.test.ts`：非平凡树 / 链接可解析 / 文档可达 / 索引不虚报） | **地基**。本文 P1 的单源信号表**引用**这批文件，不搬家 |
| **S3** `finishTurn` 阶段边界 | ✅ **判断修正并已交付等价物**：`propose.ts` lease、`loop.ts` `kindStreak`、`completion.ts compileFinish` 早已存在（有测试），真缺口是 prompt 未陈述 → 已补 `<helm_phase>`（`88e503d1c`），并把 `DEFAULT_SAME_KIND_LIMIT` 提到 domain 层 | 本文 P2 在其上加"阶段出口带 `evidence_refs`"的 gate 测试 |
| **S2** pentest-kit 作技能接入 | ❌ **未开始**；且 helm-d 当前 HEAD（`4788acc`）**已无 `pentest-kit/`** 目录 → 前提需先复核 | 归入本文 **P3**，且共用同一条前置（R2：搬来须先过 G2） |
| §3.4 验证"抽查 3 个 reference 工具" | ⚠️ **该验收不成立**：`ai_reference` / `malware_reference` / `protocol_reference` 在 helm 里**未注册**（`git grep` 只在 references 文档文本内命中），它们是 DSH 宿主侧工具 → 验的是宿主，不是 helm 自身 `read_reference` | **正是 P0 的必要性证据**：helm 自有引用工具仍是 cwd 解析 |

**结论**：那份方案解决的是「**知识体内容**（S1）+ 阶段契约的 prompt 陈述（S3）」；本文解决的是「**入口的确定性**（P1）+ **解析面与载荷**（P0）+ **门联动**（P2）」。两文是**上下层关系**，不重叠；本文的 P1 会改变那份方案 §3.3 保留的"知识读法由模型自主判断"这一条 —— **只在入口一步**（分诊给坐标），进入领域后的读法保持自主。

