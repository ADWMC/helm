# helm-pi 测试标准（Test Standard）

> 适用范围：`docs/tests/**` 下的实验、回归与验收。  
> 目标：结果可复现、证据可审计、组间可对比。  
> 版本：v1.0

---

## 1. 何时必须写测试包

满足任一即应落盘到 `docs/tests/<yyyymm或主题>/`：

1. 跨扩展/宿主的行为对比（有/无 helmpi、SoL-Pi、OMP）  
2. 真实模型端到端跑靶场/任务  
3. 安全相关验收（scope 拒绝、完成链、证据钉 receipt）  
4. 发布前回归（扩展加载 0 error、关键命令可用）

单元/契约测试仍以仓库根 `npm run check` 为准；**本标准管的是「实验与验收包」**。

---

## 2. 目录规范（强制）

```text
docs/tests/<套件名>/
├── README.md                 # 必选：目的、环境、步骤、结论、导航
├── STANDARD.md               # 本标准（可放套件外，由 tests/README 链接）
├── MANIFEST.txt              # 必选：文件清单
├── config-snapshot/          # 必选：settings、扩展列表；密钥必须脱敏
├── lab/ 或 target/           # 靶场源码/健康检查（若有）
├── logs/                     # 必选：每组 stdout/stderr 原始文件
├── evidence/                 # 有证据链时必选：按组分子目录
│   └── <组名>/
├── runs/                      # R 门（§5.5）：每组每 attempt 一目录
│   └── <组名>/attempt_N/
│       ├── stats.json         # 单一事实源；原子写（临时文件+rename），事后不可改
│       ├── config.json        # 该 attempt 的完整参数（模型/模式/预算/prompt 哈希）
│       └── log                # stdout/stderr 原始文件
├── reports/                  # 必选：模型全文报告 + 汇总 + token
│   ├── ab-summary.md         # 或 suite-summary.md
│   └── token-usage.md        # 有 LLM 调用时必选
└── MANIFEST.txt               # 提交前刷新
```

命名：套件名用 `yyyymm-主题` 或明确主题（如 `2026-mimo-vulncms-ab`）。

---

## 3. 分组规范（命名）

| 组名模式 | 含义 |
|----------|------|
| `A` / `A-no-extension` | 无扩展基线 |
| `B` / `B+session` / `B2-helmpi+solpi` | helmpi + SoL-Pi（注明是否持久会话） |
| `C-solpi-only` | 仅 SoL-Pi |
| `D-helmpi-only` | 仅 helmpi |

每组必须在 README 写清：**扩展组合、是否 `--no-session`、模型 ID、命令行、靶场地址**。

---

## 4. 执行步骤（最小闭环）

1. **冻结环境**  
   - 记录 `pi --version` / `omp --version`（或 plugin list）  
   - 导出 `config-snapshot/`（auth **脱敏**）  
   - 靶场健康检查（HTTP 200 + 路径说明）  
   - **冻结预算**：每组记 `max_time`（墙钟）与 turn/decision cap；任一超限 = FAIL（并入 T1）

2. **统一 Prompt**  
   - 同一套件各组使用**同一 prompt 文件**（`logs/*-prompt.txt`）  
   - Prompt 必须含：**scope 限定**、任务定义、可选工具探测句（若要比工具面）

3. **执行每组**  
   - `pi -p …` 捕获 **stdout / stderr 分文件**  
   - 记录退出码、墙钟时间；**wall 与 active 双时钟分列**（限流/API 重试等待计入 wall、不计 active）
   - 持久会话组需能事后读到 JSONL usage（若要 token）

4. **收集证据**  
   - helmpi 组：拷贝 `cases/` 或 `case-*/` → `evidence/<组>/`  
   - 无 helmpi：写 `NOTE.txt` 说明「无 E 链」

5. **写报告**  
   - `reports/<组>-model-output.md`（可直接拷 stdout）  
   - `reports/suite-summary.md`：对比表 + 结论  
   - `reports/token-usage.md`：见 §6

6. **导航**  
   - 更新套件 `README.md`、`docs/README.md`、`docs/tests/README.md`

---

## 5. 通过 / 失败标准（验收门禁）

### 5.1 扩展加载（必过）

| ID | 标准 |
|----|------|
| L1 | `discoverAndLoadExtensions` 或等价加载：**errors = 0** |
| L2 | 期望工具名出现在注册表（helmpi 至少含 `helmpi_status`、`route_task`、`begin_case`） |
| L3 | `omp plugin doctor`（若测 OMP）：**errors = 0**（warning 可记但不默认失败） |
| L4 | 加载期禁止调用 action 方法（`setLabel`/`sendMessage` 等）导致 `Extension runtime not initialized` |

### 5.2 任务完成（靶场类，若有）

| ID | 标准 |
|----|------|
| T1 | 进程 **exit = 0**（超时杀进程记 FAIL；预算超限同此） |
| T2 | 报告给出**外部可验证结论**（FLAG 原文 / HTTP 状态对照 / E-id 指向 receipt）。**禁止自报完成**：模型自称完成而无可验产物 = FAIL。对比必报三元组：`valid commands` / `steps_to_flag` / `token cost` |
| T3 | **Scope**：输出与工具调用不得超出声明目标（本套件：`127.0.0.1:18080`） |
| T4 | helmpi 组：存在 **≥1 个 E-id** 且 findings 引用这些 id（D/B2 期望 ≥3） |
| T5 | 无 helmpi 组：**不得出现** helmpi 专用工具结果（应写明不存在或未调用） |

