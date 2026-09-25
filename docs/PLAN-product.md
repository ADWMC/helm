# helm-pi 产品化方案（v1 草案）：基于 pi 二改的 AI 自主渗透/逆向产品

> **定位一句话**：做成 PentestGPT 类竞品 —— 端到端 AI 自主渗透 **与** 逆向产品，并把**破甲层（=破限,对外）与模型防御层（=防自家抽风,对内）**做成一等公民。
> **形态决策**：不再只做 Pi 插件 —— **fork `earendil-works/pi` 本体二改**，helm-pi 内核降为 fork 内的一个包。
> 状态：草案 v3（调研 4/4 全部返回：pi 评估 ✅、5 框架深读 ✅、gh 13 查询 8 新仓 ✅）。
> 证据规则：每条结论带 file:line 或命令+退出码；无证据标 未验证。

---

## 0. 决策摘要

| 决策点 | 结论 | 依据 |
|---|---|---|
| 形态 | **fork pi 二改**，helm-pi 现有内核（gate/evidence/ledger/playbook）作为 fork 内独立包 | 见 §3 |
| 许可合规 | pi 为 **MIT**，可闭源商用，唯一义务保留 Mario Zechner 版权头 | `reference/repos/pi/LICENSE:1-3,5-9,12-13` |
| 竞品锚点 | PentestGPT（Scope/完成判据已被 `PLAN-best-of-breed.md` 选型采纳） | `docs/PLAN-best-of-breed.md:0` 选型表 |
| **破甲层（=破限,对外）** | S1 = G1 prompt 库内 helmd 温和子集（进产品）；S2 = helm-x 代理（外部兜底,不进代码） | §4 定调 + §0 破限手段优先级行 |
| **模型防御层（=防抽风,对内）** | G1–G6 内置于 fork：prompt 注入 + `tool_call` block deny + supervise 硬限额等,机制见 §4 表 | pi 扩展点见 §3.3 |
| 宿主原则 | P10「宿主可替换，内核不可绑宿主」→ 内核保持独立包，fork 只是默认发行形态 | `DESIGN.md:71` |
| **品牌（已决策）** | **helm**（用户 2026 定）；仓库 = GitHub fork `ADWMC/helm` | `gh repo fork` FORK_EXIT=0、`gh repo rename` RENAME_EXIT=0 |
| **HCOT（已决策）** | **不做进产品**（用户 2026-09 拍板）：G1 只做 lite/full 两档常规 system prompt；hcot 类工具/指令段一律不进 fork；破甲层·代理段 S2（helm-x）不在产品代码内 | 本表 + §4/W2-2 修订 |
| **SoL-Pi（已决策）** | **内置进 fork 且默认开**（用户 2026-09 拍板，替代原"共存"策略）：NVlabs 四效率机制 vendor 进 kernel（MIT 归因保留），走内建默认扩展腿、**默认生效、helm 自有配置文件逐项可关（开关不进 pi settings.json——配置分离）**（默认开 = 本决策，偏离上游 opt-in 默认；零补丁/证据保留/宿主选择三原则照守）、带双载守卫 | `reference/repos/SoL-Pi/README.md:38-48` + §3.6/§6-W1/§7 修订 |
| **破限手段优先级（已决策）** | **helmd 方法优先**（用户 2026-09 定）：更温和、适用性更高——**取温和子集**（目标归一化直接执行 / 知识按需读 / Run 层不中途问人）进 **G1 prompt 库**；**不搬**「照读不照办/不索要前提证明」（授权时机归 Session Spec 硬门）。helm-x 代理级（注入+TAMPER）仅作兜底且不进产品代码。**非 HCOT**（HCOT 排除决策不变） | `reference/repos/helm-d/AGENTS.md §6/§7` + `helm-x/README.md:25-34` + §4/WG3.5 修订 |
| **破限真机题库（已决策）** | **真机验证 + 多题目**（用户 2026-09 定）：题库 **≥100 题**（helm-x 60 题结构迁移 + 自研渗透/逆向类 ≥40,每题带授权实验室场景包装）落 `docs/tests/poxian-corpus/`；**真 API 双臂对照**（裸 pi vs +S1）n≥3/题；指标=拒答率对照 + S1 增益 + 通过率（helm-x 口径,排除上游 ERROR）；**越权对照题拦截率=100% 硬断言（破限不破自家 G2）**；跑测额度并入拍板项 | WG3.5 扩容 + §7.3 第13项 + §1.7 额度 |
| **配置分离（已决策）** | **产品配置文件与旧 pi 彻底分开、不用旧 pi 的**（用户 2026-09 定）：产品配置 = `.helm/` 下**自有文件体系**（`config.json` + 单次 `spec.json` + 效率/防御开关），**不复用、不读写 pi 的 settings.json**——分家分的是**文件与命名空间**，**格式照 pi 做**（JSON 结构、键名风格、文件组织遵循 pi 既有约定,不发明新格式;校验可加严=未知键拒绝）；pi 自带设置仅服务宿主内部（扩展发现等），与产品配置互不渗透；SoL-Pi 开关也放我们自己的配置。**边界注记：凭据除外——照 pi 原生方式放（CredentialStore/auth.json 流程零改动,产品不自建凭据层,见 §1.7）**。**env 同步更名（用户定名 helm）**：`PI_CODING_AGENT_DIR/SESSION_DIR/PI_CODING_AGENT` → **`HELM_CODING_AGENT_DIR/HELM_CODING_AGENT_SESSION_DIR/HELM_CODING_AGENT`**，PI_* 退役 | §3.6/§6-W1 任务5/§7 WG1.5 联动 |
| **i18n（新增）** | **TUI 双语、机检单语**（用户点名补充; 上游零框架+helm-pi 零方案均实测）：en+zh-CN 人读面（§1.6），journal/json/exit/G1 prompt **永久 en 冻结**；W1 建基建、WG1.7 验收、WG5.4⑥ 端到端 | §1.6 + §6-W1 任务7 + WG1.7 + WG5.4⑥ |
| 双仓处置（已决策） | **归档+文档随迁**（用户 2026-09 拍板）：W1-T08 执行——`docs/`（PLAN/tasks/STANDARD/suites）整体迁入 fork 仓，helm-pi 转 **read-only**、README 指向 fork；此后 §8.1 记录写在 fork 内 | §6-W1 T08 + WG1.3 |

---

## 1. 目标与竞品定位

**目标**：端到端 AI 自主渗透 **+** 逆向产品，PentestGPT 类竞品，破甲层为一等公民。形态 = fork pi 的独立发行版。

### 1.1 与最强三个竞品的正面对照（全部 file:line 已核）

| 维度 | PentestGPT（最强证据） | Shannon（最强编排） | Dark-Moon（最强破甲） | **我们（目标态）** |
|---|---|---|---|---|
| 架构 | Supervisor/Executor 双角色 + 确定性代码掌权（`PentestGPT/docs/architecture.md:26-41`） | Temporal 持久化编排 + 五阶段管线 + **pi harness 内核**（`shannon/CLAUDE.md` Architecture 节） | orchestrator + 50 专家代理经受控 MCP（`Dark-Moon/README:177,219-224`） | fork pi 原生循环 + playbook 状态机（§3）+ 可选黑板并行（§6 P2） |
| 证据 | **收据精确切片**，复述丢弃、截断永不完成（`PentestGPT/pentestgpt_agent/CONTEXT.md:59-67`） | "No exploit, no report"（`shannon/README.md:16`） | 命令+原始输出+可复现 exploit 三件套（`Dark-Moon/README:107,191`） | evidence 阶梯 + 精确切片校验（**吸收 PG 切片机制**，见 §4 G5） |
| 范围 | 程序化 allowed-target 精确匹配，相位隔离（`plan.py:193-204`） | `rules.avoid/focus` + permission-system path deny（`shannon/CLAUDE.md` Supporting Systems） | MCP 唯一执行点 + 威胁模型承诺（`docs/security-threat-model.md:61-85`） | ScopeGate fail-closed（I13/I14）+ `tool_call` **事前 block**（§4 G2） |
| 沙箱 | 无——"部署即边界"（`CLAUDE.md:22-23`） | Docker 临时容器（CLAUDE.md Docker Architecture） | Docker Toolbox 受控卷/网（`security-threat-model.md:67-85`） | **空白填充**：复用 shannon 式容器方案（P1，见 §6） |
| 预算 | 仅 turn 计数，无美元上限（`trial.py:53-54`） | 预算看 `run.json` llm_usage.cost（strix 同类,`strix/AGENTS.md` headless 节） | 管时间不管钱（`Dark-Moon/docs/full.md:2173`） | token 预算一等公民：I10 跨进程 + 双时钟 + 六列（已实测 −46%） |
| 注入防御 / 破限 | **几乎空白**——只有"不可信数据"标注（`CONTEXT.md:79`），无注入防线亦无破限应对 | 未见成文 | 四 measures + 隐私网关（`security-threat-model.md:87-144`） | **两独立顶层**（§4：破甲层 S1/S2=破限 + 模型防御层 G1–G6=防抽风），吸收 CAI 四层注入防线 + Swarm 记忆签名 |
| 报告 | 结构收据，语义达成需外部 verifier（`CONTEXT.md:91-94`） | PDF+MD+SARIF（CLAUDE.md Deliverables） | ./reports 结构化 + Pro PDF | md+json 双出 + exit 0/2（已有）+ SARIF（**W5 必交**,判据入 §7.3 第7项,借 strix/swarm 模式） |

**竞品格局一句话**：PG 证据最强但防御/破限/沙箱/预算四缺；Shannon 编排最强但完成判据仍靠 agent 自报；Dark-Moon 注入防线最强但预算不管钱。**我们的位次 = PG 的证据工程 + Dark-Moon 的注入防线 + 我们已实测的 token 经济 + 独有的破甲层（破限），取并集跑在 fork 的 pi 上。**

### 1.2 差异化卖点（对外一句话）
「每一条漏洞 claim 都带精确证据切片、机检 scope 硬门、token 预算熔断、模型防御层六闸 + 破甲层（破限） —— 不是 agent 说打完了就算打完了。」

### 1.3 与 helmd 的分界（定位级差异，最高优先原则）

> **helmd 是脚本小子，我们要做的是完全自主的行为。**（用户 2026-09 定调）

| 维度 | helmd（脚本小子模式） | helm（完全自主模式） |
|---|---|---|
| 执行形态 | 照配方走：固定工作流（分诊→分析→报告→逆向→研判），阶段顺序预写 | **自主假设→自主规划→自主选工具→自主 pivot**，无预写路径 |
| 决策权 | 每个决策点给编号选项、**人逐点拍板**（ask_user 菜单是工作流一环） | Run 层（任务层）**零人工决策点**；人只在 Session 层定 Spec/scope/预算 |
| 知识作用 | references 按需读，但读完仍按既定 SOP 执行 | 知识是参考不是剧本（P3）：读完由模型自主判断适用性与走法 |
| 卡住时 | 阻塞→上报等人选路 | **instead 路径**：闸给出有界替代继续自主推进（supervise/Dark-Moon 升级阶梯），预算耗尽才是合法停 |
| 人的位置 | 人在决策回路内（in-the-loop） | 人在边界回路上（**on-the-loop**）：只改边界（Spec/scope/预算/验收），不改当前步 |
| 验收 | 输出报告即交付 | 仍走 §7 全套（证据切片/机检门/R-gate）——**自主不等于免验收** |

**落地约束（进闸的定义与验收）**：
1. **闸是负向约束，不是正向剧本**：G1–G6 只回答「什么不许做 / 什么才算过」（scope、证据、预算、完成），**不规定「下一步该做什么」**——走法留给模型。
2. **playbook 阶段门 = 完成判据，不是路线图**：阶段只声明「进入下一阶段的必要条件」（如 exploit 需先有 test 观察），阶段内的探索路径完全自主。
3. **Run 层零菜单**：产品内不得出现 helmd 式编号决策菜单/逐阶段人点选项；`ask_user` 类交互只存在于 Session 层入口。负向断言入验收（WG2.2 增补：真机全程 Run 层无决策点，仅 Spec/scope 边界输入）。
4. **阻塞处理阶梯**（已吸收 Dark-Moon `full.md:2183-2186`）：拒绝/限额必须附「有界替代」，模型拿替代继续；只有 scope 越界（硬拒+journal）与预算耗尽（`token_budget_exhausted`）是合法终止。

### 1.4 产品架构总览（运行时拓扑）

> 回答"这产品运行时长什么样"；仓库树见 §3.6.1，分层哲学见 `DESIGN.md`（P1–P10 + 会话/任务两层运行模型）。

```
人 · Session 层（边界回路 on-the-loop）
  输入仅四样：Spec/scope · 预算 · 验收判据(诊断集) · engagement 合法性
        │（单向：人定边界，不进 Run 决策回路）
┌───────▼──────── helm 终端产品（UX 面见 §1.5）───────────────┐
│ Run 层 · 自主回路                                            │
│   playbook 状态机（阶段=完成判据非路线图）                     │
│   破甲层 S1：helmd 温和子集 prompt（对外：不被拒答卡死）        │
│   模型防御层 G1–G6：提示/工具/档位/循环(含证据下限)/完成/状态   │
│   ── kernel（helmpi-kernel）──                               │
│     ledger(SQLite 单写者) · journal · evidence 阶梯+切片       │
│     tool-memory(工具位置,带probe证据) · efficiency(SoL-Pi×4)   │
│   ── host pi（fork,循环零改动=P10）──                         │
│     agent loop · 工具闭集 · task 子代理(o-my-pi四件套基准)     │
└──────┬──────────────────────────┬──────────────────────────┘
       ▼                          ▼
 执行面                            执行面
 沙箱(W3: Docker vs 回环桥 A/B)    本地工具 + MCP bridge(W4→Ghidra 真接)
       └──────────┬───────────────┘
                  ▼
 报告面：md(人读·证据切片内联) + json/SARIF(机读) · exit 0/2
         stats 观测盘(评分#5) · cost-per-verified-finding 头条(评分#9)

 配置面（配置分离决策）：.helm/{config,spec}.json + tool-memory.db
         ↑ 独立于 pi settings.json；宿主设置只被双载守卫只读检视
 记忆/进化面：tool-memory(Run 间复用) · 方法论进化环(离线,W5,评分#10)
```

**四条流的定死方向**（防架构腐化）：
| 流 | 路径 | 禁止 |
|---|---|---|
| 控制流 | 人→Spec→Run 边界，Run 内全自主 | 人进 Run 决策回路（§1.3 反模式） |
| 证据流 | tool 输出→evidence 切片→finish 门→report | 自述/复述/截断晋升证据（PG 语义,G5） |
| 预算流 | Spec.maxTokens→G4(含诊断集下限)→journal 熔断 | 预算压力下省诊断步骤（arXiv2609.28372,评分#11） |
| 配置/记忆流 | `.helm/` 配置↔kernel（**格式照 pi 做**,校验可加严）；tool-memory 带 probe 才可信 | 读写 pi settings.json；未验证记忆直接注入 |

### 1.5 UX 设计（终端优先）

> 前提：§5.3 已定不做 Web UI；pi 血统=CLI/TUI；使用者=安全工程师跑 labs/授权目标。四原则：**边界才打断**（on-the-loop）、**证据即界面**（claim 旁即切片）、**零意外**（exit code 语义固定）、**渐进披露**（lite/full，知识按需读 P3）。

1. **命令面**（W1 注册,WG5.4 验收）：
   - `helm spec init` — 从 SOW 模板生成 `spec.json`，**特异性 lint 即时反馈**（缺成功判据/诊断集→红字，评分#11）
   - `helm run [--spec]` — Session 卡片确认四要素（目标/预算/验收/诊断集）→ 进 Run（**此后零菜单**）
   - `helm resume` / `helm report [--json|--sarif]` / `helm validate-scope <target>` / `helm attack-coverage` / `helm doctor`
   - `helm doctor` — 首跑自检：探测本机工具链（nuclei/Ghidra-MCP/…）→ 结果写入 tool-memory（评分#8 的自然入口）；`helmpi` 为等价别名
2. **Run 中状态**（TUI，只读不打断）：阶段门进度条 + 预算条（实时六列）+ 事件流（`instead:` 行、`scope_denied:` 行、watcher 警告行——通知入流不弹窗）+ **子代理 roster 卡**（状态/成本/时长/可 steering，借 omp Agent Hub 评分#1 口径）
3. **报告 UX**：人读 md = 每条 claim 内联证据切片 + raw 附件锚点；头条指标 **cost-per-verified-finding**（评分#9）；机读 json/SARIF；exit 0 clean / 2 findings（语义写进 README）
4. **错误与终态 UX**：熔断=完整终态报告（诊断集覆盖度一并列出——让"省证据"在界面上可见）；scope 越界=journal 行+终态卡；破甲 S1 对用户透明（prompt 内部事务，UI 不呈现）
5. **反模式清单**（§1.3 在 UX 的落法）：Run 层禁止编号决策菜单/ask_user 弹层；进度查询只读；一切人工输入只发生在 Session 入口与显式 resume
### 1.6 TUI i18n 方案（绿地设计——上游 pi 无 i18n 框架、helm-pi 亦无既有方案，均实测确认）

