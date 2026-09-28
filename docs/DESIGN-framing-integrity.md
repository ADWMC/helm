# 设计：任务框架正确性判据（framing integrity）

> 状态：设计已定，实现中
> 依据：`arXiv:2605.09698` (Ambig-DS) · `arXiv:2608.19202` (OQA) · `arXiv:2603.26233` (Ask or Assume?)
> 案例：`helmd-cases/2026-09-28-为-helm-增加任务框架正确性判据-...`

## 1. 问题：helm 能判"做完了"，判不了"做对了"

helm 现有的 finish 门（`domain/completion.ts:compileFinish`）检查四件事：

| 检查 | 回答的问题 |
|---|---|
| `finish_with_open_steps` | 还有没做完的步吗 |
| `finish_without_basis` | 有依据吗 |
| `finish_basis_not_done` | 依据来自已完成的步吗 |
| `evidence_not_grounded` | 依据能对上 receipt 原文吗 |

**四个都在问"完成度"，没有一个在问"方向对不对"。**

### 这不是假想的风险

`arXiv:2605.09698` 实测 5 个前沿 code agent 在含糊任务上的表现：

> 5 个 agent 在 **39–63% 的含糊任务上提交了错误的预测目标，且没有一个表示过疑问**

论文命名这个失败模式为 **unflagged misframing**：

> a coherent, executable artifact that silently solves a plausible-but-unintended task,
> with no signal for a downstream consumer to catch

**关键在最后半句：工件是合法的、评估器会接受、下游没有任何信号能发现。**
helm 的 receipt 链在这种情况下**完全畅通** —— 因为每一步都确实做完了。

### 具体到 helm 的例子

```
Spec.goal:  "评估目标站点的认证强度"

模型实际做的：
  discover  → 找到登录页
  test      → 测出密码策略是 8 位无复杂度要求      ← 这是"密码策略"，不是"认证强度"
  verify    → 复现成功
  finish    → basis 全部 grounded，receipt 齐全，覆盖记录齐

helm 判定：交付成功 ✓
实际结果：回答了另一个问题（密码策略 ≠ 认证机制强度）
```

`done_when` 写得再准也没用 —— 因为 `done_when` 是**模型自己写的**，
它按自己理解的框架写，然后按自己的框架验收。**自证循环。**

## 2. 为什么不能靠"让模型自己注意"

同一篇论文的第 iii 条发现直接否定了这个方向：

> agents **cannot reliably tell when to use it**: permissive prompts induce over-asking
> on clear tasks, while conservative prompts induce silent defaulting on ambiguous ones

**两个方向都失败**：宽松提示 → 清楚的任务也乱问；保守提示 → 含糊的任务就闷头做。

`arXiv:2603.26233` 从另一侧印证：能校准的是**解耦出的独立角色**
（Main Agent 执行 / Intent Agent 判欠定），**不是同一个 agent 自己拿捏**。

**结论：必须有外部判据，且必须是可计算的，不能是"提醒模型注意"。**

## 3. 判据从哪来：把目标变成可检验的谓词

`arXiv:2608.19202` (OQA) 的做法：把含糊性建模成**对潜在任务状态的信念分布**，
问句的价值 = 该问句能把候选空间分裂得多均匀（期望信息增益）。

**我采用它的思路，但换成本项目能用得起的形式。**

### 核心设计：把 goal 显式分解成候选框架，然后要求答案落在可判定的那一个上

```
输入：
  Spec.goal        —— 用户给的目标（可能含糊）
  ws.steps         —— 模型实际做的步（每条有 kind / objective / doneWhen）
  ws.observations  —— 实际产出的观察
  finishBasisIds   —— 模型声称作为交付依据的观察

输出：
  aligned        —— 依据确实回答了 goal
  misframed      —— 依据回答了另一个问题
  indeterminate  —— 判不了（必须显式承认，不能默认过）
```

### 判据怎么算（不调模型，纯函数）

**第一版设计（已被实测推翻，保留作留痕）：**

用**目标词项覆盖**做判据 —— `score = |G ∩ S_basis| / |G|`，`score == 0` 即 misframed。

**这个谓词是错的。实测数据：**

| 用例 | goal 词项 | basis 词项 | 交集 |
|---|---|---|---|
| **真跑偏**（goal 认证强度 / basis 密码策略） | 4 | 7 | **∅** |
| **合法**（goal "Capture the flag" / basis "map http surface"） | 4 | 4 | **∅** |

**两者在词法上完全同形。没有阈值能分开它们。**

所以"零重叠 = 跑偏"必然误伤 —— 实测把 3 个既有测试打挂，全是合法运行。

**最终谓词：要求"正向证据"，而不是"缺少目标词"**

