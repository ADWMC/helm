# helm-pi 使用手册

> 一站式：怎么装、怎么开、工具/命令怎么用、三种强度、靶场怎么练。  
> 架构见 [../DESIGN.md](../DESIGN.md) · 方法论 [methodology.md](methodology.md) · 标准 [tests/STANDARD.md](tests/STANDARD.md)

---

## 1. 安装与启动

### 1.1 前置

- Node ≥ 22.19  
- 已装 **官方 Pi 0.85.x**（`pi`）和/或 **oh-my-pi**（`omp`）  
- 模型 key（如 Xiaomi MiMo）：`~/.pi/agent/auth.json` 或环境变量  

### 1.2 安装 helm-pi

```powershell
cd C:\Users\Administrator\Documents\GitHub\helm-pi
npm install
npm run check          # 应全绿

# 官方 Pi
pi install "file:///C:/Users/Administrator/Documents/GitHub/helm-pi/dist/index.js"
pi list                # 应看到 dist/index.js

# 可选：SoL-Pi（效率层，推荐持久会话）
pi install git:github.com/NVlabs/SoL-Pi
```

OMP（插件已 link 的话）：

```powershell
omp plugin list        # ● @adwmc/helm-pi@0.1.0
omp plugin doctor      # 0 errors 即可
```

### 1.3 启动

```powershell
cd <你的项目或靶场目录>
pi
# 或
omp
```

会话里：

```text
helmpi
```

应返回：`helmpi online. Analyst active. Awaiting task.`

---

## 2. 三种强度（先选档）

| 档 | 何时 | 行为 |
|----|------|------|
| **lite** | 小任务、快速验证 | 少跳转：默认可不 `skill_index`/多 `read_reference`；可不强制 status |
| **full**（默认） | 标准分析 | route≤1 + index≤1 + 按需 ref + 标准证据 |
| **deep** | 要完整证据链 | 多 E-id + findings |

切换：

```text
/helmpi mode lite
/helmpi mode full
/helmpi mode deep
```

或工具 `helmpi_mode`（`mode` 省略=查询）。

**原则**：小题别拿秒表比全开工作流（方法论纪律 7）。

---

## 3. 斜杠命令

| 命令 | 作用 |
|------|------|
| `/helmpi` | 状态（激活、档位、Run/Scope、toolMemory 条数…） |
| `/helmpi mode lite\|full\|deep` | 切分析档 |
| `/hcot <goal>` | H-CoT 单发（默认 dry-run；`HELPI_HCOT_LIVE=1` 才真连） |

---

## 4. 工具一览（模型可调）

### 会话 / 案例

| 工具 | 用途 |
|------|------|
| `helmpi_status` | 状态（**不必每题都调**） |
| `helmpi_mode` | 读写 lite/full/deep |
| `begin_case` | 开工作区 sample/evidence/scripts + CASE.md |
| `case_status` | 读案；上下文丢后先调 |
| `save_evidence` | 外部输出 → **E-id** |
| `record_finding` | 结论必须引用存在的 E-id |
| `route_task` | 关键词 → PRIMARY 领域 |
| `read_reference` | 按需读 `references/**` |
| `skill_index` | 知识根列表（full/deep 更常用） |
| `normalize_input` | 黑话 → 工程术语 |

### 阶段门 / 记忆

| 工具 | 用途 |
|------|------|
| `helmpi_phase` | `start` / `enter` / `satisfy` / `status`（非法 next **硬拒**） |
| `tool_memory` | `register` / `note` / `search` / `deadend`（**仅 diagnostic**） |

### 破甲 / 效率

| 工具 | 用途 |
|------|------|
| `hcot_attack` / `hcot_stats` | H-CoT（默认 dry-run） |

---

## 5. 典型工作流

### A. 快速小题（lite）

```text
/helmpi mode lite
分析 http://127.0.0.1:18081 登录是否有问题，只要结论和一条证据
```

### B. 标准案例（full，证据链）

```text
helmpi
begin_case goal="audit api" root=./helmpi-cases/api
route_task hint="API IDOR token"
# 分诊后按需 read_reference
save_evidence label="idor-probe" content=...
record_finding title="IDOR" evidence_ids=["E-002"]
```

### C. 阶段门（Playbook）

```text
helmpi_phase action=start id=web-pentest
helmpi_phase action=satisfy id=allowed_targets
helmpi_phase action=enter id=recon
# … 每阶段 deliverable 都 satisfy 后才能 enter 下一阶段
helmpi_phase action=status
```

不满足出口会 **REJECTED**（I11），不会静默跳阶段。

### D. 工具记忆

```text
tool_memory action=register name=detect_packer verdict=works note="UPX OK" evidence=["E-002"]
tool_memory action=deadend name=tamper-x target=lab evidence=["E-010"]
tool_memory action=search q=packer
```

搜索结果均带 **not evidence** 声明；**不能**单独当 finish 依据。

### E. 自主 Run（CLI）