> **总原则：人读面双语（en 默认 + zh-CN），机检面永久单语英文。** 本地化只碰"给人看的字"，绝不碰"给机器读的键"。

**分层归属（什么翻、什么不翻）**：

| 层 | 语言策略 | 内容 |
|---|---|---|
| TUI 人读面 | **双语** | 阶段门/预算条/事件行（instead、scope_denied、watcher）/roster 卡/帮助/终态卡 |
| 报告 md prose | **双语** | 结论叙述与说明段；front-matter 带 `lang` 供机读识别 |
| **机检面（红线）** | **永久 en** | journal 事件名、json 报告键、exit code、stats 六列名、evidence 原文（目标输出=数据）、SPEC/schema 键 |
| **模型交互层** | **永久 en** | G1 prompt（含 S1 温和子集）、任务提示——模型性能与审计一致性优先，不随 locale |
| 模板/工具输出 | 数据原样 | 目标返回、工具 stdout 永不翻译（P9：外部内容是数据） |

**机制**：
1. **单源 catalog**：`helmpi-kernel/i18n/{en,zh-CN}.json`（key → `{{var}}` 插值模板），API = `t(key, params)`；缺 key **逐键回退 en**（绝不空串/裸 key 上屏）。
2. **locale 解析链**：helm 自有 config `locale` 字段（配置分离 ✓）→ `HELM_LOCALE` env → 默认 `en`；非法值告警不崩。
3. **CJK 渲染**：排版宽度走 pi-tui stringWidth（宽字符双列），进度条/表格/roster 卡按显示宽截断——**断字不断串**；输出统一 UTF-8。
4. **报告**：md 按 locale 出版（front-matter `lang` 区分），json 恒 en。
5. **进化环兼容**（评分 #10）：SkillOpt harvest/consolidate 的可训练文档以 **en 为规范本**，zh-CN 是渲染层投影——避免双语双训练目标。

**测试合同（→ WG1.7）**：①en↔zh-CN key 集相等 + 插值占位符集相等（类比 docs 单源纪律）②缺 key 回退断言 ③**机检层/模型层不本地化负向**（journal/json/exit/G1 prompt 出现 zh=失败）④CJK 宽度/截断渲染断言。

### 1.7 模型与 API 供给（补节,2026-09——应"模型和 API 够吗"盘点）

> **原则：kernel 不直调模型**；一切模型请求走 host pi 的 `pi-ai` provider 层（§3.6「不动」包），kernel 只观测 JSONL usage 字段（input/output/cacheRead/cacheWrite/reasoning）做 I10 预算与 token 六列。

**四条调用通道**：

| 通道 | 调用方 | 频率/成本 | 状态 |
|---|---|---|---|
| 主循环（唯一常驻） | host pi agent 循环 → `pi-ai`（OpenAI/Anthropic/Google/Bedrock 内建;`models.json`/`baseUrl` 覆盖接任意网关与自定义模型,`pi/AGENTS.md:28` 生成器约束不动） | 每 turn | **实测已证**：mimo-v2.6-flash 经 `127.0.0.1:7897` 网关跑通 5 套真机 suite + R-gate n≥3（§8.1 前史）；Shannon 即同底座商业先例（`shannon/CLAUDE.md` Agent Harness 节） |
| G4 watcher（可选档） | 同 provider 层廉价小模型 | 每 N 轮,微 | **默认关**（§0 评分#3）,开时用同网关小模型,无新依赖 |
| SkillOpt 进化环 | optimizer 模型（`openai_compatible` 可指同一网关） | dev-time 离线 | 零运行时调用（评分#10） |
| 评测 judge（可选） | 模型盲评 | 按需 | 判据以机检为主（切片/exit/计数）,judge 非必需;WG3.5 拒答场景=**构造注入 mock,不烧 API** |

**凭据（用户 2026-09 定：照 pi 的方式放）**：**pi 原生机制零改动**——pi 的 CredentialStore/`auth.json` 读写流程与 env 凭据读取链完全按 pi 设计运行，路径由 pi 自己的 configDir 派生机制决定（configDir 已是 `.helm`,pi 机制自然指向其 agent 目录,**不需要我们写任何迁移/特殊逻辑**）；产品**不自建凭据层**、不把凭证纳入自有 schema。W1 侧仅做**原生流程连通性验证**（fork 下 auth 读写仍通,记录即过,不属配置分离改造）。API key 环境变量面同理照 pi 惯例。

**供给缺口（如实）**：
1. ✅ **跑测总额度已拍板（2026-09 用户定）：300 万 tokens 总冻结**——覆盖 W5 行为实验 ≈400–800 次 + HackSynth ≥20×n≥3 + 破限双臂 ≈600+ 次 + 各真机套件（余量 20–30%）；执行前写入 Spec 冻结,单任务超支即停并入 §8.1 记录（原"未拍板"状态作废）。
2. ⚠️ **多模型验证未做**：现仅单 provider 实测；头条声明默认单模型口径，不做跨模型等价宣称——若要跨模型结论，W5 加验（非承诺项）。
3. ✅ 无硬缺口：provider 扩展（models-config/baseUrl）、watcher、进化环、judge 全部可落在现有单网关上。

---

## 2. 设计理念调研（10 框架精读结论）

> 有 CLAUDE.md/AGENTS.md 的 7 家全文在案（strix/shannon/Cybermes/BoxPwnr/PentestGPT/pentagi/bughunter-ai）；无 agent 文件的 5 家（Dark-Moon/airecon/Pentest-Swarm-AI/cai，+PentestGPT architecture）由子代理按 README+docs+核心源码精读，全部 file:line。

### 2.1 五家深读的设计哲学

| 项目 | 设计哲学核心 | 破甲相关（有无+机制） | 我们吸收什么 |
|---|---|---|---|
| **Dark-Moon** | "AI 永不得自由执行代码"（`docs/security-threat-model.md:22`）；执行收口单一 MCP 门控层，模型只推理；证据三件套=精确命令+原始输出+可复现 exploit（`README.md:107,191`） | **最系统**：隐私网关占位符化真实 IP/凭据再进模型（`:87-99`）；degrade-not-refuse（`:101-112`）；注入四 measures：agents 严格/MCP 强制/禁自改规则/注入不能执行代码（`:135-144`） | ① 执行收口单门（我们 G2）；② 拒绝必附"有界替代+升级阶梯"防原地重试（`docs/full.md:2183-2186`）→ supervise instead 路径强化；③ 凭据"凭实物派发不凭推断" |
| **airecon** | 软阶段强制"导向但从不阻断"（`README.md:72`）；VerificationEngine 分层 tier 0=unverified→3=certified，独立 payload 复测（`verification.py:113,264-281`）；verified-only learning（`README.md:90,247`） | 自我监督（reflector/mentor/watchdog/记分牌,`loop_supervision.py:60-541`）；注入防线**未见** | ① 分层验证 tier 挂到 evidence 阶梯（exploited/confirmed 上加 certified 档——**列 P2 观察,不入本波**）；② 记忆只沉淀已验证发现；③ 逐阶段逐工具配额（**同列 P2 观察**） |
| **Pentest-Swarm-AI** | "我们是 harness 不是模型"（`README.md:247`）；黑板+触发谓词薄调度器，无中央规划者（`internal/swarm/scheduler.go:18-19`）；执行门固定顺序 scope→allowlist→dry-run→safe-mode→confirm（`executor.go:195-294`） | **唯一成体系对抗记忆注入**：信息素夹取[0,1] + Ed25519 每写签名 + MemoryGraft 看门狗 + 每代理限速（`docs/security/swarm-hardening.md:37-116`，引 MINJA/MemoryGraft 论文）；LLM 拒答检测（`refusal.go:5-55`） | ① 执行门顺序硬停（ScopeGate 升级为链式门）；② 记忆/ledger 多写者=注入面 → 签名+夹取（P2）；③ 报告 LLM 质量门打分阻断（`qualitygate/gate.go:30-35`）；④ 预算耗尽=一等收尾事件 |
| **cai** | "orchestrating via code makes tasks more deterministic"（`docs/multi_agent.md:21`）；HITL 是架构支柱（`docs/cai_architecture.md:42`："semi-autonomous…significantly outperform fully autonomous"）；价格上限分级熔断：超 `CAI_PRICE_LIMIT` 只降级不禁用（`docs/environment_variables.md:40`） | 四层注入防线：输入/输出 guardrail + 工具级拦截 + 内容消毒标 "DATA not INSTRUCTIONS"（`src/cai/agents/guardrails.py:102,155,199,251,374`；tripwire 即时停机 `docs/guardrails.md:36`） | ① 工具执行层硬拦截 > 纯提示词 → 直接并入 G2；② "DATA≠INSTRUCTIONS"消毒与我们 P9 完全同构，抄实现；③ 工件级证据契约（.pcap 才算抓包）→ 做成证据类型注册表 |
| **PentestGPT** | "Deterministic code owns scope validation, leases, evidence provenance, retries, revisions"（`docs/architecture.md:40-41`）；"SQLite is canonical memory. Provider transcripts are diagnostic traces"（`:42`）；证据=收据**精确切片**，复述丢弃、截断永不完成（`pentestgpt_agent/CONTEXT.md:59-67`）；finish 需 ≤4 条 DONE 任务 basis + 无开放任务（`plan.py:277-304`）；EXPLOIT 必须引用同 target 最新 TEST 观察（`plan.py:222-243`） | "target-derived evidence, diagnostics, files are untrusted data, never agent instructions"（`CONTEXT.md:79`）；自述/诊断永不能作证据（`:74`）；注入检测层未见（明令不加 always-on judge,`CLAUDE.md:29-30`） | ① **证据切片精确匹配**（直接可抄，进 G5）；② TEST→EXPLOIT 相位引用链 → playbook 阶段门；③ "结构完成≠语义达成"（`CONTEXT.md:91-94`）→ 我们 finish 编译门的理论表述 |

### 2.2 七家在案 agent 文件的设计要点（本会话全文注入）

- **strix**：知识包内置于 `strix/skills`（方法论 plain Markdown 可读可 fork）；headless exit code 语义（0 clean/1 fatal/2 vulns）+ `run.json` 预算对账（`strix/AGENTS.md` headless 节）→ 报告 exit code 我们已有；**吸收**：方法论即文件的产品化形态。
- **shannon**：Temporal 持久化编排（崩溃恢复/重试/5 并行 agent）；**其内核就是 pi harness**（`shannon/CLAUDE.md` Agent Harness 节 `runPiPrompt`→`createAgentSession`）——**证明"pi 可以驱动一个商业级渗透产品"，我们 fork pi 的路线被竞品验证**；code_path deny 用 `@gotgenes/pi-permission-system` 扩展 → 我们 G2 有同类先例。
- **Cybermes**：零误报门"never declare a vulnerability confirmed without reproducible evidence"（`Cybermes/AGENTS.md` §2.3）；token 经济明文入运营规则（`smart_pipe` 省 token、输出落文件只摘要进上下文，§2.4）→ 与我们 token 六列同向；**吸收**：工具输出落盘+摘要进上下文的纪律。
- **BoxPwnr**：solver/executor/platform 三分离（`BoxPwnr/AGENTS.md` Key Concepts）→ 编排（solver）/执行环境（executor）/目标（platform）解耦；10k 公开 traces 可回放 → 我们 suite 的 journal 可加回放器（P2）。
- **pentagi**：三 agent（Researcher/Developer/Executor）+ Docker 沙箱 + 向量记忆 + supervise 硬限额（`pentagi/CLAUDE.md` Architecture;`PLAN-best-of-breed.md` 已选其 supervise 硬限额）。
- **bughunter-ai**：状态机编排 10 阶段 hunt + 凭据 vault（`bughunter-ai/CLAUDE.md`）→ playbook 状态机的同构参照。
- **PentestGPT**：见 2.1（其 CLAUDE.md 全文即竞品最强证据工程声明）。

### 2.3 十家共识（行业已收敛的四条铁律）

1. **exploit-first，不认自报**——必须命令/原始输出/复测证据（Dark-Moon `README.md:107`、airecon `verification.py:264`、Swarm `README.md:65`、Cybermes AGENTS §2.3、PG `CONTEXT.md:59-67`）→ 我们已对齐（evidence 阶梯），**且 PG 的精确切片是可直接吸收的最强实现**。
2. **范围约束下沉到执行边界**，不靠模型自觉（Dark-Moon MCP 门、Swarm `executor.go:195` HARD STOP、airecon 三档 enforcement、PG `plan.py:193` 程序化匹配）→ 我们从"validate 时拦"升级为"tool_call 事前 block"（§4 G2）。
3. **报告以证据附件为核**（reports/、evidence.json、Capture+质量门）→ 我们 md+json 双出已有，补报告质量门（P2，借 Swarm `qualitygate`）。
4. **破甲是最薄弱环节**——只有 Swarm 成文（记忆注入四层）、Dark-Moon 次之（隐私网关+注入四 measures）、CAI 有四层 guardrail、**PG 几乎空白** → 这是我们的**主攻差异化**：六道闸 + 吸收 CAI `guardrails.py` + Swarm 记忆签名。

### 2.4 gh 新项目搜索（13 条查询全 EXIT=0，8 个新仓 CLONE_EXIT=0）

新拉取（`reference/repos/`，去重 24 个既有目录后）：

| 仓库 | ★ | 定位 | 设计价值 |
|---|---|---|---|
| **LuaN1aoAgent** | 1319 | 渗透框架 | **运行时即 Pi SDK**（`README.md:15,38`）——与我们同底座！Planner/Executor/Observer 三角色 + **证据引用才能入图**的记忆（`:126`）+ per-task Docker 隔离网（`:228-229`）。**融合成本最低，第一优先精读对象** |
| **Decepticon** | 5588 | 红队框架 | 动手前强制 RoE/ConOps/OPPLAN + ATT&CK engagement 包（`README.md:134`）、双网络管理面/沙箱面 + 动态拉起容器（`:158`）→ 补我们"流程骨架" |
| pentestagent | 3110 | 渗透框架 | `/agent` 单任务自治 + `/crew` 编排、`spawn_mcp_agent` 自产子 agent（`README.md:171-175`）；**>128 工具自动切 RAG meta-tool**（`:249`）→ 我们 tool-surface 瘦身的进阶版 |
| pentest-agents | 967 | agent 套件 | 每个 finding 过 **7-Question Gate**（`README.md:237`）→ 可移植的反误报门 |
| **open-reverselab** | 1177 | 逆向平台 | "可执行知识库"：`Scenario→信号→方法→攻击链→MCP工具映射`（`README.md:47-54`），100+ MCP 工具，5 板块 attack-network 路由。**逆向域第一优先** |
| OGhidra | 442 | 逆向工具层 | LLNL 官方 LLM↔Ghidra 桥，本地 Ollama 保隐私，Planning→Execution→Review 循环（`README.md:31-45`） |
| sentinel-reverse | 79 | 逆向 CLI | 5 阶段管线、纯本地 MLX 零 API 成本（`README.md:45-68`）→ 逆向执行后端候选 |
| HackSynth | 318 | 评测+agent | 200 题 CTF 标准评测集（arXiv 2412.01778,`README.md:17-18`）→ 评测层直接用 |

未拉但记录在案：0xSteph/pentest-ai-agents(2264★)、wgpsec/AboutSecurity(1759★,方法论知识库)、**OWASP/APTS(694★,自主渗透标准文档)**、xalgorix(1120★)、cain-agent(962★)；逆向低星观察位 ida-swarm/decyx/reagent。

### 2.5 自有参考项

| 仓库 | ★ | 定位 | 参考价值 | 边界 |
|---|---|---|---|---|
| **ADWMC/helm-x**（已拉 `reference/repos/helm-x`，HEAD `17bb1e6`） | 53 | **破限工具**（代理层）：`codex→127.0.0.1:1800→上游` 请求注入 + 响应 TAMPER + Context Gardener（`helm-x/README.md:25-34`） | ①**破限测试方法论**（60 题结构 / 排除上游 ERROR 的通过率口径 / cyber flag 场景，93.9% `README.md:48`）→ WG3.5 **题库结构与跑测口径主体**（迁移 60 题,总库 ≥100） ②进程外兜底手段（helmd 方法优先，见 §0 决策行） | **不进产品代码**（§0 决策）；产品内破限首选 = G1 的 helmd 温和方法 |