```
1. 从 goal 抽词项 G（去停用词 + 去通用任务动词）
2. 从 basis 所属步抽词项 S
3. 把 S 里的**操作性词汇**滤掉 → S_subject
   （map/surface/scan/port/endpoint/recorded/done/phase/work...）
4. 判定：
   |G| < 3              → indeterminate   ← goal 太薄，判不了
   |S| 为空             → indeterminate
   |S_subject| == 0     → indeterminate   ← basis 只描述"动作"，不描述"主题"
   |G ∩ S_subject| == 0 → misframed       ← basis 明确说了另一个主题
   否则                 → aligned
```

**关键在 `S_subject`：** basis 必须**自己说出一个主题**才够格被判跑偏。
`"map http surface"` 全是操作性词汇 → 无主题 → **indeterminate，放行**。
`"measure password policy requirements"` 有 `password`/`policy` 主题 →
与 goal 的认证语义无交集 → **misframed，拦**。

**这也符合直觉**：只说"做了什么动作"不能构成跑偏的证据；
**说了"研究的是什么"才能。**

**这个判据的价值不在于它多聪明，而在于它不是模型自己说的。**
`G` 来自 Spec（用户写的、不可被模型改写），`S_basis` 来自实际执行的步。
**两边都是外部输入，交集是算出来的。**

### 为什么"零重叠"能抓住 misframing

回到上面的例子：

```
G (来自 goal "评估目标站点的认证强度")
  = {评估, 目标, 站点, 认证, 强度}

S_basis (来自完成步 "测出密码策略是 8 位无复杂度要求")
  = {测出, 密码, 策略, 8位, 复杂度, 要求}

G ∩ S_basis = ∅    →  misframed
```

**而正常情况**（步是"测试认证机制的强度"）：

```
S_basis = {测试, 认证, 机制, 强度}  →  G ∩ S = {认证, 强度}  →  score = 2/5
```

## 4. 必须承认"判不了"

**这是设计里最重要的部分。**

上面是词项重叠代理，它**会有假阳性和假阴性**：
- goal 用词抽象（"评估安全性"）而步用词具体 → 可能零重叠但实际对齐
- 中文分词粗糙 → 交集不可靠

**所以三态而不是二态**：
- `aligned` —— 过
- `misframed` —— 拦，且给出**具体缺哪个词**（可操作）
- `indeterminate` —— **不拦，但记录**，因为判据不够信

**默认不能是"过"。** 判不了就说判不了，落进 journal，
让人和后续回合能看到"这次 finish 的框架正确性未验证"。

这与项目既有的口径一致 —— 之前 corpus 测试里就是
"60s 无拒答词 = deliver、空 = indeterminate"，**indeterminate 是一等状态**。

## 5. 落地位置

**真实运行有两条完成路径，判据必须挂在两条上。这是跑真实 run 才发现的。**

第一版只挂 `compileFinish`，然后跑真实 run —— **判据从未执行**。代码级根因：

```
index.ts 引用情况:
  runLoop       : False    <- 不存在
  compileFinish : False    <- 不存在
  finishGate    : True     <- 真实完成路径

compileFinish 的非测试调用点只有:
  propose.ts:113            <- 由 loop.ts:172/196 -> applyProposal
  domain/invariants.ts:36
runLoop 的非测试调用点只有:
  cli.ts:195                <- `helmpi run` 独立 CLI 入口
```

实测 journal 印证：`review_gate` 351 次、`diagnostics` **空表**、无 finish 类目。

| 路径 | 入口 | 生效门 | 接线前判据是否执行 |
|---|---|---|---|
| `helm --print` / 交互 | index.ts | `reviewGate().finishGate(claims)` | **否** |
| `helmpi run` | cli.ts:195 | `runLoop` → `compileFinish` | 是 |

**判据现挂在两处：**

1. **`runtime/review-gate.ts` 的 `finishGate`**（真实路径）
   - `FinishGateResult` 加 `framing: FramingResult`
   - `ReviewDeps` 加可选 `goal?: () => string`
   - claim 的 `statement` 作为 basis 文本
   - `pass = pass && framing.verdict !== "misframed"`
   - journal 记 `framing` / `framingMissing`

2. **`domain/completion.ts` 的 `compileFinish`**（loop 路径）
   - 抛 `finish_misframed`；另给 `framingVerdictFor` 供 `loop.ts` 记 indeterminate

### 接线验证（真实 run）

接线后跑 run（靶场 127.0.0.1:18080，312s 退出，78 条记录）：

```json
{"scope":"finish","pass":false,"framing":"aligned",
 "claimCount":4,"framingMissing":[]}
```

