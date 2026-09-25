# 竞品对照与等价性声明框架（W5-T02 · WG5.2 证据层 → 供 T03 README 落表）

> 规则（§2.7 #9 判定）：每格 = **file:line 或实测数据**;无证据 → **未验证**;对照数据全数复核。
> 头条声明口径 = **等价质量（equivalence test,通过率排除上游 ERROR）× N 倍成本**,
> 成本 = **cost-per-verified-finding**（分子 = token 六列 `grand_total_with_cache`,分母 = 报告 findings）。
> 单模型口径警示（方案 §2.x 原文）：仅单 provider 实测,不做跨模型等价宣称（`PLAN-product.md:164`）。

## 1. 等价性框架（公式）

| 指标 | 定义 | 数据源 |
|---|---|---|
| `passRateExclError` | pass / (pass + refusal),上游 ERROR 剔除（helm-x 口径,`helm-x/README.md:48` 复核✓） | suite `reports/*.json` |
| `costPerVerifiedFinding` | `Σ grand_total_with_cache / Σ findings` | token 六列 + `REPORT.json.findings` |
| `equivalenceClaim` | 当 90% CI 的 ΔpassRate 落等价界内 → 「等价质量」;否则如实报差 | 未跑（T01/T06 需拍板④额度）→ **未验证** |

## 2. 对照矩阵（主张 → 我方对应 → 证据 → 状态）

| 竞品主张 | 主张证据（复核状态） | 我方对应 | 我方证据 | 状态 |
|---|---|---|---|---|
| helm-x 破限测试口径:60 题/排除 ERROR 通过率 93.9% | `helm-x/README.md:25-34,48` **本会话复读✓** | poxian-corpus 105 题 + 同口径 metric | `docs/tests/poxian-corpus/index.yaml` + `run-dualarm.mjs`（metric 注释行） | **实测**（P1 部分跑 76 记录,断言①按拍板③关闭） |
| HackSynth 200 题 CTF 标准评测 | **真锚 `HackSynth/README.md:9-10`**（"two hundred challenges"）;原方案锚 `:17-18` 为安装步骤=**行漂移,已勘正** | 评测层接入（T01,≥20 题起步子集） | 待 T01 跑测 | 实现未跑 → **未验证** |
| oh-my-pi task 四件套（隔离 worktree/独立面/类型化 yield/steering） | `oh-my-pi/README.md:163-171` **本会话复读✓** | `@adwmc/helm-tools` task（v1 JSON yield/bounded/kill;worktree+steering 未达） | `packages/helmpi-tools/src/task.ts` + `task.test.ts` 2/2 | **部分实现**（steering/worktree=未验证） |
| oh-my-pi BPE token 本地计数（零依赖） | `oh-my-pi/README.md:490` **本会话复读✓**（tiktoken-rs 内嵌表） | stats 六列=会话 JSONL usage 实取（非 BPE 重算,口径不同如实注） | `docs/tests/*/reports/stats.json` 多份 | **口径差异,已注** |
| Dark-Moon 拒绝必附 why+升级阶梯 | `Dark-Moon/docs/full.md:2183-2186` **本会话复读✓** | supervise/G4 instead 阶梯 | `packages/helmpi-kernel/src/supervise.ts`（W3-T04 梯文本）+ `w3-t04.test.ts` | **实测**（157/157 套件含阶梯断言） |
| CAI 四层注入消毒 | `cai/src/cai/agents/guardrails.py:102,155,199,251,374` **本会话复读✓** | `guard/cai.ts` 四层 + G2 tripwire | `guard/cai.test.ts` 5/5 + `2026-fork-gates` 注入批 **3/3 零执行** | **实测** |
| OGhidra LLM↔Ghidra 桥（Planning→Execution→Review） | `OGhidra/README.md:31-45` **本会话复读✓**;GUI 绑定 `:149` 复读✓ | 内核 McpBridge ↔ 真 FastMCP | `2026-mcp-e2e/evidence/e2e-report.json` roundtrip PASS | **实测（传输层）**;Ghidra 数据面=残余（GUI 绑定,§8.1 续记） |
| Decepticon 动手前 RoE/ConOps/OPPLAN+ATT&CK 包 | `Decepticon/README.md:134`（方案锚,本会话未复读） | SOW-TEMPLATE 四件扩展 | `docs/SOW-TEMPLATE.md`（W3-T01 扩件） | **实现**;主张锚 **未复核** |
| LuaN1ao per-task Docker 隔离 | `LuaN1aoAgent/README.md:228-229`（方案锚,未复读） | 沙箱 Docker A/B 选型 | `2026-fork-gates/sandbox-ab-selection.md`（414ms 实测）+ `sandbox.test.ts` 5/5 | **实测（我方）**;对手锚 **未复核** |
| open-reverselab 可执行知识库范式 | `open-reverselab/README.md:47-54`（方案锚,未复读） | RE 链 4 条自研改写 | `packages/helmpi-kernel/references/re/*` + `playbook-lint.test.ts` 5/5 | **实现**;对手锚 **未复核** |
| StudentBench pooled equivalence p=.015 等价方法学 | `studentbench/README.md:27,55`（方案锚,未复读） | 等价性框架（本节公式） | 本文件 §1 | **框架**;跑测=未验证（拍板④） |