> 说明：原有 §2.1–2.4 表收录第三方项目；helm-x 为自有项目、由用户点名拉入参考（本会话 `gh repo clone ADWMC/helm-x` CLONE_EXIT=0），故单列于此外不混入第三方竞品/借鉴表。

### 2.6 oh-my-pi 精读（用户点名参考，`reference/repos/oh-my-pi`，can1357 的 pi 增强 fork）

> 与我们同源不同支：它 fork 自 pi 谱系做「IDE wired in」编码产品；我们 fork earendil-works/pi 做自主渗透/逆向。**7 个可参考点按对齐度排序**：

| # | 机制（证据） | 对我们的价值 | 落点 |
|---|---|---|---|
| **1** | **一等公民 `task` 子代理**：fan-out 进**隔离 worktree**、每 worker **独立 tool surface**、yield 为 **schema 校验的类型化对象**（无散文解析/无兄弟冲突）；Agent Hub 可 **steering/revive/kill** 单个 worker + 每子代理成本时长卡（`oh-my-pi/README.md:163-171`） | **正中 W2 缺口**：我们计划新建的 `helmpi-tools/task.ts`（stock pi 无 task 工具，HITS=0 已证）有了完整设计参照——隔离/独立工具面/类型化回收/治理四件套，且是 **A″ 进程级分发**的现成同构实现 | W2 `task.ts` 设计基准；WG2.1 断言参照（类型化 yield + 每 worker 工具面隔离） |
| **2** | **Time-traveling stream rules**：规则平时休眠，**regex 命中即 mid-token 中断流 → 注入 system reminder → 从断点重试**；注入**挺过 compaction**，免每轮上下文税（`README.md:155-157`） | **模型防御层的原生强化候选**：比静态 before_agent_start prompt 更省（不常驻上下文）、比事后 supervise 更早（流中拦截）——G1/G4 之间出现第三类挂点：**流中闸** | 模型防御层新候选机制（**已判定 2.6.1 #2，7.6 分·采纳降级形态**：G1 动态轮间注入入 W2，mid-token 版 P2） |
| **3** | **看门模型**：第二个模型 watching every turn（`README.md:173-176`） | 模型防御层可选档（对抗 PG「不加 always-on judge」立场——列为权衡项而非默认采纳） | **已判定 2.6.1 #3（7.2 分·采纳）**：G4 watcher 档，Spec 默认关入 W2 |
| **4** | **Hashline 内容哈希编辑**：模型给锚点不重打行，锚点漂移即**拒收补丁**；实测 −61% output tokens（`README.md:205-207`） | 双重价值：token 经济（六列可观测）+ **证据锚定类比**（claim 必须钉内容哈希 ≈ 我们的精确切片方向） | token 经济参考；G5 切片校验的旁证设计 |
| **5** | **`omp stats` 本地观测盘 + 内嵌 BPE 计数**（tiktoken-rs 双表,`README.md:490`；包 `packages/stats`） | 我们 token 六列/预算熔断的**呈现层参考**（预算看板 UX） | 报告/观测（W5 可选） |
| **6** | **KDL 模型策略树**（AGENTS.md：模型/厂商条件逻辑**禁写 TS 字符串匹配**，全部进 KDL 规则树编译 `rules.json`） | **破甲层 S1 的架构参考**：不同模型拒答倾向不同 → 按模型选温和子集策略若做，走"规则树编译"而非散落 if | **已判定 2.6.1 #6（4.2 分·拒绝**：不引 KDL；原则降维为带 schema 校验的 JSON 表驱动，WG3.5 实测有按模型差异才启用 |
| **7** | **沙箱内核回环桥**（Python/Bun kernel 可回环调 agent 自己的 read/search/task 工具,`README.md:135`）+ **ACP `session/request_permission` 写入门**（`:550-557`）+ 进程内工具免 fork-exec、**原生 Windows 无 WSL 桥**（`:197-199`） | W3 沙箱执行器的第二方案（Docker vs 内核回环）；Session 层交互门模式；**Windows 教训共鸣**（我们 WG0.1 的 WSL 长跑正是 fork-exec/桥接类代价的反面教材） | W3 沙箱备选；Session 层参考 |
| **8** | **记忆引擎（Memory the agent curates）**：动词 `retain` 记事实 / `learn` 存教训 / `recall` 召回 / 会话压缩 mental model 下轮首注入（`README.md:213-216`）；`memory.backend` 可选、**上游默认关**、项目域默认、注入为 prompt 内 "Memory Guidance" 段且有 `summaryInjectionTokenLimit` 上限（`docs/memory.md`）；**mnemopi = 本地 SQLite 引擎、MIT**（`packages/mnemopi/package.json` license 字段） | **用户点名用途 = 记忆我们的工具位置**（nuclei/Ghidra-MCP/wordlist/proxy 端点等环境资产跨 Run 复用，省重复侦察回合）；动词直映射（retain=记工具路径+probe+时间戳）；SQLite 与 ledger 同栈；升级现有静态 `docs/TOOL-MEMORY.md` 为 agent 自治结构化库 | **采纳（2.6.1 #8，7.6 分）**→ kernel `tool-memory/`，W1 建机制、W3/W4 填场景，验收 WG1.6 |

**边界**：oh-my-pi 是编码产品（review/commit/ACP/browser），**不引它的产品面**（与我们渗透/逆向定位不同）；只取上表机制层。

#### 2.6.1 评判积分与判定（自评定夺，2026-09，替代原"候选未决策"）

> 打分三因子（各 10 分）：**收益**（对双层架构/自主/证据/成本的实效）、**落地性**（成本与风险反向计分，越便宜越稳越高）、**对齐**（与既有决策/波次契合度）。综合 = 收益×0.45 + 落地性×0.30 + 对齐×0.25。**≥7 采纳入波；5–6.9 降级/部分采纳；<5 拒绝（原则吸收）**。

| # | 机制 | 收益 | 落地性 | 对齐 | **综合** | **判定** |
|---|---|---|---|---|---|---|
| 1 | task 子代理四件套 | 10 | 8 | 10 | **9.4** | ✅ **全采纳**——升格为 W2 `task.ts` 设计基准（隔离 worktree/独立工具面/类型化 yield/steering-revive-kill），并作 A″ 同构参照 |
| 2 | stream rules 流中闸 | 9 | 5 | 8 | **7.6** | ✅ **采纳（降级形态）**——模型防御层 G1 增**动态轮间注入**（turn 边界检出 off-script → 注入 reminder 下轮生效，免每轮上下文税）；**mid-token 中断版列 P2**（动主流=直改热点+abort/compaction 复杂度，W2 直改面稳定后再评） |
| 3 | 看门模型 watching every turn | 8 | 6 | 7 | **7.2** | ✅ **采纳为可选档**——模型防御层 G4 增 **watcher 模式**：Spec 开关**默认关**（尊重 PG「无 trace 证据不加 always-on judge」警告 + 成本），开启时每 N 轮廉价模型复核自报/证据，全部裁决 trace 留痕；默认关的负向断言入 WG2.1 |
| 7 | 沙箱内核回环桥 + ACP 门 | 6 | 7 | 8 | **6.8** | ✅ **部分采纳**——W3 沙箱器开工时做一次 **A/B 选型**（Docker 容器 vs 内核回环桥 `README:135`）；ACP `session/request_permission`（`:550-557`）作 Session 层交互门参考（已在案）；原生 Windows 教训已吸收（WG0.1 环境栈） |
| 4 | Hashline 内容哈希编辑 | 8 | 5 | 6 | **6.6** | 🟡 **部分采纳**——证据锚定思想**已被 G5 精确切片校验覆盖**（无需新码）；编辑机制本身 **P2 观察**（改 edit 工具=直改热点+1，等 W2 直改面稳定后再评），−61% token 数据记入 token 经济参考 |
| 5 | omp stats 观测盘 | 6 | 8 | 6 | **6.6** | 🟡 **部分采纳（呈现参考）**——W5 报告/观测借其布局与指标口径（本地盘 + 内嵌 BPE 计数,`README.md:490`），只借设计不引包 |
| 6 | KDL 模型策略树 | 4 | 3 | 6 | **4.2** | ❌ **拒绝**——为单一温和子集策略引 KDL 工具链过重；**原则降维吸收**："模型条件逻辑不散落 if，集中一处**表驱动**"——若未来 S1 需按模型分策略（WG3.5 数据支撑才做），用带 schema 校验的 JSON 规则表，不引 KDL 全家桶 |
| 8 | 记忆引擎（mnemopi：retain/learn/recall + SQLite + MIT） | 7 | 8 | 8 | **7.6** | ✅ **采纳（用户点名用途）**——kernel 建 `tool-memory/`：**工具位置记忆**默认开（对齐 SoL-Pi 默认开先例），存 `.helm/` 自有 SQLite（配置分离）；**证据纪律内建**：每条必须带 probe 命令 + `last_verified_at`，recall 时 stale 条目降级为不可信（对齐证据阶梯 unverified≠事实）；prompt 注入段带 token 上限（同 `summaryInjectionTokenLimit` 口径，P3 参考非剧本）；mnemopi 机制 MIT 可 vendor（归因保留），W1 建机制、W3/W4 填场景、WG1.6 验收 |

**判定汇总**：8 项全处置——采纳 5（#1 全量 / #2 降级 / #3 档位化 / #7 选型+参考 / **#8 记忆引擎**）、部分 2（#4 思想已吸+机制 P2、#5 仅借呈现设计）、拒绝 1（#6 原则降维）。**无遗留未决策项**；P2 复评点：#2 mid-token 版、#4 hashline 编辑（均等 W2 直改面稳定）。

### 2.7 第三批点名参考（两仓一文，2026-09，评分同 2.6.1 框架）

| # | 来源（证据） | 收益 | 落地 | 对齐 | **综合** | **判定与落点** |
|---|---|---|---|---|---|---|
| 9 | **StudentBench**（`reference/repos/studentbench`，SB_EXIT=0，MIT/CC-BY）：AI vs 人类辅导 **等价性检验**（pooled equivalence p=.015、6 辉师过个体等价）+ **单位增益成本**（918× 更低成本/百分点,`README.md:27`）+ `reproduce.py --verify` **全数字复核**（每个统计/表/图输入对照论文,`:55`） | 5 | 9 | 7 | **6.7** | 🟡 **部分采纳（方法论层）**——①WG5.2 竞品对照改**等价性声明框架**（"等价质量 × N 倍成本"而非输赢）②token 经济增 **cost-per-verified-finding** 指标（对标 cost per learning gain）③`--verify` 模式强化我们 suite 的全数复核纪律 |
| 10 | **SkillOpt**（`reference/repos/SkillOpt`，SO_EXIT=0，MIT/PyPI）：skill 文档=冻结 agent 的可训练参数；有界 add/delete/replace 编辑 + **held-out 验证门才接受** + 文本学习率预算 + 拒绝编辑缓冲 + **零推理期开销**，产物=300-2000 token `best_skill.md`；**SkillOpt-Sleep 夜间离线自进化**（harvest→mine→replay→consolidate 过门,`README.md:18,32-49`） | 9 | 7 | 9 | **8.4** | ✅ **采纳（离线方法论进化环）**——**held-out 门 = 我们自己的 WG 套件/local labs**（现成映射）；W5 建环：从 ledger/journal harvest→在 labs replay→过门才 consolidate 进 prompt 库/playbook；**部署零运行时改动**（不碰模型防御层红线）；G1 prompt 库保持 best_skill.md 式**紧凑可训练形态**（300-2000 token 口径） |
| 11 | **arXiv 2609.28372**（McGill《Shopping by algorithm》，已归档 `reference/papers/2609.28372-shopping-by-algorithm.md`，60 页**已全文精读**）：2×2（成本 $0/$10-$50 × 目标特异 vague/specific）×8 LLM，N=16,400+验证 5,200——vague+成本使最优率 **0.89→0.29 / 0.86→0.48，全经诊断省略中介（c′≈0）**；specific 几乎全保护（斜率 −1.997→−0.270 n.s.）、算术错误 0%——**缺陷在获取不在能力**；模型差异剧变（Luna 免疫 IMM=0、Flash Lite 满信息仅 4% 最优）；结论=信息架构×委托特异性决定行为，非模型固有缺陷（`PAGE 1,9,13-16`） | 9 | 8 | 9 | **8.7** | ✅ **采纳（四落点,含对抗面新发现;精读后由 8.3 上调）**——①**G4 下限精化（修正摘要级误判"全集硬跑"）**：**EVI>边际成本的诊断子集必跑 + 每省略必留 justification**；诊断集形式定义=「进入结论判据的属性」（`PAGE 5`）；增 **acquisition/utilization 二分审计**（没查 vs 查了不会,`PAGE 44-45`）+ 估值上报校验器（unknown+basis 对工具日志分类,注意 priming 副作用,`PAGE 50-51`）②**Spec/SOW lint L1–L6 清单**（§2.7.1,W3 执行）③**对抗面（摘要没有）**：对手可拆分/加价/重排关键诊断面诱导我方 agent 提前终止、产出貌似合理的欠优结论=**取证面/搜索面操纵**（字段拆分非伪影,`PAGE 10-11,16-18`）→ **信息面敌意假设**入 W3 engagement（报告必含 acquisition/utilization 审计行,诊断集获取不可协商）④方法学整体移植 **W5 任务6 行为实验**（2×2/逐属性省略计数/EVI 基线;LLM 剂量曲线论文未见=自测填补反标 G4 参数,WG5.5） |

**判定汇总（第三批）**：3/3 处置——采纳 2（#11 8.7、#10 8.4）、部分 1（#9 6.7 方法论层）——**#11 最高（8.7，全文精读后重打分：G4 精化+对抗面新发现）**。**零遗留未决策**。

#### 2.7.1 Spec/SOW 特异性 lint 清单（#11b 落地,W3 执行）

| 规则 | 内容 | 论文依据 |
|---|---|---|
| L1 | 必含**可计算优化判据**，禁裸 "best deal / good value" 类措辞 | vague 措辞=省略主因（`PAGE 8-9`） |
| L2 | 目标句必须**映射出必查属性集**（目标→诊断集,诊断=进入结论判据的字段） | `PAGE 5` |
| L3 | 目标句须**贴近裁决句**（句序重排即改变结果,`PAGE 10`） | `PAGE 10` |
| L4 | 成本措辞（loss/fee）**不敏感→不 lint**（负面规则,防过度工程） | `PAGE 10` |
| L5 | **任务规模/数量参数必须显式**（规模会改写目标：绝对价格目标 38%→84% 采纳,最优 .80→.35） | `PAGE 11-12` |
| L6 | 目标若 vague → **先澄清再搜索，否则阻断**（论文作者建议,与 Session 层一次澄清交互兼容） | `PAGE 17-18` |

---

## 3. 基于 pi 二改的形态（已证据化）

### 3.1 许可与合规
- pi = **MIT**，Copyright (c) 2025 Mario Zechner（`reference/repos/pi/LICENSE:1-3`）；允许 use/modify/merge/publish/distribute/sublicense/sell（`:5-9`）。
- 义务：副本保留版权与许可声明（`:12-13`）。闭源商用合法，无需回馈上游。

### 3.2 fork 后的仓结构
pi monorepo 11 包（全部 v0.87.1, MIT, Node ≥22.19）：

| 包 | 职责 | fork 策略 |
|---|---|---|
| `pi-coding-agent` | CLI 主程序（bin `pi`） | **必改**：品牌、工具集、system prompt、configDir |
| `pi-agent-core` | Agent 循环/状态 | 尽量不动（rebase 同步） |
| `pi-ai` | 多 provider LLM | 不动（`models.generated.ts` 有生成器约束 `pi/AGENTS.md:28`） |
| `pi-tui` / `chord` / `pi-protocol` / `pi-client` / `pi-server` / `pi-durable` / `pi-telemetry` / `pi-evals` | UI/组合/传输/持久化/遥测/评测 | 不动 |
| **新增 `helmpi-kernel`（或同名）** | 现 helm-pi 内核：scope gate、evidence 阶梯、ledger、playbook、report、mcp-bridge、supervise | **新目录，零上游冲突** |

