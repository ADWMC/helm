# 集成方案：pi-footer 作为 helm 数据看板

对象：[wobondar/pi-footer](https://github.com/wobondar/pi-footer) v0.5.1（MIT）

## 0. 结论先说

**pi-footer 的扩展契约与 helm 完全对齐，但要改两行 import 才能装进来。**

逐项核实过：扩展 API 面 14 个符号全部存在、helm 读的 manifest 字段一致、
`setFooter` 签名一致、连数据采集用的 `sessionManager.getBranch()` + `usage.*` 字段都同源
（helm 自带官方例子用的是同一套）。

**唯一的硬阻碍**：pi-footer 从 `@earendil-works/pi-coding-agent` 和
`@earendil-works/pi-tui` 导入，而 helm 里这两个包不存在（`@earendil-works/` 下只有
`gondolin`），helm 的对应包是 `@adwmc/helm-coding-agent` 和 `@adwmc/helm-tui`。
**必须 fork 改包名，不能原样 `helm extension add`。**

但"装进去"和"做成数据看板"是两件事：

| 层次 | 内容 | 工作量 |
|---|---|---|
| A. 装起来 | 模型/成本/token/上下文/时间/git 约 60 个 widget | 改两行 import + 拷贝 |
| B. 事件推送 | 把 helm 内部状态推进 footer | 一个扩展，~150 行 |
| C. 自有 widget | helm 专属指标（tripwire、convergence、framing） | 需改 pi-footer 源码，~300 行 |

**建议先做 A+B，C 等 B 跑一段时间、确认哪些指标真的天天看再定。**

另有一条 **B' 路**更省事：helm 官方已经有一个 footer 例子
（`packages/coding-agent/examples/extensions/custom-footer.ts`，64 行），
如果只需要 2-3 个指标，照它写比装 pi-footer 更划算。取舍见 §4b。

---

## 1. pi-footer 是什么

一个 pi 的**扩展**（不是独立应用）。package.json：

```json
{ "pi": { "extensions": ["./src/index.ts"] } }
```

入口 `export default async function statuslineExtension(pi: ExtensionAPI)`。

三层数据流：

```
collectStatuslineData(ctx, pi, footerData, eventWidgets)
        │  → StatuslineData（快照）
        ▼
renderStatuslines(widgetStore, data, width, opts)
        │  → string[]（每一行）
        ▼
config.lines: WidgetEntry[][]   ← 二维数组 = 多行 footer
```

`StatuslineData`（`src/types.ts:106`）能拿到的东西：

```
model / provider / sessionName / sessionId / thinkingLevel / textVerbosity
git (branch, sha, staged, unstaged, untracked, insertions, deletions, ahead/behind)
cwd / activeToolCount / usingSubscription
contextTokens / contextMaxTokens
metrics   (inputTokens, outputTokens, cacheRead/Write, costUsd,
           userMessages, assistantMessages, toolResults, compactions, 起止时间)
turnMetrics (本轮同名指标)
eventWidgets  ← 外部推送通道
```

约 60 个 widget 分 6 类：`core` / `git` / `layout` / `project` / `session` / `tokens`。

---

## 2. 逐项核实：契约是否对齐

### 2.1 扩展 API 面全对齐

pi-footer 依赖 14 个宿主符号（`docs/tests/pi-footer-compat.py` 逐个核对 helm 源码）：

```
ExtensionAPI, ExtensionContext, ExtensionCommandContext,
setFooter, setStatus, registerCommand, getContextUsage,
sessionManager, hasUI, cwd,
before_provider_request, session_start, session_shutdown, model_select
→ missing: none
```

关键在 helm 有 `packages/coding-agent/src/core/footer-data-provider.ts`：

```
FooterDataProvider.getExtensionStatuses()   L135
FooterDataProvider.onBranchChange(cb)       L140
ReadonlyFooterDataProvider                  L385
```

这正是 pi-footer `ctx.ui.setFooter((tui, theme, footerData) => ...)` 里 `footerData` 要的契约。

### 2.2 manifest 字段一致

helm 的 `readPiManifest`（`core/pi-manifest.ts`）读的就是 `pkg.pi.extensions`：

```ts
const entries = pkg.pi[field];   // field ∈ ["extensions","skills","prompts","themes"]
```

pi-footer 声明的就是 `pi.extensions`。**同一份 manifest，无需转换。**

### 2.3 落点结构一致

helm 扩展放 `packages/helmpi-kernel/src/efficiency/sol-pi/extensions/<name>/index.ts`，
`package-manager.ts:644` 注释写明「smart discovery (index.ts in subdirs)」。

现有四个：`action-fusion/`、`evidence-preserving-reducer/`、`observation-pack/`、`online-context-compact/`。

它们从 `@adwmc/helm-coding-agent` 导入类型；pi-footer 从 `@earendil-works/pi-coding-agent` 导入。
**同形，只是包名不同。**

---

### 2.4 数据采集层也对齐（比 API 面更重要）

改 import 只解决"能加载"。**真正决定它显示的数字对不对的是数据采集。**

`src/metrics.ts` 的 `collectSessionMetrics(entries)` 从
`sessionManager.getBranch()` 的每个 entry 读 `entry.message.usage`，字段是
`input` / `output` / `cacheRead` / `cacheWrite` / `totalTokens` / `cost.total`。

helm 官方自带例子 `packages/coding-agent/examples/extensions/custom-footer.ts` 用的是**同一套**：

```ts
import type { ExtensionAPI } from "@adwmc/helm-coding-agent";
import { truncateToWidth, visibleWidth } from "@adwmc/helm-tui";

ctx.ui.setFooter((tui, theme, footerData) => {
  const unsub = footerData.onBranchChange(() => tui.requestRender());
  return {
    dispose: unsub,
    invalidate() {},
    render(width) {
      for (const e of ctx.sessionManager.getBranch()) {
        if (e.type === "message" && e.message.role === "assistant") {
          const m = e.message as AssistantMessage;
          input += m.usage.input;          // <- 与 pi-footer 同字段
          output += m.usage.output;
          cost += m.usage.cost.total;
        }
      }
      const branch = footerData.getGitBranch();
      ...
    },
  };
});
```

**逐项核对：**

| pi-footer 调用 | helm 对应 | 状态 |
|---|---|---|
| `ctx.sessionManager.getBranch()` | `ReadonlySessionManager` Pick 里有 `getBranch` | 有（`session-manager.ts:255`）|
| `ctx.sessionManager.getEntries()` | 同上有 `getEntries` | 有（`:259`）|
| `entry.message.usage.{input,output,cacheRead,cacheWrite,cost.total}` | 官方例子的 `m.usage.input` 等 | 同字段 |
| `footerData.getGitBranch()` | `ReadonlyFooterDataProvider` | 有 |
| `footerData.getExtensionStatuses()` | `FooterDataProvider:135` | 有 |
| `footerData.onBranchChange(cb)` | `FooterDataProvider:140` | 有 |
| `ctx.getContextUsage()` | 存在 | 有 |
| `ctx.ui.setFooter((tui, theme, footerData) => Component)` | `types.ts:195` 签名一致 | 一致 |

**另外，`collectSessionMetrics` 是刻意防御式实现的** —— `UsageLike` / `MessageLike`
的字段类型全是 `unknown`，运行时校验（文件头注释写明"keeps the defensive parsing
robust to upstream shape changes"）。所以就算 helm 的 usage 结构有细微差异，
它只会显示 0 或空，**不会崩**。这让试错成本很低。

---

## 3. 安装

### 实测结论：**必须改 import，不能原样装**

helm 的 `node_modules/@earendil-works/` 下只有 `gondolin`，**没有 pi 的包**：

```
@earendil-works/  →  gondolin（仅此一个）
```

helm 的 workspace 包名全部是 `@adwmc/*`：

```
packages/coding-agent  →  @adwmc/helm-coding-agent
packages/tui           →  @adwmc/helm-tui
packages/agent         →  @adwmc/helm-agent-core
```

而 pi-footer 的 import 是：

```ts
import type { ExtensionAPI, ... } from "@earendil-works/pi-coding-agent";
import { truncateToWidth }     from "@earendil-works/pi-tui";
```

**这两个包名在 helm 下解析失败。** 所以只有一条路：fork 进 helm 扩展树，改包名。

### 落点与改动

```
packages/helmpi-kernel/src/efficiency/sol-pi/extensions/pi-footer/
  *.ts                # 全量拷贝
```

改动仅限两处 import 替换：

| 原 | 改为 |
|---|---|
| `@earendil-works/pi-coding-agent` | `@adwmc/helm-coding-agent` |
| `@earendil-works/pi-tui` | `@adwmc/helm-tui` |

一条命令可批量做完：

```bash
grep -rl '@earendil-works/pi-' <dest> | while read f; do
  sed -i 's|@earendil-works/pi-coding-agent|@adwmc/helm-coding-agent|g; \
          s|@earendil-works/pi-tui|@adwmc/helm-tui|g' "$f"
done
```

改完跑 pi-footer 自带测试（`vitest run`，150 个测试文件）确认替换没破坏东西 ——
这些测试用的是它自己的 helper，不依赖真实宿主。

### 依赖

pi-footer 只带一个运行时依赖 `chalk ^6`。helm 若无此版本，
直接作为扩展子目录的依赖装，不要提到根 `package.json`（根锁文件有 pre-commit 保护）。

### 实测：改写可行，类型检查通过

上面的改写已实际执行并验证，不是推测：

```
改写前引用 @earendil-works/pi-* 的文件: 25 个
改写后残留 @earendil-works           : 0（干净）
```

把改写后的树放进 helm 并用 helm 的依赖解析跑 `tsc`：

```
npx tsc --noEmit --skipLibCheck --module nodenext --moduleResolution nodenext \
  --target es2022 --strict --resolveJsonModule <probe>/src/index.ts

→ 参与编译的本项目文件: 116
→ 错误: 0
→ traceResolution: '@adwmc/helm-coding-agent' was successfully resolved
```

**116 个文件、0 错误、helm 类型确实被解析到。** 这是整个方案最硬的一条证据，
说明「改两行 import」不是猜的，是真的够。

实测踩到的一个坑：`src/ui/title-bar.ts` 里有 `import pkg from "../../package.json"`，
所以必须保持 `src/` 目录层级、并把 `package.json` 一起带过去。
把 `src/*` 平铺拷贝会报 `TS2307: Cannot find module '../../package.json'`。

---

## 4. 要不要装 pi-footer：一个该先回答的问题

helm 自带 `examples/extensions/custom-footer.ts`，**64 行**，用同样的 API 做一个 footer。
它比 pi-footer 少的东西是：配置 TUI、多行布局、60 个现成 widget、图标/颜色主题、
预设、每个 widget 的选项系统。

**pi-footer 的价值集中在"不用自己写"和"可配置"，不在"能显示"。**

| 场景 | 选 |
|---|---|
| 只要 3-5 个固定指标，样式不重要 | **照 custom-footer.ts 写**，~100 行搞定，零维护 |
| 想要可配置、多行、想试各种指标组合 | 装 pi-footer |
| 需要 helm 专属 widget（阈值变色、进度条） | **两边都要改**，直接写自己的更简单 |

**我的判断**：如果最终确定只盯 §6 里那 3 个指标（tripwire / convergence / framing），
pi-footer 的 60 个 widget 和配置 TUI 是**净负担** —— 它带来一整个要维护的第三方代码树
（120 源码 + 150 测试文件），换来的能力你用不到 5%。

pi-footer 真正值得用的是**它已经替你想清楚了"footer 上该放什么"** ——
这个可以只读它的 widget 列表来借鉴，不必把代码搬进来。

---

## 5. 把 helm 状态推进 footer（方案 B）

这是投入产出比最高的一步，而且**不用改 pi-footer**。

pi-footer 自带事件通道（`src/event-widgets.ts`）：

```ts
export const UPDATE_EVENT_WIDGET_EVENT = "pi-footer:update-widget";
// payload: { widgetId: string, value: string | null }
// widgetId 必须以 "event_" 前缀
// value = null 表示删除
```

任何扩展 emit 这个事件，footer 就把值渲染出来。widget 在配置里选 `event` 类型、填那个 id 即可。

### 建议推送的 helm 指标

按"看板上真正该盯的"排序，不是按能拿到什么排序：

| 指标 | 来源 | 为什么值得看 |
|---|---|---|
| `tripwire` 计数 | `journal.kind='tripwire'`（实测 92 次） | 安全围栏触发频率，异常升高说明在乱试探 |
| `convergence` 状态 | `convergenceBlocked()` / `convergence_exhausted` | 卡在同类步骤上打转最烧钱 |
| `refusal` 计数 | `journal.kind='refusal_detected'`（55 次） | 拒答率高说明 Spec 或模型不匹配 |
| `scope_denied` 计数 | `journal.kind='scope_denied'`（523 次） | 越界尝试量，合规观测 |
| **`framing` verdict** | 本次刚接的 `review_gate.framing` | 交付方向是否偏移 |
| `evidence` / `receipt` 比 | `evidence_added` 1857 / `receipt_written` 1960 | 证据密度 |
| 预算消耗 | `token_checkpoint`（234 次） | 类似 pi-footer 自带 cost，但按 Spec 预算算 |

数据来源现成：`~/.helm/agent/phase.db` 的 `journal` 表。
`journal.kind` 实测有 17 类，`policy` 一栏可直接映射到 footer 字段。

### 扩展骨架

```ts
// extensions/helm-dashboard/index.ts
import type { ExtensionAPI, ExtensionContext } from "@adwmc/helm-coding-agent";
import { DatabaseSync } from "node:sqlite";

const EVENT = "pi-footer:update-widget";
const POLL_MS = 2000;

export default async function helmDashboard(pi: ExtensionAPI): Promise<void> {
  let timer: NodeJS.Timeout | undefined;

  function push(pi: ExtensionAPI, values: Record<string, string>): void {
    for (const [widgetId, value] of Object.entries(values)) {
      pi.events.emit(EVENT, { widgetId, value });
    }
  }

  function readJournal(dbPath: string): Record<string, number> {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare("SELECT kind, COUNT(*) AS n FROM journal GROUP BY kind")
        .all() as Array<{ kind: string; n: number }>;
      return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
    } finally {
      db.close();
    }
  }

  pi.on("session_start", async (_e, ctx: ExtensionContext) => {
    const dbPath = join(ctx.cwd, ".helm", "phase.db");
    timer = setInterval(() => {
      const counts = readJournal(dbPath);
      push(pi, {
        event_helm_tripwire: String(counts.tripwire ?? 0),
        event_helm_convergence: String(counts.convergence_probe ?? 0),
        event_helm_scope_denied: String(counts.scope_denied ?? 0),
        event_helm_refusal: String(counts.refusal_detected ?? 0),
        event_helm_evidence: String(counts.evidence_added ?? 0),
      });
    }, POLL_MS);
  });

  pi.on("session_shutdown", () => {
    if (timer) clearInterval(timer);
  });
}
```

然后在 `/footer` 里给每个 id 加一个 `event` widget。

**两个实现注意点：**

1. **只读打开 SQLite。** `readOnly: true`，且 helm 写 journal 时不能锁库。
   并发写实测存在（session 文件边跑边写），需要 WAL 或重试。先测。
2. **轮询而不是监听。** journal 表没有变更通知。
   2s 轮询的 CPU 成本可忽略（`COUNT(*) GROUP BY` 走索引），但要有 backoff。

---

## 6. helm 专属 widget（方案 C，暂缓）
如果方案 B 的 `event` widget 不够用（比如要颜色阈值、进度条、条件隐藏），
才需要 fork pi-footer 加原生 `WidgetSpec`。

契约（`src/widgets/types.ts:144`）：

```ts
export const TripwireWidget = defineWidget({
  type: "tripwire",
  label: "Tripwire",
  category: "helm",
  description: "helm 安全围栏触发次数",
  dependencies: [],                    // 声明式依赖，决定 ctx 上能用什么
  baseOptions: ["hideWhenZero", "raw"],
  properties: [],
  icons: { emoji: "🚧", nerd: "", text: "" },
  defaultStyle: { fg: "pi:warning" },
  render({ ctx, options, renderWidget }) {
    const n = ctx.eventWidgets.get("event_helm_tripwire");
    return renderWidget(n ? `🚧 ${n}` : undefined);
  },
});
```

再进 `registry.ts` 的 `WIDGETS` 数组。

`dependencies` 机制值得注意：**它让 widget 只能访问自己声明过的数据**，
所以给 helm 数据建 widget 需要往 `StatuslineData` 加字段，
而 `eventWidgets` 这条通道绕过了这个限制 —— 这也是推荐方案 B 的另一个理由。

---

## 7. 数据看板的关键设计问题

装之前要想清楚的，不是技术问题：

1. **footer 只有几行几列，是「一眼扫过」的位置，不是仪表盘。**
   60 个 widget 全开等于没有信息。建议盯 **3–5 个**，其余关掉。

2. **哪些指标变化真的会改变你的动作？**
   - `tripwire > 0` → 该去查为什么越界
   - `convergence` 增长 → 该中断，别继续烧钱
   - `framing != aligned` → 交付方向可能偏了
   如果一个指标涨了你不做任何事，它就不该占 footer 的位置。

3. **helm 和 pi-footer 都已有成本/token 显示，会重复。**
   选一个关掉。helm 的 `status.ts` 已经输出
   `budget: in=... out=... cacheR=... grand=...`。

4. **pi-footer 基于 `~/.pi/` 路径体系，helm 用 `~/.helm/`。**
   自带的 session/git widget 可能路径不对。装完要实测。

---

## 8. 分阶段落地

| 阶段 | 动作 | 验收 |
|---|---|---|
| 1 | 装 pi-footer，跑 `/footer` | footer 出现，`/footer` 能开 TUI |
| 2 | 确认 session/git/context widget 数据正确 | 与实际状态一致，不是空值 |
| 3 | 写 `helm-dashboard` 扩展，推 5 个指标 | footer 出现 helm 指标 |
| 4 | 实测 1–2 天，砍掉不看的 | 最终留 3–5 个 widget |
| 5 | 只有需要颜色/进度条时才 fork | 按需 |

**阶段 3 之前不要动 pi-footer 源码。**

---

## 9. 明确不做的

- **不把 pi-footer 当渲染引擎做全屏看板。** 它是 footer，一行或几行。
  真要看板应该读 `phase.db` 出 HTML/图表，那是另一个工具。
- **不在 footer 里塞模型输出。** 会挤掉真正要看的状态。
- **不改 pi-footer 的 widget 语义。** 它 150 个测试文件覆盖的行为别动。

---

## 10. 待验证项

装之前已核实的（不需再验）：

| 项 | 结论 | 依据 |
|---|---|---|
| 扩展 API 面 | 14 个符号全部存在 | `docs/tests/pi-footer-compat.py` |
| manifest 字段 | helm 读 `pkg.pi.extensions`，与 pi-footer 声明一致 | `core/pi-manifest.ts` |
| `setFooter` 签名 | `(tui, theme, footerData) => Component` 一致 | `core/extensions/types.ts:195` |
| 数据采集字段 | `usage.{input,output,cacheRead,cacheWrite,cost.total}` 同字段 | helm 官方例子 + `metrics.ts` |
| `getBranch`/`getEntries` | 都在 `ReadonlySessionManager` 上 | `session-manager.ts:255/259` |
| import 包名 | **不匹配，必须改** | `@earendil-works/` 下只有 `gondolin` |

仍需实测：

1. `chalk ^6` 在 helm 下是否冲突（pi-footer pin 了 v6）
2. `phase.db` 并发读会不会和 helm 写冲突（方案 B 的前提）
3. pi-footer 的 `~/.pi` 路径假设在 helm 下是否成立（`/footer` 配置读写）
4. 150 个自带测试在改完 import 后是否仍全过
5. `ctx.ui.theme.fg("accent", ...)` 里 helm 的 theme 是否支持 pi-footer 用到的所有颜色名

重跑核对脚本：`python docs/tests/pi-footer-compat.py`
