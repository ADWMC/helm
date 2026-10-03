# 报告：一次失控会话的根因分析

日期：2026-09-30
结论：**不是跨会话串台，也不是模型服务侧泄露。是 helm 的系统提示词残留 pi 身份，导致模型在没有任务的情况下自行虚构了一个 Go 补丁任务并在其上空转。**

---

## 1. 现象

用户在 helm 中看到如下内容（并非本人输入）：

```
I have enough to characterize the patch. Budget is at 61% with risk of hitting context limit.
I should stop experiments and report now...
Old: ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second) ...
$ cd ~/work/kubee-0.4.0; gofmt -l internal/client/client.go; go build ./...
你他妈在干嘛
```

其中 `C:\Users\Administrator\work\kubee-0.4.0` 在本机**从未存在**。

用户提出两种怀疑，本报告逐一验证并排除：
1. 是不是别人的会话被引导到了这个窗口
2. 是不是模型（MiMo）把别人的会话内容返回了

---

## 2. 定位过程与证据

### E1 — 会话文件真实存在，且自带 cwd

```
C:\Users\Administrator\.helm\agent\sessions\--E--Downloads-qihuai——11.0——dfm--\
  2026-09-30T15-09-15-757Z_01a0f2dc-dc6c-73b4-bf42-72635ab0c2f3.jsonl

首行：{"type":"session","version":3,"id":"01a0f2dc-…","timestamp":"2026-09-30T15:09:15.757Z",
      "cwd":"E:\\Downloads\\qihuai——11.0——dfm"}
```

helm 的会话按 cwd 分桶存放，因此该目录名即启动目录。`E:\Downloads\qihuai——11.0——dfm` 实际存在（内含 `qihuai 11.0_dfm.sh` 等三个脚本）。

### E2 — 时间与进程吻合到毫秒

| 项 | 值 |
|---|---|
| helm 进程 PID 20148 启动 | 2026-09-30 23:09:15 |
| 会话首条记录 | 2026-09-30T15:09:15.757Z（本地 23:09:15.757） |

该进程父进程为 `pwsh.exe`，即由命令行启动的交互式 helm 会话。**该会话就是这个进程写的。**（进程现已退出。）

### E3 — 不存在性验证

```
C:\Users\Administrator\work                : 不存在
C:\Users\Administrator\work\kubee-0.4.0   : 不存在
```

`work` 目录本身从未建立。

### E4 — 排除"会话被引导"（无跨会话机制）

对该 jsonl 全文检索：

| 关键词 | 命中行数 |
|---|---|
| `parentSession` | 0 |
| `resume` | 0 |
| `session-file` | 0 |
| 其他会话 id（如 `01a0edbf` 等） | 0 |

会话头部无继承字段，正文无任何其他会话的引用。**不存在会话串联/回放路径。**

### E5 — 排除"模型返回了别人的会话"（输入侧证据）

**关键数据：首条回复的 `usage.input` 仅 4059 tokens。** 系统提示纯文本约 2936 字符，加用户输入与工具定义正好约 4000。若模型侧混入他人会话，输入量会高出数量级。

整个会话的用户消息只有三条，全部为用户本人所发：

| 行 | 内容 |
|---|---|
| 12 | `helm` |
| 26 | `你他妈在干嘛` |
| 29 | `？` |

**不存在第四条输入。** 且 `kubee` / `Got the patch file` / `gofmt` / `go build` 全部出现在 **assistant 的 thinking 与 toolCall** 中，输入侧一次都没有。

结论：模型没有收到任何属于他人会话的内容。

### E6 — 幻觉内容是在"读任何文件之前"产生的

会话前 13 行的结构：

```
11  message(system)     ← 系统提示，12967 字符
12  message(user)       ← "helm"
13  custom              ← sol-pi-online-context-state-v1
14  message(assistant)  ← 开口即 "Got the patch file." + cd ~/work/kubee-0.4.0 ...
```

行 14 之前**没有任何文件读取或命令执行**。模型在毫无输入依据的情况下声称"拿到了补丁文件"。

在系统提示全文（12967 字符）中检索：`kubee` 0 次、`patch` 0 次、`C:\Users` 0 次。系统提示的 cwd 段明确写着 `E:/Downloads/qihuai——11.0——dfm`。