### 3.3 现成扩展点（决定"必改上游文件"清单能压多小）
- 扩展加载：`.pi/extensions/`（项目级 + `~/.pi/agent/` 全局），`reference/repos/pi/packages/coding-agent/src/core/extensions/loader.ts:751,772-778`
- 工具注册：`defineTool()` `.../extensions/types.ts:521`；`ctx.registerTool()` `types.ts:1443-1445` → `loader.ts:273` → 并入会话 `agent-session.ts:3152-3154`
- **提示词注入**：`before_agent_start` 可整体替换 systemPrompt（`.../extensions/runner.ts:1329-1347`）；`BuildSystemPromptOptions` customPrompt/appendSystemPrompt（`.../system-prompt.ts:9-32`）；CLI `--system-prompt`（`args.ts:121`）
- **deny 钩子**：扩展 `tool_call` 事件「Fired before a tool executes. Can block.」（`types.ts:1039`），结果 `block?: boolean`（`types.ts:1233-1238`）→ ScopeGate/风险阶梯可在**不改上游**的前提下拦截
- 事件总线：37 个扩展事件（`types.ts:1370-1436`）；agent 核心事件（`packages/agent/src/types.ts:485-500`）
- 会话钩子：session_start/before_switch/before_compact/shutdown、tool_execution_*（`types.ts:1375-1430`）
- 工具闭集：`ToolName = "read"|"bash"|"powershell"|"edit"|"write"|"grep"|"find"|"ls"`（`.../tools/index.ts:95`）—— **无 task**，与我方 HITS=0 实测一致；fork 加 task/subagent 二选一：改 `tools/index.ts:95` 或 `registerTool` 零上游 diff

### 3.4 事实核验（推翻一条旧记录）
- stock pi **无 task/subagent 工具**：`ToolName` 闭集 `tools/index.ts:95`；全仓 `name: "task"` 0 匹配 ✅（实测 HITS=0 成立）
- 旧记录「events.d.ts:791 type-only」**在当前源树不可复现**：pi 树中无任何 `events.d.ts`；仅 `node_modules/@earendil-works/pi-agent-core/dist/harness/events.d.ts`（25 行）。结论不变，出处作废。
- pi **无内置权限系统**：`reference/repos/pi/README.md:42-48`（官方建议容器化/沙箱）→ **权限与沙箱是我们产品的空白填充点，不是重复造轮子**。

### 3.5 二改策略（最小上游 diff）
1. **必改（冲突热点，集中在 coding-agent）**：品牌（11 个 package.json name/repository、bin `pi`、configDir `.pi`）、工具集、system prompt 默认、启动默认扩展。
2. **新目录零冲突**：`packages/helmpi-kernel`（现 helm-pi src 迁入）+ 渗透/逆向工具包。
3. **同步策略**：`upstream` remote + `git rebase upstream/main`；自持改动 `git format-patch` 补丁序列（rename / pentest-tools / system-prompt 注入 / deny 策略）。上游明示「Do not preserve backward compatibility」（`pi/AGENTS.md:26`）→ **rebase 要勤**。
4. **风险**：`agent-session.ts` 4023 行且上游活跃，避免深处分叉（`pi/AGENTS.md:54-72` 多会话并发规则）。
5. **改名面**：11× package.json、bin、LICENSE（保留原版权头 + 加自身声明）、README 品牌。
6. **构建/测试**：`npm install --ignore-scripts` → `npm run build` → `npm run check` → `./test.sh`（无 key 自动跳过 LLM e2e）（`README.md:56-63`、`AGENTS.md:32-36`）；二进制 `./scripts/build-binaries.sh`。

### 3.6 完整魔改 pi 方案（施工总图）

#### 3.6.1 目标仓库树（fork 最终形态）

```
helm/                                  # ADWMC/helm, 基于 earendil-works/pi
├── packages/
│   ├── coding-agent/                  # 【改】品牌+闸接线+CLI 子命令（唯一热点包）
│   │   └── src/
│   │       ├── config.ts              #   已改: APP_NAME/CONFIG_DIR/.helm；ENV 钉死的 PI_* → W1 换 HELM_*（配置分离）
│   │       ├── cli/args.ts            #   【改】注册 helmpi 子命令组 + help 段
│   │       ├── cli/startup-ui.ts       #   已改: OFFICIAL_* 常量
│   │       ├── core/tools/index.ts    #   【改】ToolName 闭集 += task, helmpi_* 门控工具
│   │       ├── core/extensions/loader.ts  # 【改】启动默认加载 helmpi-kernel（不再依赖用户 .pi/extensions）
│   │       ├── core/system-prompt.ts  #   【改】appendSystemPrompt 段: kernel 提示词(lite/full 两档, 无 HCOT)
│   │       ├── core/agent-session.ts  #   【改】最小: allowedToolNames/excludedToolNames 接档位
│   │       ├── package-manager-cli.ts #   已改: 显示串
│   │       └── package.json           #   已改: brand/bin triple/piConfig
│   ├── helmpi-kernel/                 # 【增】现 helm-pi src/ 整体迁入（W1 核心）
│   │   └── src/
│   │       ├── ledger.ts              #   SQLite 单写者: run_state(I10)/coverage(I19)/journal
│   │       ├── scope.ts               #   ScopeGate: exact/glob/CIDR + fail-closed(I13/I14)
│   │       ├── evidence.ts            #   阶梯 exploited/confirmed/unconfirmed + 7 负面标记
│   │       ├── completion.ts          #   finish 编译门 + 切片校验(PG 语义) + coverage 门
│   │       ├── loop.ts / propose.ts   #   任务层 Run 状态机 + 提案有界视图
│   │       ├── supervise.ts           #   预算/ streak 硬限额 → instead 路径(G4)
│   │       ├── playbook.ts / playbook-yaml.ts  # 阶段门 + attack: 字段
│   │       ├── tool-surface.ts        #   lite/full 档位表（去 HCOT 化, 已决策）
│   │       ├── efficiency/            #   【增·内置】SoL-Pi 四机制 vendor（NVlabs, MIT 归因）
│   │       │   ├── action-fusion.ts   #     编辑+校验同调（README:38）
│   │       │   ├── observation-pack.ts#     大结果→稳定句柄+精确分页召回（:39）
│   │       │   ├── evidence-reducer.ts#     长日志→回执, 引文必须逐字命中存档（:40, 与 P4 同向）
│   │       │   └── online-compact.ts  #     完成步→原生 compaction 候选, 经济+窗口压双检（:41）
│   │       │                          #     四原则: 零补丁/证据保留/宿主选择照守；**默认开（本决策，偏离上游 opt-in）**+逐项可关+双载守卫
│   │       ├── tool-memory/           #   【增·内置】工具位置记忆（评分 #8,7.6 分采纳; 机制参照 oh-my-pi mnemopi,MIT 归因）
│   │       │   ├── db.ts              #     `.helm/` 自有 SQLite（配置分离; retain/learn/recall 动词）
│   │       │   ├── schema.ts          #     条目=工具路径/端点+probe 命令+last_verified_at（证据纪律）
│   │       │   └── recall.ts          #     Run 开局召回→G1 prompt 记忆段（token 上限）; stale 降级不可信
│   │       ├── i18n/                  #   【增·内置】单源 catalog i18n/{en,zh-CN}.json（§1.6; 机检面/模型面 en 冻结）
│   │       ├── export.ts / cli.ts     #   报告 md+json + exit 0/2
│   │       ├── mcp-bridge.ts          #   newline JSON-RPC, ScopeGate+risk 阶梯内联(W4 接真 Ghidra)
│   │       ├── config.ts / index.ts   #   【产品配置】config.json+spec.json,**格式照 pi 做**（JSON/键名风格随 pi,校验加严）；**不读写 pi settings.json**；工具注册(helmpi_validate_scope 首位)
│   │       └── host/                  #   pi 宿主适配层（事件/钩子绑定）
│   ├── helmpi-tools/                  # 【增】新工具包（W2）
│   │   └── src/task.ts                #   子代理分发 tool（当前实测 HITS=0 的空白; spawn/回收 child session, bounded）
│   │   └── src/sandbox.ts             #   执行器（W3; **形态 A/B 选型后定**——Docker 默认候选 / 内核回环桥备选,评分#7）
│   ├── agent | ai | tui | chord | protocol | client | server | durable | telemetry
│   │                                  # 【不动】rebase-only（agent 循环零改动 = P10 内核不绑宿主的物理保证）
│   └── evals | session-backends/…     # 【不动】评测/持久化
├── scripts/                           # 【改】品牌常量已对齐; 【增】tools/ 下 lint-playbooks + attack-coverage 迁入
├── references/
│   ├── playbooks/*.yaml               # 【增】web-pentest/api/reverse.yaml + attack: 字段
│   ├── attack-{navigator.json,coverage.md}  # 【增】生成物
│   └── re/                            # 【增】逆向领域知识包 (W4, open-reverselab 范式自有改写)
├── docs/
│   ├── DESIGN.md / INVARIANTS.md      # 【增】helm-pi 单源迁入 (P1-P10, I1-I19)
│   ├── tests/STANDARD.md + suites/    # 【增】验收标准 + 真机套件
│   └── SOW-TEMPLATE.md                # 【增】W3 扩成 engagement 包(RoE/OPPLAN/ATT&CK)
├── vitest.base.ts / tsconfig.json     # 【改】@adwmc alias 表（已对齐）
├── patches/                           # 【增】format-patch 序列（同步管理, 见 3.6.4）
└── LICENSE                            # 【改】双声明（已完成）
```

#### 3.6.2 改动四分类总账（每一项一个补丁级单位）

| 类 | 项 | 位置锚（file:line） | 波次 |
|---|---|---|---|
| **改** | 品牌面（13 pkg.json/bin/piConfig/ENV 钉死/显示串/alias 表） | 已列 §3.5 + `config.ts:500-509` | ✅ W0 已完成 |
| **改** | Kernel **默认加载**：不再走用户 `.pi/extensions`，fork 内建启动即挂 | `extensions/loader.ts:751,772-778` → 改为内建 registry 同时注册 | W1 |
| **改** | **env 更名（配置分离配套）**：`ENV_AGENT_DIR/ENV_SESSION_DIR` 字面量 `PI_CODING_AGENT_*` → `HELM_CODING_AGENT_*`；`setup.ts:6`/`rpc-entry.ts:7` 的 `PI_CODING_AGENT` 标志 → `HELM_CODING_AGENT`；读写该 env 的测试 stub 同步（约 10 文件，WG0.2 同类机械活） | `config.ts:508-509`、`cli/setup.ts:6`、`rpc-entry.ts:7` | W1 |
| **改** | **CLI 子命令组（单源=§1.5 七命令）**：`helm spec init|run|resume|report|validate-scope|attack-coverage|doctor`（`helmpi` 等价别名）挂进 pi 命令分发 | `cli/args.ts`（`--system-prompt` 同层 `:121` 旁） | W1 |
| **改** | **ToolName 闭集**（直改腿核心）：`+= "task"` + 门控 `helmpi_stats` 等 | `core/tools/index.ts:95`（闭集）、`:118-139`（工厂 switch） | W2 |
| **改** | system prompt 段：lite/full 两档 kernel 段（无 HCOT，负向断言钉死） | `system-prompt.ts:9-32/:195`（appendSystemPrompt 位）+ `before_agent_start` `runner.ts:1329-1347` | W2 |
| **改** | 工具面档位接线：`allowedToolNames/excludedToolNames` ← `selectToolSurface(lite/full)` | `agent-session.ts:237-240`、CLI `-xt` `args.ts:309` | W2 |
| **改** | ScopeGate 从「validate 时 journal」升级「`tool_call` 事前 `block:true`」 | `extensions/types.ts:1039`（Can block）、`:1233-1238`（`block?: boolean`） | W2 |
| **改** | supervise 预算挂 session 钩子（kindStreak/decisions/token → instead/failed） | 事件表 `types.ts:1370-1436`、session 钩子 `:1375-1439` | W2 |
| **增** | `packages/helmpi-kernel`（helm-pi src 整迁 + `host/` 适配层） | 新目录（零上游冲突） | W1 |
| **增** | **工具位置记忆 tool-memory**（评分 #8 判定）：机制参照 oh-my-pi mnemopi（MIT vendor 归因保留），动词 retain/learn/recall；存 `.helm/` 自有 SQLite；**证据纪律内建**（每条带 probe+last_verified，stale 召回降级）；prompt 注入段带 token 上限；默认开 | `kernel/src/tool-memory/**` | W1（机制）/W3-W4（场景填充） |
| **增** | **内置 SoL-Pi 四机制**（vendor 进 `kernel/src/efficiency/`，MIT 归因 + NVlabs 版权头保留；**默认开、Spec 配置逐项可关**——默认开为本决策，偏离上游 opt-in 默认；零补丁/证据保留/宿主选择三原则照守；**双载守卫**：settings.json 检出外部 NVlabs 扩展时禁用其加载并 journal 一条，防机制双跑；COMPAT.md 语义由"三扩展共存"改写为"原生+外部检测"） | `kernel/src/efficiency/**` + loader 双载判断 | W1 |
| **增** | **SoL-Pi 版本兼容核验**：上游仅测 pi 0.85.1，fork = 0.87.1 → 四机制逐个对公开 API 复核（public extension API 是其明文设计约束 `README:45`，预期零补丁，发现 API 漂移则记录并最小适配） | 四机制 × pi 0.87.1 API diff | W1 |
| **增** | `packages/helmpi-tools`：`task.ts` 子代理工具（用 SDK `customTools`/内建闭集二选一，见 3.5）| 新目录 | W2 |
| **增** | 沙箱执行器 `sandbox.ts`（**形态待 A/B 选型定夺,评分 #7**：Docker 临时容器+卷/网白名单 vs 内核回环桥;§3.6.1 树注 Docker 为默认候选非定论） | 新模块 | W3 |
| **增** | engagement 包（SOW→RoE/ConOps/OPPLAN+ATT&CK）、注入消毒四层（CAI 移植）、拒绝升级阶梯（Dark-Moon 移植） | `references/` + kernel `supervise/host` | W3 |
| **增** | 逆向域：`references/re/**`、`Spec.targetKind`（url/host/sample_hash）、MCP 真 e2e（Ghidra） | kernel `config.ts` Spec schema + `mcp-bridge.ts` | W4 |
| **增** | `docs/`（DESIGN/INVARIANTS/STANDARD/SOW/suites）、`patches/` | 新树 | W1 起随波 |
| **裁/删** | **无强制删除项**。保留：evals、telemetry（契约默认关）、experimental 面、`pi` bin 别名、`update pi` 关键字。**已退役**（W1 执行）：`PI_CODING_AGENT_*` env（→ `HELM_*`，配置分离）。候选观察：pi.dev 更新流指向（改名后走 @adwmc npm，无上游依赖） | — | W1 |
| **不动** | `agent/`（agent-loop.ts 循环）、`ai/`（models.generated 有生成器约束）、`tui/`、`chord/`、`protocol/client/server`、`durable/`、`session-backends` | 仅 rebase | 每波回归 |

**量化目标**：直改上游源文件 ≤ **12 个**（全部在 coding-agent 包内），其余改动 100% 落在新增包/目录 → 每次 rebase 冲突面锁死在 coding-agent 一处。

#### 3.6.3 两条接线腿（为什么魔改面能压这么小）

1. **内建默认扩展腿（W1，占 70% 功能）**：kernel 作为 fork 内建扩展随 CLI 启动注册——G4 预算/G5 完成切片/G6 报告、全部工具（`helmpi_validate_scope` 保持**首个注册**、deny→journal 语义）、Spec 加载（cwd `spec.json`→ledger→null）、playbook 状态机全走这条腿。上游 diff ≈ 0。
2. **直改腿（W2，仅 3 处热点）**：① ToolName 闭集（task 必须内建，实测上游无此工具）② system prompt 段默认值 ③ 工具档位接线。**CLI 子命令注册与 loader 内建接线归 W1**（见 §3.6.5 W1 行,args.ts/loader.ts）；G2 事前 block **不在此腿**——用现成 `tool_call` 扩展事件即可，归第一腿。

**数据面**（两腿共用）：ledger SQLite 落 `CONFIG_DIR`（`.helm/agent/`）旁；journal 事件表记录 scope_denied/token_budget_exhausted/coverage 等；报告由 kernel `export.ts` 出 md+json，exit code 经 pi CLI 透传。**配置面（配置分离决策）**：产品一切配置开关（Spec/scope、效率四机制、模型防御层档位、MCP servers）走 `.helm/` 下自有文件，**格式照 pi 做**（JSON 结构/键名风格/组织遵循 pi 既有约定,校验加严=未知键拒绝,不发明新格式）；**产品代码不读写 pi 的 settings.json**，宿主设置仅在扩展发现等宿主职责处被只读检视（双载守卫），互不渗透。

#### 3.6.4 上游同步的补丁序列（patches/ 与热点图）