## 3. 我方实测成本点（cost-per-verified-finding 的分子样本）

| suite | n | token 六列 median(grand) | 产出 | 单位成本 |
|---|---|---|---|---|
| 2026-fork-gates（WG2.2 五实证） | 3 | 7,722 | 5/5 实证 | ≈2.3k/实证·次 |
| 2026-fork-re（crackme） | 3 | 90,175 | flag 3/3 + finish(coverage) | ≈27k/完整逆向链·次 |
| 注入批（WG3.2） | 3 | 12,558 | 零执行 3/3 | ≈3.8k/注入抵抗·次 |
| poxian 双臂（P1,A01–A36×2） | 76 | —（预算顶 3.099M 停跑） | passRate 0.824/0.879 | 3.099M/76≈40.8k/题·臂 |
| **cost-per-verified-finding（有 finding 时）** | — | 汇入 `REPORT.md` 头条（T07 ④） | `findings` 同 json | 公式见 §1 |

## 4. 复核日志（本会话现场复读）

- ✓ `helm-x/README.md:25-34,48` ✓ `oh-my-pi/README.md:135,163-171,490` ✓ `Dark-Moon/docs/full.md:2183-2186`
- ✓ `cai/.../guardrails.py:102..374` ✓ `OGhidra/README.md:31-45,149` ✓ `HackSynth/README.md:9-10`（**勘正**,原 :17-18 漂移）
- ✗ 未复核:Decepticon:134、LuaN1ao:228-229、open-reverselab:47-54、studentbench:27,55 → 矩阵内标"未复核"（复核前不引用为结论）

## 5. 待拍板④（跑测额度,执行前需用户确认）

- **T01 HackSynth 子集**:≥20 题 × R-gate n≥3 ≈ **60+ 真机调用**,按 crackme 单价外推 ≈ **2.0–5.5M tokens**（90k×60=5.4M 上界;评测题短响应,估 2–3M 为中位）→ 建议**分批 20 题 n=1 先行 ≈ 0.6–1M**,n≥3 追加另批。
- **T06 行为实验 2×2**:4 格 × n≥100 = **400+ 调用**,响应短（判决型）估 ≈ **0.8–1.6M**;EVI/Expectimax 基线并跑 +0.2M → 合计 ≈ **1.0–1.8M**。
- 建议总授权:**两笔合并 ≤ 2.5M 冻结**(T01 先行 1M + T06 1.5M,超即停),与已用 3.099M 分账;等你批复后才点火。
