# Ponytail 机制吸收（方案笔记）

> 来源：本地 zip 解压 `reference/repos/ponytail-extract/ponytail-main`（gitignore，不入库代码）  
> 上游：DietrichGebert/ponytail ·「lazy senior dev」skill  
> 日期：2026  
> 原则：**吸收机制，不缝合源码**（与 CAI/Cairn 等同一纪律）

---

## 1. Ponytail 是什么（一句话）

给任意 coding agent 注入一套 **「最懒但正确」的实现阶梯**：先别写、先复用、先用标准库/平台能力，最后才写最小代码；**永不砍** 安全、校验、可访问性、理解问题本身。

对标我们刚测的 **D 组 17 次工具 / 94s**：它解决的是 **agent 过度建设与轮次膨胀**，和 helm-pi 的「证据链多轮」是不同问题，但 **同属「该省的省、该留的留」**。

---

## 2. 值得吸收的方案（按优先级）

### 2.1 实现阶梯（The Ladder）→ 写进方法论 / 可选 persona 段

```text
1 是否需要存在？          → YAGNI
2 代码库里已有？           → 复用
3 标准库/运行时自带？       → 用它
4 平台原生能力？            → 用它
5 已装依赖？                → 用它
6 能一行？                  → 一行
7 否则：最小可工作实现
```

**约束（与 P 系原则一致）**：

- 阶梯在 **理解问题之后** 跑，不是替代阅读。  
- **禁止**砍：信任边界校验、防丢数据、安全、无障碍、用户明确要求。  
- Bug 修根因：先搜调用方，改共享点一次。

**helmpi 落点**：

| 位置 | 做法 |
|------|------|
| `docs/methodology.md` | 增「实现阶梯」操作纪律（写脚本/工具前） |
| 可选 persona 增补 | 短句：「能不写则不写；能平台则平台；安全校验不减」 |
| `references/toolbox/` | 可加 `minimal-implementation.md`（阶梯+平台表精选） |

**不**把整份 SKILL.md 灌进 system prompt（违反 P3）。

### 2.2 强度档 lite/full/ultra → 对齐 `analysis_mode`

他们用 **行级过滤** 按档位裁剪 skill 正文（`filterSkillBodyForMode`），只保留当前档示例/表行。

**helmpi 落点**：

- 我们已有 `lite | full | deep`（helm-d 同款）。  
- **对齐策略**：  
  - `lite`：**默认不** `route_task` / `skill_index` / 多次 `read_reference`（只 `triage`+报告）；prompt 不要求 `helmpi_status`。  
  - `full`：route + 至多 1 次 `index` + 按需 1–2 篇 reference + 标准证据。  
  - `deep`：现工作流（多 evidence + findings）。  
- **直接针对性能测试 D 慢的 P0 原因**：默认「能力全开」导致轮次爆炸。

### 2.3 按需、短、持久的规则注入（不是每轮全文）

- Session 时注入 **过滤后的规则集**；模式用 **flag 文件**（`.ponytail-active`）。  
- 子 agent：父上下文够不着时再注入（SubagentStart）。

**helmpi 落点**：

- **不要**每轮塞完整方法论。  
- `session_start`：短状态一行 + 当前 `analysis_mode`。  
- 规则主体仍走 **references 按需读**（已有 P3）。  
- 子代理（若以后用 delegation）：进入时带 **3–5 行核心纪律**，不带全库。

### 2.4 Pi 打包形态（`package.json`）

```jsonc
"pi": {
  "extensions": ["./dist/index.js"],  // 或 pi-extension 入口
  "skills": ["./skills"]              // 可选：技能目录
}
```

他们 **extension + skills 并列**。  
**helmpi**：当前只有 `pi.extensions`。可选二期把精选 playbook/阶梯做成 **skills** 目录，让 Pi 原生 skill 发现，而不是全靠自研 `read_reference`（可并存）。

### 2.5 平台优先表（platform-native）

`docs/platform-native.md`：「你以为要装库，运行时早有」的对照表。

**helmpi 落点**：工具箱文档可加安全侧精简版（Python stdlib `sqlite3`/`hashlib`/`urllib`、系统 `curl`/`file`/`ss`…），写脚本前先扫一遍 → 减少「装工具/写包装」轮次。

### 2.6 输出纪律：Code first，解释 ≤3 行

> 说明比代码长就删说明（除非用户要报告）。

**helmpi 落点**：

- 会话交付：先结论/命令/E-id，再短依据。  
- **正式报告**仍用 `evidence/reporting.md` 全模板（用户要的交付 ≠ 唆叨）。  
- 与 AGENTS「交付四前缀」并存，不冲突。

### 2.7 有基准的改法

他们用 **真 agent 真 repo、同题有/无 skill、n=4** 测 LOC/token/cost/time。

**helmpi 落点**：测试标准已要求同 prompt；可补 **「最小任务档」** 与 **「全证据档」** 分开，避免用 D 的 94s 去打 C 的 33s（见 `performance-analysis.md`）。

### 2.8 子 agent / 钩子分发的工程细节（实现参考，非抄码）

- 静默失败（stdout EPIPE 不炸 hook）。  
- 默认路径不依赖 stdin（Windows 管道坑）。  
- 匹配失败 **fail-open 注入** 而不是丢规则。  
- deactivation 必须是 **整条消息** 才是命令（避免误伤）。

**helmpi**：扩展加载期已学过 action 限制；继续 **load 失败降级、不 brick 会话**。

---

## 3. 和 helm-pi 的分工（避免搅浑）

| | Ponytail | helm-pi |
|--|----------|---------|
| 管什么 | **怎么写代码/选方案**（懒阶梯） | **安全分析怎么做完**（scope、证据、Run、破甲） |
| 不管 | 渗透目标 scope、E 链 | 通用 coding 过度设计（可借阶梯） |
| 关系 | 方法论/技能可选层 | 宿主产品；阶梯可挂 toolbox 参考 |

**不要**把 ponytail 整包 `pi install` 进 helm-pi 依赖树当运行时硬依赖；最多 **文档引用机制** 或用户自选同装。

---

## 4. 建议落地顺序

| 序 | 动作 | 优先级 |
|----|------|--------|
| 1 | `methodology.md` 增加「实现阶梯」+ 安全不砍清单 | P0 |
| 2 | `analysis_mode=lite`：关闭默认 route/reference 多跳（行为开关） | P0（治慢） |
| 3 | 测试 prompt **去掉** helmpi_status 强制探测（已有分析建议） | P0 |
| 4 | toolbox 精简平台优先表 | P1 |
| 5 | 可选 `pi.skills` 目录试点 | P2 |
| 6 | 交付「短答 vs 正式报告」分轨写进 methodology | P1 |

---

## 5. 一句话

**Ponytail 的好方案 = 「实现阶梯 + 档位过滤注入 + 短持久规则 + 平台优先 + 有基准的懒」**；  
对 helm-pi：**治过度建设与轮次膨胀**，用 `analysis_mode` 和方法论吸收，**不引入其源码依赖**，与证据链/Run 内核正交。