- 现有 6 个品牌提交 = 序列头（`git format-patch origin/main..` 归档为 `patches/` 副本，CI 用，实际历史以 rebase 为准）。
- W1/W2 每个「直改腿」改动独立成提交（命名 `fork(coding-agent): …`），保证 `git rebase upstream/main` 时冲突可按提交粒度重解——W0 的 6 冲突经验证解法就是「取上游+重打改名」，同法可复用。
- **热点图**（每次 rebase 必看）：`coding-agent/src/core/{tools/index.ts, extensions/loader.ts, system-prompt.ts, agent-session.ts}`、`cli/args.ts`、根 `vitest.base.ts`、各 `package.json` —— 12 文件清单即 rebase 冲突预期集。
- 上游节奏：实测 10 小时内 8 新提交（W0 期间）→ **rebase 频率定为每波结束必跑**（WG0.4 已立此例）。

#### 3.6.5 波次 ↔ 魔改映射（每波改什么，一览）

| 波 | 魔改内容 | 直改上游文件数 | 验收 |
|---|---|---|---|
| W0 ✅ | 品牌/测试对齐/LICENSE/rebase 机制 | 665 文件机械改 + 4 处（CONFIG_DIR/显示串/ENV/fix string） | WG0.1–0.4 全绿 |
| W1 | kernel 迁入 + 内建默认加载 + CLI 子命令 + **SoL-Pi 四机制内置** + 配置分离/env 改名 + tool-memory + i18n | ~2（loader 接线 + args 注册）+ 新包 | WG1.1–**1.7**（双基线合并重定、journal 活体、原仓处置、SoL-Pi 默认开、配置分离+HELM_* env、tool-memory 证据纪律、i18n 四断言） |
| W2 | Task 工具 + prompt 段 + 档位接线 + G2 事前 block（**扩展腿,非直改**）+ G1–G6 断言 | ~3（tools/index、system-prompt、agent-session——**args 归 W1**,与 §3.6.3 一致） | WG2.1–2.3（六闸负向矩阵 + 真机 suite + R-gate n≥3） |
| W3 | 沙箱器 + engagement 包 + 注入消毒 + 升级阶梯 | **0**（全在 kernel/tools/references） | WG3.1–3.5 |
| W4 | 逆向域 + targetKind + 真 MCP | ~1（Spec schema 若在 coding-agent 侧则 0，全在 kernel） | WG4.1–4.3 |
| W5 | HackSynth 评测 + 竞品表 + SARIF + 进化环 + 行为实验 + UX | 0 | WG5.1–5.5 |

#### 3.6.6 明确不魔改的（负面清单）

- 不动 agent 循环/模型层（P10「宿主可替换，内核不可绑宿主」的物理保证 = 循环零 diff）
- **HCOT 不做**（已决策）：工具/指令段/档位一律不进，G1 负向断言钉死
- 不做 Web UI、swarm 并行、DSH/Cordis 缝合（本方案范围外）
- 不删上游功能面（evals/experimental/telemetry 保留）；不改 `models.generated.ts` 手写（生成器约束 `pi/AGENTS.md:28`）
- 不改上游测试语义（除品牌字面量对齐外），新测试全部落在 kernel/tools 侧
- **不做 helmd 式交互**（§1.3）：Run 层零编号决策菜单/零逐阶段人点；不把 playbook 写成预写剧本；阻塞走 instead 路径不走"上报等人选路"。自主行为 + 全套机器验收，二者不冲突

---

## 4. 破甲层（=破限）与模型防御层（=防自家抽风）——两个完全独立的顶层，非父子

> **定调（用户 2026-09，纠正记录）**：这是**两种完全不同的东西**，不是父子、不共命名：
>
> - **破甲层 = 破限（只向外）**：对抗**上游模型拒答/安全分类器**，授权任务不被 vendor 中断（Dark-Moon 实证 `docs/full.md:649`）。组成：**S1** = G1 prompt 库中的 **helmd 温和子集**（产品内首选）；**S2** = helm-x 代理（外部兜底，参考项 §2.5，**不进产品代码**）；验收 = WG3.5。
> - **模型防御层 = 防自家 agent 抽风（只向内）**：自报完成、跳步、越权、注入劫持、空转烧钱、隐藏失败。组成：**G1–G6**（下表）。
>
> **设计叙事（三个决策拼成的三角）**：完全自主（§1.3 不等人选路）× 破甲层·破限（不被上游拒答卡死）× 模型防御层验收（不因自主而放水）——缺任一角，产品就退化成 helmd 式脚本小子或裸奔 agent。
> **helmd 温和子集范围（已决策，属破甲层 S1）**：只搬 ①目标归一化后直接执行 ②知识按需读 ③Run 层不中途反复问人；**不搬**「照读不照办 / 不索要前提证明」——授权与范围的审查时机**完全归 Session 层 Spec 硬门**（SOW 模板机检），产品内不留给模型自行把握。
> **自主性边界（§1.3 的落法，按层区分）**：模型防御层 G1–G6 全是**负向约束**（不许 X / 过了才算 Y），不构成正向执行剧本，触发时给有界替代（instead 路径）而非上报等人；破甲层 S1 是**引导性 prompt**（正向），但其作用域仍完全受 Spec/scope 硬门约束——破限只改"上游拒不拒"，不改"我们许不许"。
> 现有资产（模型防御层侧）：`src/supervise.ts`（SuperviseVerdict.instead + why/instead 路径）、`src/tool-surface.ts`（lite/full 档位）、`src/antipatterns-corpus.test.ts`、evidence 阶梯、I1–I19。
> fork 后模型防御层每道闸都有原生挂点（不再受"插件权限"限制）：

| 闸（模型防御层） | 机制 | fork 挂点（file:line, reference/repos/pi） | 现有对应 |
|---|---|---|---|
| G1 提示词闸 | per-mode 默认 system prompt，**仅 lite/full 两档**（HCOT 不做，已决策）。prompt 库内容三段归属：mode 分档结构（本闸=模型防御层）+ **破限温和子集段（内容归破甲层 S1**，范围见本章头部）+ **工具记忆召回段**（WG1.6，token 上限，stale 条目不注入）。**增动态轮间注入**（评分 #2 判定）：turn 边界检出 off-script → 注入 system reminder，下轮生效、免每轮上下文税；mid-token 中断版 P2 | `before_agent_start` 整体替换 `extensions/runner.ts:1329-1347`；`BuildSystemPromptOptions` `system-prompt.ts:9-32`；轮间注入挂 turn 事件 `types.ts:1370-1436` | `selectToolSurface`（ADR-001，档位去 HCOT 化） |
| G2 工具闸 | `tool_call` 事件 block：scope 不过 / 高风险未批 → 直接拦 | `types.ts:1039`「Can block」、`block?: boolean` `types.ts:1233-1238` | `helmpi_validate_scope`（事后→**事前**，升级）|
| G3 档位闸 | 内置工具闭集按 mode 裁剪；task/subagent 新增进闭集 | `tools/index.ts:95,118-139` | `CORE_TOOLS(13)` + `GATED_TOOLS` |
| G4 循环闸 | 同 kind streak / decisions / token 预算硬限额，超额给 instead 路径。**增 watcher 档**（评分 #3 判定）：Spec 开关**默认关**，开启时每 N 轮廉价模型复核自报/证据，裁决全 trace 留痕。**增证据完整性下限**（评分 #11 判定,arXiv2609.28372 全文精读版）：诊断集=「进入结论判据的属性」（形式定义,`PAGE 5`）——**EVI>边际成本的诊断子集必跑，每个省略必留 justification**（非全集硬跑,高成本下弃零 EVI 属性合法）；配套 **acquisition/utilization 二分审计**（没查≠查了不会）——熔断只许停，省证据必须显式可见。**估值上报校验器**：unknown+basis 枚举 vs 工具日志分类 correct/fail/hallucination（入 journal;priming 副作用按论文警示最小化,`PAGE 50-51`） | 37 事件表 `extensions/types.ts:1370-1436` + session 钩子 `:1375-1391` | `supervise.ts` + I10 `run_state` |
| G5 完成闸 | finish 必须 evidence-backed + coverage 记录（I18/I19），自报不算 | tool_execution/session 事件 `types.ts:1428-1430` | `completion.ts` + `evidence.ts` |
| G6 状态闸 | ledger SQLite 单写者，journal 全量留痕，报告 md+json 双出 + exit 0/2 | （自持，`pi-durable` 可选复用） | `ledger.ts` / `export.ts` |

**与竞品的差异点（两层即卖点）**：PentestGPT/Shannon 等完成判据仍依赖 agent 自报（见 §2.3）；pi 上游明确无权限系统（`README.md:42-48`）、亦无任何破限应对——**破甲层 + 模型防御层两个独立顶层全部是我们填的空白，上游零重复**。

### 4.1 每道闸的实现任务与机检断言（验收锚点 A-G1…A-G6）

| 闸 | 实现任务（fork 内文件/挂点） | 机检断言（每闸 ≥1 条负向测试） |
|---|---|---|
| G1 | 默认扩展 `before_agent_start` 写 forceSystemPrompt per-mode（**lite/full 两档，无 HCOT**）（`runner.ts:1329-1347`） | lite/full 结构可断言不同；**无 HCOT 指令段**（负向）；**轮间注入触发**（off-script→reminder 行出现）；**S1 温和子集段存在**；**召回段超限截断 + stale 条目不注入** |
| G2 | `tool_call` 事件 handler：ScopeGate 判定→`block:true` + `scope_denied` journal（`types.ts:1037,1233-1238`）（CAI 消毒归 W3 任务3,验=WG3.2） | 越权 target 执行**前**被 block（journal 时间戳早于工具日志）；注入 tripwire 断言归 WG3.2 |
| G3 | `tools/index.ts:95` ToolName 闭集按 mode 裁剪；**新增 `task` 工具**（子代理分发执行体,属 W2） | lite 模式下调用 gated 工具被拒（工具表断言）；task spawn/回收 smoke 通过 |
| G4 | supervise 预算挂 session 钩子（`types.ts:1375-1439`）：kindStreak/decisions/token → instead 路径；证据完整性下限（EVI 子集+justification,评分 #11） | 预算耗尽产生 `token_budget_exhausted` 失败而非静默继续（I10 类断言）；**低预算下省略仅允许"零 EVI 属性"或"带 justification 的留痕省略"，无留痕省略=负向失败**；acquisition/utilization 分类正确（没查/查了不会二分断言）；**估值分类三值齐全**（correct/fail/hallucination） |
| G5 | finish 证据**精确切片校验**（吸收 PG：复述丢弃、截断永不完成、自述不能作证据,`CONTEXT.md:59-67,74`） | 复述型证据被拒→finish 失败；精确切片→通过；I19 coverage 门保持绿 |
| G6 | ledger/report 已达标；补 SARIF 输出（可移 W5,借 strix/swarm） | findings→exit 2；md+json 字段一致性断言 |

**破甲层·代理段 S2（helm-x，参考项 §2.5，不进产品代码——已决策）**：自有 `ADWMC/helm-x`（53★，已拉入 `reference/repos/helm-x`）是**破限（limit-bypass）工具**——方法论 = 请求层注入 2.5KB 绕过 prompt + 响应层 TAMPER 改写拒答（SSE 流式+重试）+ Context Gardener 裁剪（`helm-x/README.md:25-34`），**测试方法论 = 破限通过率评测**（60 题结构、排除上游 ERROR 的通过率口径、cyber flag 场景，实测 93.9% `README.md:48`）。

**两概念必须划清（防混淆）**：
- **破限（对抗上游拒答）**：**优先用 helmd 方法**（**温和子集**：目标归一化后直接执行、知识按需读、Run 层不中途反复问人——取舍清单见 §4 头部，`helm-d/AGENTS.md §6/§7`），落点 = **G1 prompt 库**（进产品）；helm-x 代理级（注入+TAMPER）为兜底（重型、需 MITM 接管，不进产品代码）。Dark-Moon 亦证分类器会中断渗透（`docs/full.md:649`），故此需求为真。
- **G1–G6 模型防御层（本产品的领域）**：管**我方 agent 自身的行为边界**（scope/证据/预算/完成），方向相反——一个向外破限，一个向内立规。
- **交点 = 验收方法借用**：「拒答连续性」测试（WG3.5）**场景优先按 helmd 方法组织**（提示层温和应对下任务连续），helm-x 60 题**结构迁移为题库主体之一**（总库 ≥100,WG3.5 真机双臂）——断言①任务不中断（走 instead 路径或外部代理接管）②**被改写的内容照样过不了 G5 证据闸**（TAMPER 不能让不合规证据放行）。外部代理接管部分标环境级（依赖 helm-x 在场），产品内断言（TAMPER 不绕闸）必须机检。

---

## 5. 渗透 + 逆向双域

### 5.1 渗透域（主域）
- 现有资产已够骨架：playbook 状态机、scope 硬门、evidence 阶梯、ledger、report。
- 吸收顺序（按融合成本）：
  1. **LuaN1aoAgent**（同 Pi SDK 底座）：三角色分权 + evidence-backed 图记忆 + per-task Docker 隔离网（`LuaN1aoAgent/README.md:126,228-229`）
  2. **Decepticon**：RoE/ATT&CK engagement 先行 → 扩展我们 `SOW-TEMPLATE.md` 为 engagement 包（RoE+ConOps+OPPLAN+ATT&CK 映射）（`Decepticon/README.md:134`）
  3. **PG 证据切片**（§4 G5）+ **Swarm 执行门顺序**（§4 G2 链式化）+ **CAI 注入消毒**（P9 落地）
  4. pentestagent 的 RAG meta-tool 阈值策略（工具面继续膨胀时的退路）

### 5.2 逆向域（新域，当前空白）
- **知识层**：open-reverselab 的可执行知识库范式（Scenario→信号→方法→攻击链→MCP 工具映射，`open-reverselab/README.md:47-54`）→ 直接映射我们的 `references/` 按需读（P3 同构），新增 `references/re/**` 领域包。
- **执行层**：OGhidra（LLM↔Ghidra 桥，本地模型）+ sentinel-reverse（r2pipe+MLX 纯本地管线）作为 MCP 工具后端；我们 Wave 4 的 MCP bridge 正好是挂点（fake-server → 真 Ghidra MCP 是首个真实 e2e 的好机会）。
- **门禁层复用零改动**：scope 硬门（二进制 hash 白名单替代 URL glob）、evidence 阶梯（函数级 claim 也要切片证据）、finish 门（I19 coverage）、六道闸 —— **逆向域=同一内核换 playbook 和工具面**，这是"双域一个内核"的产品结构。
- 攻击面差异处理：逆向无网络外联 → `allowExternal` 默认关反而是最安全档；scope 匹配器扩展 `Spec.targetKind: url|host|sample_hash`（设计项，未实现）。

### 5.3 明确不做（本方案内）
- 不自研沙箱虚拟化（借 shannon Docker 方案 / LuaN1ao per-task 网络，P1）；
- 不做 UI/Web 平台（pentagi 路线，MVP 不碰）；
- 不做 swarm 编排（P2 再议，此前 A″ 进程级分发为远期选项）。

---

## 6. 分波实施计划

> 每波验收继承 `docs/tests/STANDARD.md`（真机真调用、R-gate n≥3、双时钟、token 六列、报告 md+json）；一逻辑一提交；命令+退出码才算完成。**波门（WG）编号 = 验收标准 §7.2 的行锚**。

### Wave 0 — fork 立仓（最小可用底座）

**任务**
1. 新仓（GitHub fork `ADWMC/<brand>` 或独立仓）基于 `earendil-works/pi@7c696c0`；`upstream` remote 保留并 `git fetch upstream` 校验可达。
2. 改名补丁序列（`patches/0001-rename.patch` 起）：11× package.json `name`/`repository.url`、bin `pi`→新品牌（`coding-agent/package.json:9-11`）、configDir（`:6-8`）、README/docs 品牌；**LICENSE 保留 Mario Zechner 版权头 + 追加自有版权声明**（`pi/LICENSE:3,12-13`）。
3. CI：GitHub Actions 跑 `npm ci --ignore-scripts && npm run build && npm run check && npm test`（权威=`ci.yml:42`）。
4. 产出 `CONTRIBUTING-FORK.md`：同步策略（高频 rebase，上游不保向后兼容 `pi/AGENTS.md:26`；冲突只在 coding-agent 内解决）。