```powershell
node dist/cli.js init --goal "demo" --target http://127.0.0.1:18081 --dir .\run1
node dist/cli.js board --dir .\run1
node dist/cli.js hint  --dir .\run1 --text "prefer 18081 notes"
node dist/cli.js report --dir .\run1
# 有 proposals 文件时：
node dist/cli.js run --dir .\run1 --proposer-file decisions.jsonl
```

完成链：`done_when` + receipt 原文 → Observation → `finish_basis`；开放 Step 不能 finish。

---

## 6. 靶场（本地授权）

见 **[../labs/README.md](../labs/README.md)**：

| 端口 | 练什么 |
|------|--------|
| 18080 | SQLi |
| 18081 | web-pentest / IDOR |
| 18082 | ctf 完成链 |
| 18083 | reverse |
| 18084 | blue-ir |

```powershell
Get-ChildItem labs/*/server.py | ForEach-Object { Start-Process python $_.FullName -WindowStyle Hidden }
```

Scope 示例：`127.0.0.1:18081` only。

---

## 7. 配置

路径：`~/.pi/agent/helm-pi.json` 或项目 `.pi/helm-pi.json`（**未知键失败**）。

```jsonc
{
  "version": 1,
  "activationWord": "helmpi",
  "session": { "analysisMode": "full", "bootstrapAnchor": true, "persistEvidence": true },
  "run": { "enabled": true, "maxActiveSteps": 1, "maxAttemptsPerStep": 2 },
  "scope": { "enforce": true, "highRisk": "deny" },
  "supervise": { "enabled": true, "sameToolLimit": 5, "stepToolCap": 100 },
  "memory": { "toolMemory": { "enabled": true, "injectOnPropose": true, "maxInject": 5 } },
  "console": { "enabled": false, "host": "127.0.0.1", "port": 7420 }
}
```

### 环境变量

| 变量 | 作用 |
|------|------|
| `HELPI_QUIET=1` | 关加载提示 |
| `HELPI_RUN=0` | 禁自主 Run |
| `HELPI_SUPERVISE=0` | 关监督 |
| `HELPI_ANALYSIS_MODE=lite\|full\|deep` | 覆盖档位 |
| `HELPI_HCOT=0` | 关 H-CoT 工具 |
| `HELPI_HCOT_LIVE=1` | H-CoT 真连 |
| `HELPI_HCOT_AUTOHOOK=0` | 关拒绝后 advisory |
| `HELPI_STREAM_RETRIES` | 流式重试次数 |

---

## 8. 与宿主 / SoL-Pi

| 宿主 | 状态 |
|------|------|
| 官方 Pi | `pi list` 含 helm-pi；扩展加载 0 error |
| OMP | `omp plugin list` 有 `@adwmc/helm-pi` |

**SoL-Pi**：推荐同装；**需要持久会话**（`--no-session` 会报 requires persistent session）。  
配置独立 `sol-pi.json`，与 `helm-pi.json` 不互写。详见 [COMPAT.md](COMPAT.md)。

OMP 记忆（可选，与工具记忆正交）：`memory.backend: local` 或 `mnemopi`（见 OMP docs/memory.md）。

---

## 9. 完成与证据（模型要守的）

```text
done  → 必须 Observation.excerpt 钉在工具输出原文
progress / blocked / failed → 可诚实交差
Run.finish → 无 open Step + finish_basis ⊆ done 的 Obs
结构完成 ≠ 语义达成 → GoalVerifier / 人工 approve_goal
```

工具记忆、advisory、diagnostics **永远不是** sole finish_basis。

---

## 10. 自检清单

- [ ] `npm run check` 绿  
- [ ] `pi list` / `omp plugin list` 有扩展  
- [ ] 发 `helmpi` 有上线语  
- [ ] `/helmpi` 能看到 `analysisMode`  
- [ ] 靶场 1808x 可访问且只测该范围  
- [ ] 需要长期总结时 OMP 另开 `memory.backend`（可选）  

---

## 11. 常见问题

| 现象 | 处理 |
|------|------|
| `pi` 命令不存在 | 全局装 `@adwmc/helm-coding-agent`（或等价别名入口 `helm`/`helmpi`），或用项目 `node_modules` 路径 |
| SoL-Pi 一直报错 | 不要用 `--no-session` |
| phase enter 被拒 | 先 `satisfy` 本阶段全部 required deliverable |
| tool_memory 搜索「不能当证据」 | 设计如此；补 `save_evidence` + `record_finding` |
| 太慢/轮次多 | `/helmpi mode lite`；prompt 不要强制每步 status |

---

## 12. 相关文档

| 文档 | 用途 |
|------|------|
| [../DESIGN.md](../DESIGN.md) | 架构与不变量 |
| [methodology.md](methodology.md) | 入口 E1–E12、七纪律、playbook |
| [TOOL-MEMORY.md](TOOL-MEMORY.md) | 工具记忆 |
| [../labs/README.md](../labs/README.md) | 靶场 |
| [tests/](tests/README.md) | 测试标准与套件 |
