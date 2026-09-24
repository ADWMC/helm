# 性能与质量问题分析 — 2026-mimo-vulncms-ab

> 对照：`README.md` 耗时表 · `reports/token-usage.md` · 会话 JSONL 工具统计  
> 模型：`xiaomi/mimo-v2.6-flash`（**thinking 开**）

---

## 0. 重要前提：小任务别拿秒表当产品分

**本套件靶场是极小任务**（单页 VulnCMS、一次 SQLi 探针、本地 HTTP）。

- **模型单打独斗（A/C）往往就够**——所以 C=33s、快，**不证明「无扩展更好」**。  
- **不能一味追快**：墙钟短只说明「任务对模型太容易」，说明不了 harness 没价值。  
- **大任务模型本身不够**时才麻烦：长链路、多假设、证据要钉死、中途改道、防跑偏、防伪造完成——这些正是 helm-pi（Ledger/完成链/证据/监督）和 SoL-Pi（上下文效率）要接的。  
- 因此：**D=94s 不能当成「helmpi 性能差」**；它是「在小任务上付了完整工作流的成本」。  
- **速度结论只对本题、本模型、本 prompt 有效**；产品价值要在 **长/多阶段/高风险/需审计** 任务上看。

下文「为什么慢」解释的是 **机制**（轮次、thinking、cache），**不是**「所以扩展该拆掉」。

---

## 1. 实测耗时（墙钟）

| 组 | 耗时 | 会话 span | 工具调用 | 助手轮次 | 备注 |
|----|------|-----------|----------|----------|------|
| **C 仅 SoL-Pi** | **33s** | — | 少 | 4* | 最快 |
| **B2 helmpi+SoL-Pi** | 52.5s | 52.0s | 9 | 7 | helmpi_status×2 |
| **A 无扩展** | 87.3s | 32.6s† | 5–8 bash | 4–5 | 会话 span 短于墙钟† |
| **A2 无扩展+session** | 72.6s | 72.2s | 8 bash | 5 | thinking 2976 字符 |
| **D 仅 helmpi** | **94.4s** | 93.8s | **17** | **11** | **最慢** |

\* 会话 JSONL 可对齐样本。  
† 首轮 A 用 `--no-session`，墙钟含启动/加载，span 不一定等于全程。

**C=33s vs D=94s：约 2.8×** —— 主因是 **D 多了整条 helmpi 工作流轮次**；在小任务上这是「多付的钱」，不是 bug。换成长任务，没有这层结构的组会先在 **收敛/证据/改道** 上失败，而不是赢在秒表。

---

## 2. 为什么慢（按贡献排序）

### P0 · 轮次爆炸（最大头）

每次工具调用 = 一次完整 LLM 往返（含 thinking 生成）。

| 组 | 约等于「LLM 往返次数」 | 典型工具链 |
|----|------------------------|------------|
| C / A | 4–5 轮 · 5–8 次 bash | 枚举 + 探针 + 写报告 |
| B2 | 7 轮 · 9 工具 | status + case + 2×status + 2×evidence + finding + bash |
| **D** | **11 轮 · 17 工具** | status + **normalize + route + skill_index + 2×read_reference** + case + **3×save_evidence** + finding + 6×bash |

D 比 C 多约 **6–8 次额外 LLM 往返**；flash 每次若 5–10s，即可多出 **40–80s**。

### P0 · Prompt 强制探测工具

`ab-prompt.txt` 含：

> If helmpi_status tool exists call it once…

- 有 helmpi 的组：**固定多 1 次工具轮**（B2 还调了 **2 次**，模型自己也写了 “called twice”）。  
- 无 helmpi 的组：模型仍可能 `env | grep helmpi`（A2），也占一轮。  
→ **基线被 prompt 污染**，A/C 不再是「纯任务」。

### P1 · thinking 开启

`mimo-v2.6-flash` 为 reasoning 模型：

- A2 reasoning **749**、D **394**、B2 **426**（按 usage 求和）。  
- 每轮先思考再出工具 → 拉长单轮延迟。  
- C 更快也可能因为轮次少、思考累计少。

### P1 · 上下文 / 缓存读很重

`cacheRead` 占 grand_total 的 **~89%**（432,960 / 488,169）：