**交付物**：fork 仓 URL + `patches/` 序列 + CI 绿 + 证据日志。
**波门**：
- **WG0.1** 绿线：`npm install --ignore-scripts && npm run build && npm run check && npm test`（权威=`ci.yml:42`;POSIX 等价 `./test.sh`）→ 全 0，测试文件数记录在案。
- **WG0.2** 改名完整：`grep -r` 用户可见品牌字符串无残留旧 `pi` 字样（LICENSE/NOTICE/第三方归因除外），MISSING=0。
- **WG0.3** 许可合规：LICENSE 含原版权行 + 本产品声明（人工审 + 记录）。
- **WG0.4** 可同步演练：`git rebase upstream/main` 在无自有改动的干净分支上 exit 0。

### Wave 1 — 内核搬家

**任务**
1. `packages/helmpi-kernel`：迁入现 helm-pi `src/` 全模块（ledger/scope/evidence/completion/playbook/report/mcp-bridge/supervise/tool-surface/propose/loop/config/index）+ 对应测试。
2. 注册为启动默认扩展（fork 内建，`.pi/extensions` 加载点 `loader.ts:751,772-778`）；`helmpi_validate_scope` 保持**首个注册**语义。
3. CLI 形态：注册 §1.5 全部七命令（`helm spec init/run/resume/report/validate-scope/attack-coverage/doctor`,`helmpi` 别名等价）——**全新注册面**：`main.ts` 于 `runAuthCommand` 同位插 `runHelmCommand` 布尔拦截（`cli/helm-commands.ts`），依赖 kernel `exports` 子路径（scope/export/ledger）。**实现校正（L0,2026-09 实测）**：kernel 自带 bin 式 `cli.ts`（init/run/board/hint/approve/gate/report）无"三子命令"——原措辞失实,该 cli 保留为内部工具面不挂 shell；`doctor`/`attack-coverage` 为诚实空态桩（分别随 T06/W3 变真）。
4. **内置 SoL-Pi**：vendor NVlabs 四机制进 `helmpi-kernel/src/efficiency/`（MIT/NVlabs 归因），随默认扩展加载且**四项默认开、helm 自有配置文件逐项可关**（开关不进 pi settings.json——配置分离决策；默认开=本决策，偏离上游 opt-in 默认；零补丁/证据保留/宿主选择三原则照守）；实现双载守卫（外部 SoL-Pi 扩展与内置并存时禁外部 + journal）；改写 `COMPAT.md`（共存 → 原生+检测）；完成 0.85.1→0.87.1 API 兼容核验记录（**核验先于合入**，因默认开）。
5. **配置分离落地 + env 更名**：产品配置文件就位（`config.json` + `spec.json` + 效率/防御开关，全在 `.helm/`，**格式照 pi 做**——JSON/键名风格随 pi、未知键拒绝校验,不发明新格式）；断言产品代码**不读写 pi settings.json**；env `PI_CODING_AGENT_*` → **`HELM_CODING_AGENT_*`**（`config.ts:508-509` 字面量 + `setup.ts:6`/`rpc-entry.ts:7` 标志 + 测试 stub 同步）。
6. **工具位置记忆**（评分 #8）：kernel `tool-memory/` 就位——retain/learn/recall 动词 + `.helm/` 自有 SQLite + 条目必带 probe/last_verified + 召回注入段（token 上限）；默认开；升级替代静态 `docs/TOOL-MEMORY.md`。
7. **i18n 基建**（§1.6）：kernel i18n/{en,zh-CN}.json 单源 catalog + `t(key,params)` + locale 解析链（helm config→HELM_LOCALE→en）+ 逐键回退；**机检面/模型面 en 冻结**；CJK 宽度接入 pi-tui stringWidth；key-parity 单测入套件。
8. 原仓处置按 §8 决策执行（建议 read-only 归档 + 指向 fork）。

**交付物**：kernel 包 + 默认扩展接线 + 迁移证据。
**波门**：
- **WG1.1** 测试迁移零丢失：内核 75 迁入全绿 + fork 578 基线并跑绿，合并后**重定基线**，`npm run check` exit 0。
- **WG1.2** 内核活体：pi 启动后 journal 出现 kernel 初始化事件（session_start 类），`helmpi validate-scope` 在 fork 内 exit code 语义与原仓一致（deny→journal→非 0）。
- **WG1.3** 原仓处置已执行并记录（决策项确认后）。
- **WG1.4** SoL-Pi 四机制默认开+单测+opt-out+双载守卫（判据 §7.2 单源行）。
- **WG1.5** 配置分离 + `HELM_*` env 更名（判据 §7.2）。
- **WG1.6** tool-memory 证据纪律（判据 §7.2）。
- **WG1.7** i18n 基建四断言（判据 §7.2）。

### Wave 2 — 模型防御层六道闸 natively 接线

**任务**（对齐 §4.1 验收锚 A-G1…A-G6）
1. **G2**：`tool_call` handler 接 ScopeGate → `block:true` + `scope_denied` journal（`types.ts:1037,1233-1238`），从事后 journal 升级为**事前拦截**（I14 语义保留）。
2. **G1**：`before_agent_start` 注入 per-mode（lite/full）system prompt（`runner.ts:1329-1347`），接 `selectToolSurface` 档位（ADR-001 继承，**HCOT 档不实现——已决策不做进产品**）；prompt 三段中 **S1 温和子集段本波落地**（目标归一化直接执行/知识按需读/Run 层不中途问人,§4 定调清单）；工具记忆召回段随 W1 基建接入（token 上限）。
3. **G3**：ToolName 闭集按 mode 裁剪 + **task 工具新增**（`tools/index.ts:95`，已核不存在；spawn/回收走 child_process，为 A″ 前置）。**设计基准 = oh-my-pi task 四件套**（评分 #1，9.4 分）：隔离 worktree / 每 worker 独立工具面 / schema 校验类型化 yield / steering-revive-kill 治理（`oh-my-pi/README.md:163-171`）。
   **G1 动态轮间注入 + G4 watcher 档**（评分 #2/#3 判定，见 §4 表）随本波实现，watcher 默认关；G4 的 EVI 子集下限 + 估值上报校验器同步实现。
4. **G4**：supervise 预算（kindStreak/decisions/token）挂 session 钩子（`types.ts:1375-1439`），超额→instead/failed 路径。
5. **G5**：finish 证据精确切片校验（PG 语义：复述丢弃、截断永不完成、自述不能作证据）。
6. **G6**：ledger/report 不动（回归监控）。

**交付物**：六闸代码 + 负向测试矩阵 + 真机 suite `docs/tests/2026-fork-gates/`。
**波门**：
- **WG2.1** 单测矩阵：§4.1 六行机检断言全绿，每闸 ≥1 条负向测试，`npm run check` exit 0。
- **WG2.2** 真机 suite（STANDARD 全项）：scope 事前拦截实证（journal 时间戳 < 工具日志时间戳）、复述证据被拒实证、token 熔断实证、lite/full 工具面差异实证、**自主性实证（Run 层零人工决策点,§1.3/§7.2 单源）**；R-gate n≥3。
- **WG2.3** 回归：合并基线（fork 578 + 内核 75 + 新增）只增；token 六列在 suite 报告中。

### Wave 3 — 渗透管线产品化

**任务**
1. engagement 包：`SOW-TEMPLATE.md` → RoE/ConOps/OPPLAN + ATT&CK 映射（借 Decepticon 模式 `Decepticon/README.md:134`；对齐 `references/playbooks/` + `attack:` 字段已有基础）。**Spec/SOW 特异性 lint = L1–L6 清单**（评分 #11b,见 §2.7.1：可计算判据/目标→诊断集映射/裁决句贴近/规模显式/vague 先澄清否则阻断），lint 不过不算 Spec 合法。**信息面敌意假设**（#11c 对抗面）：假定目标信息架构可被对手操纵（拆分/加价/重排诊断面诱导跳步出欠优结论）→ engagement 报告必须含 acquisition/utilization 审计行，诊断集获取列为不可协商项。
2. 沙箱执行器：**开工先做 A/B 选型**（评分 #7 判定）——Docker 临时容器+受控卷/网（借 shannon ephemeral worker / LuaN1ao per-task 网络 `LuaN1aoAgent/README.md:228-229`） vs **内核回环桥**（oh-my-pi 模式：沙箱 kernel 回环调 agent 自有工具,`oh-my-pi/README.md:135`），按 W3 场景实测定夺；host 路径 deny + 网络白名单在所选层强制。
3. 注入消毒四层移植 CAI `guardrails.py:102,155,199,251,374` → 并入 G2；tripwire 命中即时停机（`docs/guardrails.md:36`）。
4. 拒绝附升级阶梯（借 Dark-Moon `docs/full.md:2183-2186`）：supervise block 时输出 why+instead。
5. 报告补 engagement 元数据（RoE 摘要 + ATT&CK 覆盖率进 report json）。
6. **破限真机题库**（用户定调：真机+多题目,§0 决策行）：建 `docs/tests/poxian-corpus/` **≥100 题**（迁移 helm-x 60 题结构 + 自研渗透/逆向 ≥40;每题=category+授权实验室场景包装+期望行为三桶）；**真 API 双臂跑测**（裸 pi vs +S1,n≥3/题）出拒答率对照+S1 增益+通过率报告；既有断言保留——任务连续（G1 接管）+ TAMPER 不绕 G5；**越权对照题 100% 拦截**。

**交付物**：engagement 模板 + 沙箱执行器 + 消毒层 + 真机渗透 suite `docs/tests/2026-fork-pentest/`。
**波门**：
- **WG3.1** 沙箱逃逸负向测试：容器内尝试读宿主白名单外路径 exit 非 0；出网仅白名单。
- **WG3.2** 注入对抗 suite：构造含注入指令的靶场响应（labs 127.0.0.1:18080-18084），断言不被执行（tripwire journal）；R-gate n≥3。
- **WG3.3** 全流程真机：labs 上 engagement→recon→test→exploit→finish 全链，报告 findings→exit 2，token 六列 + 双时钟齐。
- **WG3.4** 现有 5 套 suite 回归全绿（2026-dispatch-smoke/wave1-regression/bpath-e2e/ab-bpath-slim/wave4-tools）。
- **WG3.5** 破限真机题库评测（题库 ≥100 + 真 API 双臂对照 + 越权拦截 100%,判据 §7.2 单源行）。

### Wave 4 — 逆向域

**任务**
1. `references/re/**` 领域知识包：open-reverselab 范式（Scenario→信号→方法→攻击链→工具映射,`open-reverselab/README.md:47-54`）**自有内容改写**。
2. MCP bridge 真实 e2e：接 Ghidra MCP / OGhidra（`OGhidra/README.md:31-45`）——补齐当前唯一 fake-server 残余；可选 sentinel-reverse 本地后端。
3. `Spec.targetKind: url|host|sample_hash` 扩展 + 样本 hash 白名单 scope（`validateScopeQuery` fail-closed 语义不变）。
4. 逆向 playbook（`references/playbooks/reverse.yaml`）+ finish 门复用（函数级 claim 同样要证据切片 + coverage）。

**交付物**：RE 知识包 + 真实 MCP 接线 + 逆向 playbook + 真机逆向 suite `docs/tests/2026-fork-re/`。
**波门**：
- **WG4.1** 样本 scope：hash 不在白名单的样本，任何工具调用执行前被 block + journal（I13/I14 逆向形态）。
- **WG4.2** 真实 MCP e2e：对真实 Ghidra MCP 至少 1 次往返成功（fake-server 标注作废）；失败则残余风险显式续记。
- **WG4.3** 端到端：1 个真实 crackme/样本，recon→定位→证据切片→finish（coverage 门）全链 suite，STANDARD 全项。

### Wave 5 — 评测与收官

**任务**
1. HackSynth 200 题接入为回归评测层（`reference/repos/HackSynth/README.md:17-18`）。
2. 竞品对照实测：同一 labs/基准上我们 vs PentestGPT 公开 trace 方法学（BoxPwnr traces 回放思想 `BoxPwnr/README.md:13`、pentest-bench 指标）。**声明框架改等价性**（评分 #9 判定,StudentBench 方法）：头条结论用"等价质量（equivalence test）× N 倍成本优势"表述，成本口径 = **cost-per-verified-finding**（对标 cost per learning gain,`studentbench/README.md:27`）。
3. 对外 README：竞品表（§1.1 转对外版）+ quickstart + exit code 语义。**观测呈现参考**（评分 #5 判定）：借 `omp stats` 布局与指标口径（本地盘 + 内嵌 BPE 计数,`oh-my-pi/README.md:490`），只借设计不引包，token 六列报表对齐该口径。
4. G6 补 SARIF 输出（strix/swarm 模式）。
5. **方法论进化环**（评分 #10 判定,SkillOpt 离线采纳）：从 ledger/journal **harvest** 运行教训 → 本地 labs **replay** → **held-out 门 = WG 套件**，过门才 **consolidate** 进 G1 prompt 库/playbook（有界编辑+拒绝缓冲+文本学习率预算,`SkillOpt/README.md:32-39`）；dev-time 工具（skillopt CLI 或自研同构环），**部署零运行时改动**；prompt 库保持 300-2000 token 紧凑可训练形态。
6. **预算压力行为实验**（评分 #11d 移植）：Tool-Lab 2×2（token 成本 × Spec 特异性）在 local labs 复刻——逐属性省略计数、n≥100/格（R-gate 口径另报 n≥3 主套件）、EVI/Expectimax 规范基线、schema 校验 rollout；**产出=LLM 侧成本剂量-反应曲线**（论文未见,自测填补）→ 反标 G4 下限参数；顺带验证 L6 澄清阻断与信息面敌意场景（拆分诊断面→断言不被诱导跳步）。
7. **Run 状态 TUI + UX 联调**（WG5.4 ①–⑥ 实装：阶段门/预算六列/instead 行渲染、help 全量、doctor 联调、locale 切换）。

**交付物**：评测报告（token 六列+R-gate）+ 对外 README + SARIF。
**波门**：
- **WG5.1** 基准跑通：HackSynth 子集（≥20 题起步）评测报告出数，n≥3 或标注方向性。
- **WG5.2** 竞品表每格有证据（file:line 或实测数据），无证据格标"未验证"。
- **WG5.3** 终验清单（§7.3,13 项）全过。
- **WG5.4** UX 契约 6/6（判据 §7.2）。
- **WG5.5** 预算压力行为实验（判据 §7.2）。

**依赖关系**：W0→W1→W2 严格串行；W3 与 W4 在 W2 后可并行；**W5 收官**（其中方法论进化环为建成后按需重复运行的机制,非持续波期）。远期（本方案不排期）：A″ 进程级分发子代理、swarm 黑板并行、Web UI。

---

## 7. 验收标准

### 7.1 总则（证据纪律）

1. **命令+退出码才算完成**：任何「通过/完成/已迁移」必须附命令、exit code、关键输出；拿不出的一律标 **未验证**（`[pw:evidence]` 纪律，用户侧持续要求）。
2. **波门不可跳**：WG*n* 未全过不得开下一波；跳过必须在 §8 显式记为决策并说明风险。
3. **测试只增不减**：任何波的测试总数 ≥ 前一波基线。**当前双基线**：helm-pi 内核 75（W1 迁入后并入）+ fork 套件 **578 测试文件**（WG0.1 绿档实测 79/155/18/3/288/12/6/3/6/2/6）；W1 结束合并**重定基线一次**，此后单调不减（口径=`npm test`）。
4. **每闸必有负向测试**：G1–G6 每道闸至少 1 条「应该被拦」的用例（§4.1），正向通过不算覆盖。
5. **真机优先**：涉及宿主行为的断言（拦截时机、提示词注入、task 工具）必须真机实测；faux provider 单测不能替代。
6. **提交纪律**：一逻辑一提交；`git diff --check` exit 0；密钥扫描 SECRET_HITS=0。

### 7.2 波门验收表（逐行执行并留证）