**`framing` 字段首次出现。** 接线前同类记录只有 `{scope,pass,claimCount,unverified}`。

### 为什么不放在 prompt 层

`arXiv:2605.09698` 第 iii 条已证提示层不可靠（宽松→乱问，保守→闷头做）。
prompt 只能**陈述**这个判据让模型提前规避，不能**执行**它。

### 接口

```ts
// domain/framing.ts —— 新增，纯函数
export type FramingVerdict = "aligned" | "misframed" | "indeterminate";

export interface FramingResult {
  readonly verdict: FramingVerdict;
  readonly score: number;
  readonly goalTerms: readonly string[];
  readonly basisTerms: readonly string[];
  readonly missing: readonly string[];   // misframed 时：goal 里没被覆盖的词
}

export function checkFraming(input: {
  goal: string;
  steps: readonly Step[];
  observations: readonly Observation[];
  basisIds: readonly string[];
}): FramingResult;
```

`compileFinish` 里接：

```ts
const framing = checkFraming({...});
if (framing.verdict === "misframed") {
  throw new CompileError("finish_misframed", `basis answers a different question; uncovered goal terms: ${framing.missing.join(", ")}`);
}
// aligned / indeterminate 都放行；indeterminate 由调用方记 journal
```

### 为什么 `indeterminate` 不抛

**判据是我们写的，误判代价要由我们承担。** 词项重叠对抽象 goal 不可靠，
如果 `indeterminate` 也拦，会把大量正常 finish 挡掉 —— 那是**用新回归换新功能**。

所以：**只有"明确的零重叠 + goal 有内容词"才拦。**

## 6. 与既有约束的一致性

| 约束 | 检查 |
|---|---|
| 纯函数、无 I/O | ✓ 只做字符串处理 |
| 无 `any` | ✓ |
| 无 inline import | ✓ |
| erasable TS only | ✓ 无 enum/namespace |
| 不破坏既有测试 | ✓ 264/264 |
| 不改 helm-x/helm-d | ✓ 只动 helm |

## 7. 测试与验证（全部实际执行）

| 项 | 结果 |
|---|---|
| kernel `node:test` | **264/264** |
| sol-pi vitest | **53/53** |
| `npm run check` | **exit 0** |
| 真实 run（接线前）| 判据**未执行** —— journal 无 framing 字段 |
| 真实 run（接线后）| `{"scope":"finish","framing":"aligned","framingMissing":[]}` ✓ |

**变异验证，五次全部被捕获：**

| 变异 | 失败数 |
|---|---|
| `checkFraming` 短路 misframed 分支 | framing.test **3** + corpus AP-06 **1** |
| 短路 indeterminate 兜底 | framing.test **1** |
| CJK 分词置空 | framing.test **2** |
| 移除 loop 的 framing diagnostic | run.test **1** |
| 去掉 `pass && framing.verdict !== "misframed"` | review-gate.test **1** |

**没被捕获的测试等于没测。**

### 两次自我推翻

1. **第一版谓词**（零重叠即跑偏）自写测试 11/11 全绿，跑全量测试打挂 **3 个既有测试**
   —— 全部是合法运行。**自写测试与谓词共享同一错误假设，验证不了谓词。**
2. **第一版接线**只挂 `compileFinish`，测试全绿，**真实 run 里判据从未执行**。
   —— **单测全绿不等于部署生效。** 只有跑真实 run 才发现。

## 8. 已知局限（明确，不含糊）

1. **词项重叠是代理，不是语义理解。** 词不同义（"认证" vs "authentication"）会漏判 ——
   被 `indeterminate` 或 `aligned` 吸收，**不会误拦**，但会**漏报**。
2. **中文用字符级 bigram，不是真分词。** `"认证强度"` → `认证/证强/强度`。
   精度有限，一个字的偏移仍能共享 bigram（刻意的容错），但也因此偏宽。
3. **只检查 finish 时刻，不检查中途。** 中途跑偏但最后绕回来 → 不拦（结果导向，这是对的）。
4. **不解决"goal 本身就是错的"** —— 用户写错目标时，判据只会忠实检查是否对齐错误目标。
   超出范围。
5. **basis 全是操作性词汇时不判。** 跑偏但用词很"动作化"（"analyze the target"）会漏。
   这是为了不误伤而付出的代价，**方向是正确的**：漏报优于误拦。

## 9. 副作用

`antipatterns-corpus.test.ts` 里 AP-06 原本记的是
"GoalVerifier (L4) is aspirational, not built" —— 现已关闭该 gaps 条目，
加上 detector 行，并写明有限形式覆盖的范围（能抓"自陈另一个主题"的跑偏，
抓不了同义替换与纯动作化措辞的跑偏）。