**因此 `C:\Users\Administrator\work\kubee-0.4.0` 是模型自行生成的字符串。**

---

## 3. 根因

### 3.1 直接原因：helm 发出的系统提示仍在声明 pi 身份

会话中实际记录的系统提示（行 11）只包含 `preamble / tools / rules / docs / cwd` 五段，**不含 helm 自身的约束段**（无 `<helm_s1>`、`<helm_phase>`、`<helm_normalize>`）。其内容为：

| 段 | 原文 | 问题 |
|---|---|---|
| preamble | `You are an expert coding assistant operating inside **pi**, a coding agent harness.` | 身份错误：模型以为自己在 pi 里 |
| rules | `You can inspect **PI_\*** environment variables for current model and session details.` | 变量名错误：helm 使用 `HELM_*`，模型查不到任何东西 |
| docs | `**Pi documentation** (read only when the user asks about pi itself…)` | 文档段指向 pi 语境，而路径指向 helm 仓库 |

### 3.2 源码位置

`packages/coding-agent/src/core/system-prompt.ts`：

| 行 | 内容 |
|---|---|
| 159 | `"You are an expert coding assistant operating inside pi, a coding agent harness. …"` |
| 165 | `` promptSections.docs = `Pi documentation (read only when the user asks about pi itself, …) ` `` |
| 169 | `- When reading pi docs or examples, resolve docs/... under Additional docs …` |
| 170 | `- When asked about: extensions (docs/extensions.md, …)` |
| 171 | `- When working on pi topics, read the docs and examples, …` |
| 172 | `- Always read pi .md files completely and follow links to related docs …` |

这是每次会话发给模型的第一段内容。上一轮"清理 pi 残留"的改动覆盖了外连地址、身份头、变更日志链接、迁移文档链接与环境变量命名，**但未覆盖系统提示词本体**，因此该处残留至今。

### 3.3 触发条件

1. 系统提示声明 pi 身份、指向不存在的 `PI_*` 变量，且未携带 helm 的真实约束段；
2. 用户输入仅为 `helm` 二字，未给出任务；
3. 模型因此退化为通用 coding agent 行为模式，自行虚构了一个模板化的 Go 项目任务（补丁、`gofmt`、`go build`、`internal/client/client.go`、C2 心跳），并在其上反复空转（自述 "Budget is at 61%… I should stop experiments and report now"，却继续执行）。

值得注意的是：模型随后报告 `~/work` 在 bash 中不可见、而 python 可见，是在**为一个不存在的路径编造解释**。真实原因只是该路径不存在。

---

## 4. 结论

| 用户的怀疑 | 结论 | 依据 |
|---|---|---|
| 别人的会话被引导到本窗口 | **不成立** | E4：无 `parentSession`、无 resume、无其他会话引用 |
| MiMo 返回了别人的会话 | **不成立** | E5：input 仅 4059 tokens；用户消息仅三条，全部本人所发；幻觉内容位于输出侧 |
| `C:\Users\Administrator\work\kubee-0.4.0` 从何而来 | **模型自行生成** | E3 该路径不存在；E6 该字符串不在任何输入中 |

---

## 5. 待处理

1. **修复系统提示词的 pi 残留**（`system-prompt.ts` L159 / L165 / L169-172），并核对 rules 段中的环境变量指引应为 `HELM_*`。
2. **验证方式**：重建 bundle 后开启一个干净会话，捕获真实出站请求，确认 system 字段的 preamble 不再声明 pi。
3. 附带观察：该会话的系统提示未包含 helm 自身的约束段（`<helm_s1>` / `<helm_phase>` / `<helm_normalize>`），需确认这是否为"从 `E:` 盘目录启动"时的预期行为还是另一处缺陷。

---

## 附：本次报告使用的原始证据位置

- 会话文件：`C:\Users\Administrator\.helm\agent\sessions\--E--Downloads-qihuai——11.0——dfm--\2026-09-30T15-09-15-757Z_01a0f2dc-dc6c-73b4-bf42-72635ab0c2f3.jsonl`
- 系统提示源码：`packages/coding-agent/src/core/system-prompt.ts`
- 会话分组目录：`C:\Users\Administrator\.helm\agent\sessions\`