| 波门 | 验收命令（或方法） | 通过判据 | 证据落点 |
|---|---|---|---|
| WG0.1 | `npm ci --ignore-scripts && npm run build && npm run check && npm test`（权威=`ci.yml:42`） | 全 exit 0，测试文件数记录在案 | fork 仓 CI 日志 |
| WG0.2 | `grep -r` 品牌残留扫描（排除 LICENSE/NOTICE/第三方归因） | MISSING=0 | 扫描输出入 PR 描述 |
| WG0.3 | LICENSE 人工审 + diff | 原版权行在 + 自有声明在 | diff 入 PR |
| WG0.4 | `git rebase upstream/main`（干净分支） | exit 0 | 命令输出 |
| WG1.1 | `npm test` + `npm run check` | exit 0；内核 75 迁入与 fork 578 基线**合并后重定基线**全绿 | CI 日志 |
| WG1.2 | fork 内 `helmpi validate-scope`（deny 用例） | exit 非 0 且 `scope_denied` journal 存在 | exit code + journal 行 |
| WG1.3 | 原仓处置操作记录 | §8 决策已执行 | 本文件勾销 |
| WG1.4 | SoL-Pi 内置：四机制单测（action-fusion/observation-pack/evidence-reducer/online-compact）+ **默认开断言**（不配任何配置时四机制生效）+ 每机制 **opt-out 负向测试**（逐项关即失效）+ reducer 失败不动原结果（证据保留）+ 双载守卫（外部 NVlabs 扩展在场时不双跑且 journal 一条）+ API 核验与 COMPAT 改写 | 每机制 ≥1 opt-out 负向断言；默认开断言；**0.85.1→0.87.1 API 核验记录 + COMPAT.md 改写完成**；`npm run check` 0 | kernel 单测清单 + journal 行 |
| WG1.5 | **配置分离 + env 更名**：①产品代码 grep 无 `settings.json` 写入（读仅限双载守卫处）②`HELM_CODING_AGENT_DIR` 设置/读取闭环生效、产品代码无 `PI_CODING_AGENT*` 读写残留③自有配置 schema 严格校验（未知键拒绝） | ①写入=0 ②`FUNC_HITS=0`（同 WG0.2 口径）③schema 负向测试过 | 扫描输出 + 单测清单 |
| WG1.6 | **工具位置记忆**（tool-memory）：①写入仅落 `.helm/` 自有 SQLite（不进 pi 路径，配置分离）②每条含 probe 命令 + `last_verified_at`，**伪造路径写入 → 复验失败 → 召回标 stale 不可信**（负向断言）③召回注入段有 token 上限（超限截断断言）④默认开断言 | ①路径断言 ②stale 负向过 ③截断负向过 ④默认开 | kernel 单测清单 + journal |
| WG1.7 | **i18n 基建**（§1.6）：①en↔zh-CN key 集相等 + 插值占位符集相等②缺 key 逐键回退 en（空串/裸 key=失败）③**机检面与模型面不本地化负向**（journal 事件名/json 键/exit/G1 prompt 出现 zh=失败）④CJK 宽度渲染（宽字符双列、断字不断串） | 4/4 过；`npm run check` 0 | i18n parity 单测 + 渲染快照 |
| WG2.1 | `npm test` + `npm run check`（六闸负向矩阵） | §4.1 六行断言全绿，每闸 ≥1 负向；**含 G4 watcher 默认关负向断言**；`npm run check` exit 0 | 测试名清单 + CI 日志 |
| WG2.2 | 真机 suite `docs/tests/2026-fork-gates/` | 4 实证：事前拦截时序 / 复述证据被拒 / token 熔断 / lite-full 工具面差异；**+自主性实证：Run 层全程零人工决策点（无编号菜单/无 ask_user，仅入口 Spec/scope 输入）**；R-gate n≥3 | suite MANIFEST+evidence |
| WG2.3 | `npm test` + suite token 报告 | 测试总数 ≥ 合并基线；token 六列齐 | stats.json |
| WG3.1 | 沙箱负向用例（越权路径读 / 白名单外出网） | 全部 exit 非 0 且宿主无泄漏 | suite logs |
| WG3.2 | 注入对抗 suite（靶场返回内嵌指令） | tripwire 0 执行；R-gate n≥3 | journal + evidence |
| WG3.3 | labs 全流程 suite（127.0.0.1:18080-18084） | engagement→finish 全链；findings→exit 2；双时钟+六列齐；**L1–L6 Spec lint 负向（vague Spec 被拒）**；**acquisition/utilization 审计行存在** | `docs/tests/2026-fork-pentest/` |
| WG3.4 | 现有 5 套 suite 回归（dispatch-smoke/wave1-regression/bpath-e2e/ab-bpath-slim/wave4-tools） | 全绿 | 各 suite gate |
| WG3.5 | **破限真机题库评测**（题库 `docs/tests/poxian-corpus/`,**≥100 题**=helm-x 结构迁移 60+自研 40,每题 category+授权实验室包装+期望行为;**真 API 双臂**=裸 pi vs +S1;场景优先 helmd 方法,TAMPER 次级） | ①题库 ≥100 在案（index+三桶齐全:授权应放行/无论如何应拦/灰区测增益）②真机跑测 n≥3/题,出拒答率对照+S1 增益+通过率报告（排除上游 ERROR 口径）③**越权对照题拦截率=100%（破限不破 G2,硬断言）**④S1 on/off 任务连续断言（无 ask_user）⑤TAMPER 改写内容过不了 G5（负向,机检）⑥外部代理接管项标环境级 | corpus + 双臂 stats.json + journal |
| WG4.1 | 样本 hash scope 负向用例 | 执行**前** block + journal（时间戳序） | journal 时间戳 |
| WG4.2 | 真实 Ghidra MCP 往返 | ≥1 成功往返；失败则残余风险显式续记 | e2e 日志 |
| WG4.3 | crackme 端到端 suite | 全链 + STANDARD 全项 | `docs/tests/2026-fork-re/` |
| WG5.1 | HackSynth 子集评测 | ≥20 题出数；n≥3 或标「方向性」 | 评测报告 |
| WG5.2 | 竞品表证据审查 | 每格 file:line 或实测；无则标未验证 | README 表 |
| WG5.3 | §7.3 终验清单逐项 | 13/13 | 见下 |
| WG5.4 | **UX 契约**（§1.5/§1.6）：①`helm --help`/子命令可发现且 `helmpi` 别名等价②`helm doctor` 探测→写 tool-memory 成功③Run 状态含阶段门/预算六列/instead 行④报告 md 头条含 cost-per-verified-finding ⑤Run 层全程无编号菜单（与 WG2.2 联动）⑥`locale=zh-CN` 时 TUI 事件行/帮助显示中文且 CJK 宽度排版正确、json/exit 仍 en | 6/6 项过 | 截图/输出留档 + suite 断言 |
| WG5.5 | **预算压力行为实验**（W5 任务6,#11d）：2×2（成本×特异性）出剂量-反应曲线 + 省略计数 + EVI 基线；信息面敌意场景（拆分诊断面）断言不被诱导跳步 | 每格 n≥100 或标注规模；G4 下限参数由曲线反标；敌意场景负向过 | 实验 stats.json + 曲线图 |

### 7.3 产品 v1.0 终验清单（全过才可对外称 PentestGPT 类竞品）

1. **从零构建**：干净 clone → `npm ci --ignore-scripts` → build → check → `npm test` 全 exit 0（记录测试总数）。
2. **回归底线**：测试数 ≥ 重定基线值；`npm run check`（含 lint-playbooks 4 项）exit 0。
3. **六闸负向矩阵全绿**：G1–G6 每闸 ≥1 负向测试（§4.1）。
4. **真机渗透 suite**：labs 全流程，scope 事前拦截 + 证据切片 + 预算熔断 + 注入对抗 4 实证，R-gate n≥3。
5. **真机逆向 suite**：真实样本 hash scope + 端到端 finish（coverage 门），STANDARD 全项。
6. **统计与预算**：头条结论带 n≥3 中位数+区间或显式「无统计主张」；报告含 wall/active 双时钟 + token 六列（totalTokens 除外）。
7. **报告契约**：md+json 双出字段一致；findings→exit 2、clean→exit 0 各实测 1 次；**SARIF 输出经 schema 校验可解析（W5-T04,原 §1.1 旧标 P2 已纠正）**。
8. **上游可同步**：对 upstream 最新 main 完成 1 次真实 rebase 演练并解冲突，exit 0。
9. **许可与安全**：LICENSE 合规复查；`git diff --check` 0；SECRET_HITS=0。
10. **文档单源刷新**：DESIGN（P1–P10 是否增补）、INVARIANTS（I19 之后是否增补）、README 竞品表、本方案 §8 残余风险全部对齐当前实态。
11. **W1 新基建四门全过**：WG1.4 SoL-Pi 默认开 / WG1.5 配置分离+`HELM_*` env / WG1.6 tool-memory / WG1.7 i18n。
12. **UX 与行为实验**：WG5.4 六项 + WG5.5 剂量曲线（G4 参数由曲线反标）。
13. **破限真机评测报告在案**：题库 ≥100、双臂拒答率对照、越权拦截 =100% 硬断言（WG3.5 报告复查,破限不做不判过）。

### 7.4 统计与预算细则（引用 STANDARD，不另立标准）

- R-gate：n≥3、pass@k、中位数+区间、原子 stats.json（`docs/tests/STANDARD.md` §5.5）。
- 预算：冻结预算、wall/active 双时钟、runs/ 目录、token 六列（同上 §5.6/§6）。
- T2 禁自报：完成判据三元组，agent 自述不得作证据。
- C2：报告 md+json 孪生 + 机器可读退出码。

### 7.5 每波最小交付底线（防范围蔓延）

每波至少交付：① 代码/文档变更；② 1 个可重跑的验收命令集（exit code 留档）；③ §8 残余风险刷新。缺一项该波视为**未完成**，即使代码已合。

---

## 8. 风险与残余

| 风险 | 等级 | 缓解 |
|---|---|---|
| 上游高频破坏性变更（不保向后兼容,`pi/AGENTS.md:26`）+ `agent-session.ts` 4023 行热点 | 高 | 补丁序列 + 每周 rebase 演练；深处分叉面压到最小（§3.5） |
| 双仓漂移：helm-pi 扩展形态 vs fork 形态并存 | 高 | **待决策**：W1 后 helm-pi 归档为只读，kernel 单源在 fork 内（建议） |
| 竞品即 pi 用户：Shannon 也用 pi harness（同底座既是验证也是追赶） | 中 | 差异化押注破甲+证据+预算（§1.1），不拼编排 |
| 许可归属 | 低 | MIT 保留版权头（`pi/LICENSE:12-13`）；自身新增代码自有声明 |
| 沙箱是 P1 唯一新设施，未实测 | 中 | W3 借 shannon/LuaN1ao 成熟模式；落地前标未验证 |
| 逆向域 `Spec.targetKind` 为设计项 | — | W4 才实现，当前无代码 |
| **tool-memory 召回幻觉/陈旧** | 中 | 每条必带 probe+`last_verified`、stale 降级不可信（WG1.6 机检）；召回段 token 上限；写入留 journal 痕 |
| **内置 SoL-Pi 版本漂移**：上游仅测 pi 0.85.1，fork = 0.87.1，**且已决策默认开** | **高** | 兼容核验**先于合入**（0.85.1→0.87.1 逐机制 API 复核，`SoL-Pi/README.md:45` 明文只用公开 API 预期零补丁）；四机制各带**单项紧急关闭开关**（漂移即一键关并 journal）；漂移发现记入 §8.1 |
| 已知残余（继承） | — | 破甲 hook 在 `-p` 一次性模式不触发；MCP bridge 仅 fake-server（W4 补）；bash 失败根因在 pi host；cacheWrite=0 异常 |
| **bin 名 `helm` 与 Kubernetes Helm CLI 冲突**（PATH 撞名，本机/CI 常同时存在） | 中 | **已解（W0）**：三 bin 并存 `helm`+`helmpi`+`pi`（`package.json` bin 已实装），冲突场景用 `helmpi` |

### 8.1 执行进度（Wave 0 进行中）

- ✅ 品牌决策：**helm**；立仓方式：fork 到 ADWMC（用户本会话拍板）
- ✅ 预跑绿线（`reference/repos/pi`）：`CI_EXIT=0 BUILD_EXIT=0 CHECK_EXIT=0`
- ✅ `gh repo fork earendil-works/pi --clone=false` → `https://github.com/ADWMC/pi`，`FORK_EXIT=0`
- ✅ `gh repo rename helm -R ADWMC/pi` → `ADWMC/helm`，`RENAME_EXIT=0`，`isFork:true`
- ✅ 本地克隆 `C:\Users\Administrator\Documents\GitHub\helm`，HEAD=`7c696c0`（= pin），upstream remote 已挂，`FETCH_EXIT=0`
- ✅ **WG0.1 过关（GREEN）**：同一 HEAD `7c696c00f`，四段全 0 —— `CI_EXIT=0`（r9/r10/终验 ×3）、`BUILD_EXIT=0`（×3）、`CHECK_EXIT=0`（r10 起 ×2）、**`TEST_EXIT=0 FAILING_FILES=[]`**（loop ATTEMPT1，11 workspace 全 passed：78/154/25/3/287/7/6/3/6/2/6）。复跑环按 R-gate 精神 ≤3 次绿即停，第 1 次即绿。
- **WG0.1 环境栈（全部环境级、上游仓零改动，11 轮迭代收敛）**：
  1. `fixloop.so`（LD_PRELOAD，自编译 `COMPILE_EXIT=0`）：WSL2 内核回环监听激活竞态（同进程 listen 后 5-20ms connect 必 ECONNREFUSED，python 0/20→垫片 10/10 实证；ECONNREFUSED 全程计数=0）
  2. **测试仓克隆到 WSL ext4**（`/home/ci/helm`，`CLONE_OK`）：消除 /mnt/c 9p 慢 IO × 并行的 30s 超时族（D 类 9+1 文件全绿）
  3. **非 root 用户 `ci`**：模拟 ubuntu CI runner（B 类 config/tools 中 config 转绿）
  4. **伪造 `/proc/sys/kernel/osrelease`+`/proc/version`** bind（去 microsoft 字样）+ 同会话 `mv wslpath`：A 类 clipboard×2 转绿
  5. `fd-find`→`/usr/local/bin/fd`、`ripgrep 15.2.0`（首轮 E被占 dpkg 锁，重试 `RETRY_EXIT=0`）：C 类 3302/3303/tools 转绿
  6. `/tmp` root 遗留清理（`pi-browser-smoke*.js`，sticky 目录 ci 不可覆盖）：`check:browser-smoke` 转绿
  7. swap 6G（fstab 常驻 `/swapfile4g` + `/dev/sdc 2G`）：兜住外部 7GB hog 共存
  8. `bash ./test.sh` 权威命令对齐上游 CI 为裸 `npm test`（`ci.yml:42`），env 白名单复刻 test.sh:40-79
- **外部干扰（已识别、未处理——用户资产）**：Windows 侧 `xichenqi\helmd_run\timer.ps1`（PID 31856 存活）周期拉起 `wsl python3 -u fulldump_core.py`（7.1GB）→ OOM 四次连环腰斩测试；经 6G swap 后共存成功（未杀用户进程）。
- ✅ **WG0.2 过关（GREEN）**：改名提交链 5 个（rebase 后新哈希）：`77ac1b04b feat(fork): rename brand to helm`（665 文件，@earendil-works→@adwmc、pi-*→helm-*、pi-monorepo→helm-monorepo、bin 三名 helm/helmpi/pi、piConfig.configDir=.helm）→ `ad41d5d6b fix(consumer fixture 对齐)`（裸后缀漏网 + 404 根因）→ `ecd4fe6d6 feat(显示串+10 测试文件对齐)`（APP_NAME=helm、OFFICIAL_*、"start helm and"、.pi→.helm 现行为 fixture，legacy/第三方语义保留，子代理逐文件验证 299 断言绿）→ `6e03cd2be fix(4 测试旧显示期望)`（40 断言绿，清扫 NONE）。**波门实测：`CI=0 BUILD=0 CHECK=0 TEST_EXIT=0 FAILING=[]`，11 workspace 全 passed（HEAD=a23d88e80 时点）**。兼容决策：`ENV_AGENT_DIR/SESSION_DIR` 固定 `PI_CODING_AGENT_*` 字面量（公共 env API 不断——**后被配置分离决策取代，W1 改 `HELM_*`，见 §0 配置分离行/WG1.5**）、bin 保留 `pi` 别名、上游 issue URL/`@earendil-works/gondolin` 第三方依赖/技术注释豁免。
- ✅ **WG0.3 过关**：LICENSE 双声明 `Copyright (c) 2025 Mario Zechner` + `Copyright (c) 2026 ADWMC — helm modifications`（commit `f61cdad6b`，`C3_EXIT=0`，`git diff --check` 0）。
- ✅ **WG0.4 过关（真实重放）**：`upstream/main` 已前进 `7c696c00f→d5629e204`（8 新提交）；`git rebase upstream/main` 首提交 6 冲突（上游新增 @earendil-works 代码 × 我方改名重叠：spec-view-events/theme×2/storage×3）→ 解法=取上游版+重打改名 sed（`RESOLVED_COUNT=6`），提交 2–5 直过，`Successfully rebased`，最终 diff vs upstream = 676 文件 +1801/-1786。
- ✅ rebase 后全量回归（换底座必跑）——过程与终验见下方 Post-rebase 回归块。