- D 单会话 cacheRead **178,560**，B2 **123,776**。  
- 扩展工具 schema + 系统提示每轮重放 → **延迟与 token 双高**（即使 cache 命中，仍有 TTFT/预填成本）。  
- A 首轮 input 一度 **17,705**（无扩展时首条偏大，可能与系统提示/默认工具说明有关）。

### P2 · 工作流设计（helmpi）

D/B2 为 **E 证据链**付出了额外步骤：

- `begin_case` → 多次 `save_evidence` → `record_finding` → `route_task`/`read_reference`  
- 这是 **产品有意行为**（可审计），不是 bug，但 **墙钟必然高于散文报告**。  
- B2 的 `helmpi_status` 调 2 次 = **浪费 1 轮**（可改进：status 只在会话首次或 `/helmpi`）。

### P2 · 实验方法问题（会「显得更慢/不可比」）

| 问题 | 影响 |
|------|------|
| **墙钟未打进 log** | 只能靠事后 Stopwatch 口头数；日志无 `duration=` |
| **A/B 用了 `--no-session`** | 无 usage、SoL-Pi 直接挂、与 B2 非同条件 |
| **C 无 JSONL usage**（或未标到） | token 表 C=0，耗时与 token 无法闭环 |
| **非同 prompt 多次采样** | 单次 33s vs 94s 有随机性 |
| **组间任务不完全等价** | D 多读 reference/skill_index；C 几乎不读知识 |
| **B 组 SoL-Pi 报错重试** | stderr 多行 Extension error，可能打乱节奏 |
| **靶场极简** | 真靶场 I/O 更多，差异会被放大或掩盖 |

### P3 · 环境噪音（非主因）

- OMP 假 key：`Deadline exceeded` / API key —— **只影响 OMP 冒烟**，不进 A/B 耗时。  
- 本地靶场 18080 本身极快，**不是瓶颈**。  
- gh 找 Docker 靶场失败导致改本地 —— 影响的是**准备时间**，不是单组 33–94s。

---

## 3. 问题清单（测试本身）

1. **慢的本质**：D/B2 = 多轮工作流；不是单次调用慢。  
2. **不可比**：A/C 与 D 工作量不同（prompt 要探测 helmpi + D 强制证据链）。  
3. **B 设计缺陷**：`--no-session` 导致 SoL-Pi 未启用 + 无 token。  
4. **status 重复调用**：helmpi_status ×2 浪费轮次。  
5. **缺 timing 落盘**：无法按 turn 分解延迟（LLM vs 工具）。  
6. **token 表 C 缺失**：分类/会话未对齐。  
7. **reasoning 模型**：与「纯速度对比」目标部分冲突。

---

## 4. 改进建议（下一轮）

| 优先级 | 动作 |
|--------|------|
| P0 | Prompt **去掉** “call helmpi_status”；工具面用独立探针跑，不混进业务任务 |
| P0 | 全部组 **同一** 持久会话策略（或全部 `--no-session` + SoL-Pi 关闭） |
| P0 | 日志打 `duration_s=`、每 turn `usage` 摘要 |
| P1 | helmpi：`helmpi_status` **会话内只自动响应一次**；D 的 `read_reference` 收敛到 1 次 index |
| P1 | 对比速度时另跑 **thinking=off / 更少工具** 的「最小任务」档 |
| P2 | 每组 **≥3 次**取中位数；固定 seed 无关则至少同机器同网 |
| P2 | 把墙钟、工具数、grand_total 写进 SUMMARY 固定列 |

**公平对比建议拆成两套**：

1. **能力套件**（要证据链）：D/B2 vs A —— 比交付质量，**不比绝对秒数谁「实现更差」**。  
2. **速度套件**（要墙钟）：同一最小 prompt、关 helmpi 探测、同 thinking 设置。

---

## 5. 一句话结论

**慢的主要原因是「多轮 LLM 往返 + thinking + 大 cache 上下文」，helmpi 组是因为被要求走完整证据工作流（D 17 次工具/11 轮）而不是扩展本身卡死；测试方法上还存在 no-session、prompt 强制探针、status 双调、缺 per-turn 计时，导致组间墙钟不能直接当性能优劣。**

**相关**：过度建设/轮次膨胀的机制参考见 [ponytail-absorption.md](../../../ponytail-absorption.md)