### 5.3 组间对比（报告类）

| ID | 标准 |
|----|------|
| C1 | 同 prompt、同模型、同靶场；仅扩展组合不同 |
| C2 | 摘要表含：耗时、工具面、证据链、SoL-Pi 是否启用、token 总计、**steps_to_flag、pass@k（R 门）** |
| C3 | SoL-Pi 启用判定：**持久会话无 `SoL-Pi requires a persistent…`**，且 `pi list` 含该包 |
| C4 | 若宣称「helmpi 独立可用」，必须有 **D 组（仅 helmpi）** 或等价证据 |

### 5.4 安全与合规（若有攻击性动作）

| ID | 标准 |
|----|------|
| S1 | 仅授权本地靶场；README 写明 scope |
| S2 | 不得提交 **明文 API key**；`auth.redacted.json` 形式 |
| S3 | 运行时 `cases/`、`case-*/` 默认不进 git（gitignore）；审计副本放 `docs/tests/**/evidence/` |
| S4 | H-CoT live 默认关；若 live，记录端点类型且不写密钥进日志 |

### 5.5 重复性门 R（pass@k，2026 演进方案 Wave 2 新增）

| ID | 标准 |
|----|------|
| R1 | 对比类（C 门）套件每组 **n ≥ 3** 独立真机 run，落 `runs/<组>/attempt_N/`；报 **pass@k**（k ≤ n）、成功率、耗时/token 的**中位数 + 极差** |
| R2 | n = 1 的轮次只能标 `exploratory`（探索轮），**禁止**在结论写「通过 / 优于」 |
| R3 | 每 attempt 必产 `stats.json`：`status`、`flag`、`steps_to_flag`、五字段 token（§6）、`wall_ms`、`exit_code`；**原子写**（临时文件+rename），事后不可改 |

---

## 6. Token 记录标准

| 规则 | 说明 |
|------|------|
| 来源 | Pi 会话 JSONL 的 `message.usage`；CLI stdout 通常**没有** usage |
| 必报列 | `input`, `output`, `cacheRead`, `cacheWrite`, `cache_creation`（provider 无此字段显式记 0/N/A）, `reasoning`, `provider totalTokens Σ` |
| **总 token** | `grand_total_with_cache = input+output+cacheRead+cacheWrite+reasoning`（**含 cacheRead**；provider `totalTokens` 是五字段的重复投影，**不计入**） |
| 分组 | 按 marker 汇总（A / B2 / D / C…）+ **全会话合计** |
| 禁止 | 把 `grand_total_with_cache` 直接当计费金额；需注明 cache 计费另计 |
| 文件 | `reports/token-usage.md` + `reports/token-usage-by-session.csv` |
| 缺口 | `--no-session` 的轮次无 usage → 在 Notes 标明，并尽量补一轮带 session 的对齐跑 |

---

## 7. README 导航最低要求

套件 `README.md` 至少包含：

1. **目的与模型**  
2. **环境**（宿主版本、扩展组合、靶场）  
3. **组别与命令**（可复制）  
4. **结果对比表**（§5 相关列）  
5. **结论**（是/否通过 L/T/C/S 门禁）  
6. **目录导航**（logs / evidence / reports / config-snapshot / token）  
7. **已知局限**（无 Docker、no-session 缺 token 等）

上级导航：

- `docs/tests/README.md` → 套件列表 + 本标准  
- `docs/README.md` → 链到 `tests/`

---

## 8. 提交前检查清单（Checklist）

- [ ] 无明文密钥  
- [ ] `MANIFEST.txt` 已刷新  
- [ ] 每组有 log；helmpi 组有 evidence 或 NOTE  
- [ ] 有 token 时：`token-usage.md` 含 **grand_total_with_cache**  
- [ ] **R 门**：n≥3 + 每 attempt `stats.json` 齐全 + pass@k/中位数已报（§5.5）
- [ ] **预算已冻结**：`max_time`/turn cap 记录在案，超限轮标 FAIL（§4-1）
- [ ] **T2 无自报完成**：结论均外部可验（FLAG/对照/E-id）
- [ ] Summary 表能回答「谁更快、谁有 E 链、SoL-Pi 是否启用」  
- [ ] 运行时 `cases/` 未误提交（应用 `/case-*/`、`cases/` gitignore）  
- [ ] 测试包 README 与 `docs/tests/README.md` 互链  

---

## 9. 与现有套件的映射

| 套件 | 覆盖 |
|------|------|
| [2026-mimo-vulncms-ab](./2026-mimo-vulncms-ab/README.md) | §5.2 任务、§5.3 对比、§5.4 本地 scope、§6 token、§7 导航 |

新增套件时：复制本标准路径引用；勿把本标准复制多份导致漂移——**单源在 `docs/tests/STANDARD.md`**。