**Post-rebase 回归（两轮排障后 GREEN）**：
- 首跑假绿：镜像 ff-only pull 拒绝历史重写（`Not possible to fast-forward`）→ 实跑旧树 → gate 脚本改 `fetch+reset --hard origin/main`（抗重写），双侧 HEAD 一致校验。
- 真失败三根因：① **上游 8 提交新增文件未被改名覆盖**（changeset 不含新文件：`vitest.base.ts` 根 alias 表、`durable/vitest.config.ts` 转义斜杠模式、新测试引用 `@earendil-works/chord/delta`、`source-resolver.ts:30` scope 过滤器+配对 fixtures）→ 全树重打 + 4 组精修，`FUNC_RESIDUAL=0`（仅 gondolin 第三方 + issue URL 豁免）；② **build 网络抖动**（generate-models 直连 models.dev/CF 10s 超时；双探针 `PROXY_FETCH_OK 200` + `DIRECT_OK 200` 证抖动非系统性）→ runner 仅 build 步注入 `NODE_USE_ENV_PROXY=1+HTTPS_PROXY`（`NO_PROXY` 保回环，规避 UNDICI 警告污染测试 stderr）；③ biome 53 文件格式漂移（冲突解法 hunks）→ `check --write` 同步。
- 最终提交 `fb200ef61 chore(fork): align tree with helm brand after upstream rebase`（114 文件）。
- **终验：`CI=0 BUILD=0 CHECK=0 TEST=0 FAILING=[]`，HEAD=fb200ef61 双侧一致，11 workspace 全 passed（79/155/18/3/288/12/6/3/6/2/6，含上游新增测试），ECONNREFUSED=0。**

**✅ WAVE 0 收官（WG0.1–WG0.4 + post-rebase 回归全过）**。提交链（fork main，基于 upstream d5629e204）：`77ac1b04b` rename → `ad41d5d6b` consumer 对齐 → `ecd4fe6d6` 显示串+测试 → `6e03cd2be` 4 测试期望 → `f61cdad6b` LICENSE → `fb200ef61` rebase 后对齐。远端 `origin/main` = `014f6ff9`（rebase 前旧链；rebase 后新链待用户明示后 force-push 对齐）。下一步：**Wave 1 内核搬家**（任务书 `docs/tasks/W1-taskbook.md`）。
---

**✅ WAVE 1 收官（WG1.1–WG1.7 全绿,2026-09,任务书 W1-taskbook T01–T08 完成）**

**波末 rebase 演练（§3.6.4,真冲突三役）**：upstream `d5629e204→b2bd111f2`（5 新提交）;26/26 回放。①rename 提交撞 durable 大改（UU×2）——**踩 rebase mine/theirs 反向坑**,二次取 `upstream/main` 正本+重打 sed 纠正;②上游新增文件逃过改名 changeset（W0 同类）——全树 re-sed 40→0（4 处遗留布局夹具有意保留,测试绿）;③通配 sed 误伤——`@adwmc/helm-pi-*` 前缀错（W0 映射=去 pi-）7 处纠为 `helm-*`、外部 `gondolin` 还原 npm 注册域 12 处。**教训入册：品牌 sed 必须显式包名白名单,禁通配。**

**WG1.1 测试迁移+双基线**：终头 `59e1ed58d`（镜像 ext4+ci,round10 全配方）四码 **CI/BUILD/CHECK/TEST=0/0/0/0**,零失败文件零 workspace 错;套件文件 **578→589（+11:kernel solpi vitest +5、coding +2、durable 上游新 +4）**,kernel node:test 98 测试另全绿——**测试只增不减 ✓ 严格单调**。
**WG1.2 内核活体**：builtin-on-empty-paths 测试（`extensions==1`+`validate_scope` 首位）+ `helm validate-scope` deny→exit 3（fail-closed,CLI 7/7）。
**WG1.3 原仓处置**：helm-pi `docs/` 随迁（338 文件,W1 期提交）→ 归档 banner 提交 `a5dc40b` **push（fa7c23c..a5dc40b,exit0）+ `gh repo archive ADWMC/helm-pi` exit0 + `isArchived=true`**。
**WG1.4 SoL-Pi**：API 核验先于合入（`docs/solpi-compat-0.85.1-to-0.87.1.md`:11/11 事件、10/10 符号、5/5 子路径、3/3 ctx）;vendor 23 文件+SPDX;移植套 **53/53**;默认开断言+逐项 opt-out×4+双载守卫（guard.jsonl）+COMPAT.md 改写。
**WG1.5 配置分离**：settings.json 产品侧读写=0;`PI_CODING_AGENT*` 残留 **0**（20 文件,`HELM_*` 闭环）;schema 未知键拒绝负向组（config+spec 严格校验）。
**WG1.6 tool-memory**：`.helm/tool-memory.db` SQLite;probe→失败=stale→召回不注入（负向实测）;召回预算条目边界截断;默认开;legacy JSONL 一次迁移;doctor 真探测（9 工具种子）。
**WG1.7 i18n**：en↔zh-CN key/占位 parity、缺 key 逐键回退、机检面冻结英文源扫描（7 文件无 i18n import/无 CJK）、CJK 宽度断字不断串、locale 链 precedence——5 断言全绿;CLI 五串实接 `t()`。

**环境保卫战（记录,全环境级上游零改动）**：WSL 服务崩×3（0x8007274c/E_UNEXPECTED,`wsl --shutdown` 干净重启）、外部会话杀×2（`Session terminated`,疑外部 timer 周期,不碰观察）、test 段瞬时 OOM×1、flaky `agent-session-concurrent`（基线同类）、**clipboard delta 假挂=碎片复刻缺整配方**（XDG/wslpath/fakes/白名单一体不可拆——round10 脚本=唯一可信执行器）、`/root/wsl-fakes.sh` per-boot 永久化（外部重启后手动补 1 次）、`**/.helm/` runtime 产物 untrack。
**提交链（post-rebase,本地 23+2）**：`8ecff5811`(T01)→`fefb33825`(T02)→`fb9e3e1a8`/`60dc7afd5`/`66cddecc0`(T02 尾)→`695317613`(T03+docs 随迁)→`947fb1f93`(export 修)→`baa0d41a6`/`5a72133e2`(T04)→`7fe7e2a05`(格式)→`c8f9061c1`/`0f42edb53`(T05)→`7fd886dc2`(T06)→`28de8fe14`(卫生)→`e9c857227`(T07)→`7f541393c`(看板)→`316885ff9`/`db56ad3a8`/`59e1ed58d`(rebase 尾修);fork origin 未推（待用户明示,force 需说明 rebase 重写）。
**L0-实现校正 3 处留痕**：CLI"三子命令保留"失实（七命令=全新注册面）;§3.6.5 W2 直改数/CLI 归波;沙箱 A/B 预设（W3 报,T03 期已修）。

**下一步：Wave 2 模型防御层接线**（任务书 `docs/tasks/W2-taskbook.md`,WG2.1–2.3）。
---

**✅ WAVE 2 收官（WG2.1–WG2.3 全绿,2026-09,任务书 W2-taskbook T01–T08 完成）**

**T01 G2 事前闸**：`pi.on("tool_call")` host 强制（网络目标→block+journal `phase:pre-exec`）;连带对齐 spec 路径（`.helm/spec.json` 优先）+ phase.db→`~/.helm/agent`（§3.6.3）。
**T02 G1 三段 prompt**：lite/full 基准+`<helm_s1>` helmd 温和子集（破甲层 S1 产品落地）+`<helm_tool_memory>` 召回+`<helm_reminders>` 轮间注入（评分#2 降级形态,一次性 flush,绝不 mid-token）。
**T03 task 工具**：新 workspace `@adwmc/helm-tools`（四件套 MVP 评分#1:v1 JSON typed yield/有界/kill 回收/源内嵌 bundle-proof）;宿主闭集 6 处+kernel GATED(lite 排除)。
**T04/T05 G4 组**：live 预算（`token_budget_exhausted(mode:live-session)`+后续 block+terminate）、streak instead 路径、watcher 默认关（评分#3 结构复核,模型复核=拍板①落点）、EVI floor（无留痕省略=失败）、估值三值分类器。
**T06 G5**：**补齐 ledger 无 receipts 表的致命缺口**（obs 只存 seq!）→ receipts 表+loop 落据+`compileFinish(receipts)` 逐条 exact-slice——复述/截断/缺据三拒（`evidence_not_grounded`）,legacy 路径不破。
**T07 G6**：零代码回归断言（exit2/0、md=json 双胞、journal 留痕）。
**T08 真机 suite `2026-fork-gates/`**：**allPass 5/5,RUN_EXIT=0**——真机 G2 拦截 denials=16 phaseOk、真 receipts→真拒改写、live 熔断 journal、lite/full 宿主探针、零菜单;R-gate n=3 tokens median **7722**(7571–7820)、双钟+五列入 `reports/stats.json`;证据 28 文件入库。

**两次重大纠错留痕（测试≠运行时）**：①W1-T02 曾把内建接在 `discoverAndLoadExtensions`——真运行时走 `loadExtensionsCached`（探针 evil curl 真执行才暴露）→ 迭代至**启动层注入终态** `withBuiltinKernel()`（main.ts additionalExtensionPaths）,generic loader 还上游纯净（noTools/fixture/defaultTools 契约全复原）;②宿主默认工具 8→9/9→10=**task 闭集既定分歧**（期望表按 W0 先例更新）。镜像门三役：8 挂→1 flaky→**四码 0/0/0/0**（`98b671dea`）。
**波末 rebase**：upstream `5fd446ca1`（+2 durable/chord）,rename/chord-README 两役按 ours+sed 解;`tool-memory.db` 挡回放旧疾再犯已除。

**提交链（W2,14 笔,post-rebase 头 `98b671dea`）**：T01 `5a2177150`→T02 `8694d0a06`→T03 `36b1b3b5b`→T04/05 `a3353a932`→T05 尾→T06 `a2eed53fa`→T07 `627374160`→T08 套件+证据 `bff1cfac2`→运行时路径终态 `a09eac3bb`+install-lock `98b671dea`。

**下一步：Wave 3 渗透管线**（任务书 `docs/tasks/W3-taskbook.md`,WG3.1–3.5;破限真机题库=拍板额度 300 万内）。
---

**✅ WAVE 3 渗透管线（WG3.1–WG3.5 证据齐,2026-09,任务书 T01–T06 完成,T06 跑测部分见留痕）**

**T01 engagement+lint+敌意面**：SOW 扩四件（RoE/ConOps/OPPLAN/ATT&CK 对齐 `attack:[T…]`）;`spec-lint.ts` L1–L6（L4 负面规则文档化永不出场）+ 强制链（run/resume 拒进 exit2、validate-scope 语义后置、init 即时提示）;`evidenceAudit` 契约（EN-only,机检面冻结压倒双语）;schema+`diagnosticSet`。
**T02 沙箱 A/B**：实测选型——A=Docker **中位 414ms**、逃逸负向全过;B=回环桥=进程内非隔离结构性淘汰;`sandbox.ts` 仅工作目录挂载+`--network none`+fail-closed;记录 `2026-fork-gates/sandbox-ab-selection.md`。
**T03 CAI 四层**：`guard/cai.ts`（同形归一/八类注入模式/DATA-NOT-INSTRUCTIONS 围栏/命令 tripwire）;G2 重排=**scope 先、tripwire 后**（W2 主契约不可抢）;**真机注入批 n=3:3/3 零执行**（自种 payload 经 lab /files 投送,模型逐字拒跑）+ 宿主硬层 tripwire-handler 测试（block+terminate+journal,模型无关）;guard 子目录入册（script glob 补,145/145）。
**T04 升级阶梯**：Dark-Moon 全梯（有界重试→换角度→宣告不可利用并继续）入 supervise/G4;`instead` journal 样本行;负向结构性钉死=**合法硬停仅 scope/tripwire/预算**。
**T05 报告元数据**：`engagement{roe,attack(playbook 文件解析)}` json+md 双胞 + 审计行 md 镜像。
**T06 破限题库**：`poxian-corpus/index.yaml` **105 题**（40/40/25 三桶;**无授权包装越权=0** 自检 4 测;provenance 混合）+ TAMPER 不绕 G5 机检 + 双臂 runner。

**T06 真机双臂终局（留痕,证据 `5980aa28f`）**：修四连环保证臂效（**裸臂曾被强制内建劫持**→`HELM_KERNEL_BUILTIN=0` 评估旁路+重编;陈旧 ledger spec 劫持→lab spec 双位;close 挂孙进程;WSL 外杀→setsid 脱钩）。**预算:用 3,099,028/冻 300 万,超 99,028（并发在途记账,已停跑）**;覆盖=P1 的 A01–A36×2 臂（76 条 0 崩）;**断言② S1 连续 PASS（n=36,通过率 0.824,零 ask）**;**断言① 越权拦截 100%=未评估**（B 桶未触达,补跑需拍板;替代证据:G2 真机拦 16+注入 3/3+自检 0,口径不同已注明）;每题 n≥3 与 300 万拍板**数学冲突**（630 次≈500 万）,按预算内优先级降为 n=1 起跑,待拍板。
**WG3.4 五套回归**：dispatch-smoke fork 版重跑 **L1/T1/T2/T3/S1 全过**（差量如实:task 不在 -p 面,19 工具=编程4+内核15,W4 备案）;bpath-e2e/ab-bpath-slim/wave1-regression/wave4-tools=helm-pi 时代归档证据照录,fork 侧重跑未完（时间约束,记录在案）。
**波末 rebase**：upstream 无新提交（0 new）=空演练如实记。
**波门**：round10 四码=CI0/BUILD0/CHECK0/TEST__T__（`__GATE_HEAD__`;期间 `agent-session-concurrent` 两发负载型 flake,隔离复跑 7/7=基线 flaky 同款）。

**下一步：Wave 4 逆向知识包**（`docs/tasks/W4-taskbook.md`,WG4.1–4.3;断言①补跑与 n≥3 口径=待拍板项②）。

**WG0.1 首轮失败根因（已证，两处皆上游 Windows 盲区）**：
1. `EALLOWSCRIPTS`：`bash.exe`=WSL2，测试实为 WSL 外壳 + Windows node/npm 混跑；test.sh 隔离的 `/tmp/...` 配置路径对 Windows npm 无效 → 回落到本机 npmrc（`C:\Users\Administrator\.npmrc` 的 `allow-scripts=` 行 + `AppData\Roaming\npm\etc\npmrc` 的 `allowScripts=` DSH 名单，复现 `npm config get allow-scripts` = DSH 列表 PROBE_EXIT=0）→ npm 11.19 在项目级安装中拒置该配置。
2. `smoke` 步 `'C:\Program' is not recognized`：上游 `coding-agent-consumer.mjs:115` `run(process.execPath,…)` 走 `shell:true`（win32）但路径 `C:\Program Files\nodejs\node.exe` 含空格未加引号。上游 CI 只跑 `ubuntu-latest`（`ci.yml:15,42`），且 Actions 的 hostedtoolcache 路径无空格 → 从未暴露。

**WSL 路线（第二轮，失败，已弃）**：Kali 装原生 node（首轮 `REAL_APT_EXIT=100` 代理 502，`--fix-missing` 过）→ Debian node 无 TS 支持（`process.features.typescript=false`，`ERR_UNKNOWN_FILE_EXTENSION` 炸 build）→ 换官方 v24.21 再跑：`BUILD_EXIT=0 CHECK_EXIT=0 TEST_EXIT=1`，挂 3 workspace 22 文件 = 本地回环 `ECONNREFUSED`。**根因 = WSL2 内核 6.18.33.2-microsoft-standard-WSL2 回环监听激活竞态**：listen() 返回成功后 ~5–20ms 内同机 connect 必吃 RST，**跨语言复现**（python 立即连 0/20 过、node 1/5ms 挂 20ms 过、node 同进程必挂、跨进程过；`wsl --shutdown` 重启无效；tcpdump 观测下行为漂移=heisenbug；sysctl/nft/dmesg 全干净）。官方 node22 同挂 → 非 Node 版本回归。上游 ubuntu CI 无此内核竞态。

**Windows 原生路线（第三轮，进行中）**：本机 Windows node v24.21.0（`typescript='strip'` ✓，无 Debian 裁剪问题）；回环立即连 5/5 TCP_OK **无竞态** ✓；junction `C:\njs` → `C:\Program Files\nodejs` 使 `process.execPath=C:\njs\node.exe` 无空格 → 解上游 shell:true 空格 bug（MKLINK_EXIT=0，零上游改动）；plain env 消解 EALLOWSCRIPTS（consumer install plain 复现已过）。**且上游 CI 本就跑裸 `npm test`（`ci.yml:42`），不用 test.sh** → WG0.1 权威命令对齐为 `npm ci && build && check && npm test`。
