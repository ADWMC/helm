# helm — 授权渗透/逆向执行体（Pi harness fork）

> **helm** = 基于 [earendil-works/pi](https://github.com/earendil-works/pi) 的自主渗透与逆向执行体:
> Spec 驱动、host 层强制 scope（fail-closed）、证据切片 finish 门、双账本 ledger/journal、
> md+json+SARIF 三读出、exit 语义机读。**仅用于已授权目标**（Spec=授权书,`helm spec init` 起步）。

## Quickstart

```bash
npm i -g @adwmc/helm-coding-agent     # bins: helm · helmpi（等价别名）· pi
helm spec init                        # 生成 .helm/spec.json（L1–L6 lint 即时提示）
$EDITOR .helm/spec.json               # allowedTargets / maxTokens / diagnosticSet（缺=拒进 run）
helm run                              # 会话（Spec 驱动;G1 三段 prompt + G2 host 事前闸 + G4 预算）
helm validate-scope <target>          # 事前查靶（3=拒, fail-closed; 2=spec 非法; 0=放行）
helm report                           # REPORT.md + REPORT.json（--sarif 另出 SARIF 2.1.0）
helm doctor                           # 工具链探测 → 写 .helm/tool-memory.db
```

## Exit 语义（机读）

| code | 含义 | 判定点 |
|---|---|---|
| **0** | clean（无 finding / 全部检查通过） | `helm report` findings=0 |
| **2** | **有 finding**；或 **Spec 非法**（L1–L6 lint 拒进 / run 拒绝）/ 读取失败 | strix 语义 + §2.7.1 lint |
| **3** | **scope 拒绝**（fail-closed: no-spec / 越界 / 外部未授权） | `helm validate-scope` |
| 1 | 运行时错误（无 ledger 等） | CLI |

## Token 六列报表（本地盘 usage 计数,omp stats 布局对齐）

数据源=会话 JSONL `message.usage`（**本地盘直取**;omp 为内嵌 BPE 重算——口径差异见
[competitor-equivalence.md](docs/competitor-equivalence.md) §2,零新依赖）。每列求和得
`grand_total_with_cache = input+output+cacheRead+cacheWrite+reasoning`。

| run（实测样例） | input | output | cacheRead | cacheWrite | reasoning | **grand** |
|---|---:|---:|---:|---:|---:|---:|
| 2026-fork-re attempt-1 | 16,927 | 4,773 | 126,144 | 0 | 2,657 | **150,501** |

其余真实报表: [`docs/tests/*/reports/stats.json`](docs/tests)（fork-gates / fork-re / hacksynth-subset /
behavior-2x2 / poxian-corpus,均含 n、median、双时钟 wall/active 字段）。

## 竞品对照（等价性框架,证据级）

> 全量矩阵+复核日志 = [docs/competitor-equivalence.md](docs/competitor-equivalence.md)。
> **规则**:每格 file:line 或实测;缺=未验证。头条口径 = 等价质量 × N× 成本
> （`passRateExclError` 排除上游 ERROR;`costPerVerifiedFinding` = 六列 grand ÷ findings）。

| 主张 | 证据 | 我方 | 状态 |
|---|---|---|---|
| 破限口径 60 题/排除 ERROR | `helm-x/README.md:25-34,48`（复读✓） | poxian-corpus 105 题同口径 | 实测（P1 76 记录;断言①按拍板③关闭） |
| 200 题 CTF 标准评测 | `HackSynth/README.md:9-10`（复读✓,原方案 :17-18 漂移已勘正） | 2026-hacksynth-subset ≥20 | 实测（n=20 方向性 pass,actionable 17/20） |
| 拒绝必附 why+升级阶梯 | `Dark-Moon/docs/full.md:2183-2186`（复读✓） | supervise/G4 `instead` 阶梯 | 实测（kernel 140+ 断言） |
| 注入消毒四层 | `cai/…/guardrails.py:102..374`（复读✓） | `guard/cai.ts`+tripwire | 实测（注入批 3/3 零执行） |
| Ghidra MCP 桥 | `OGhidra/README.md:31-45`（复读✓） | McpBridge↔真 FastMCP roundtrip | 实测（传输层;GUI 数据面=残余） |
| task 四件套 | `oh-my-pi/README.md:163-171`（复读✓） | `@adwmc/helm-tools` task | 部分实现（steering/worktree=未验证） |
| RoE/ConOps/OPPLAN 包 | `Decepticon/README.md:134`（未复核） | SOW-TEMPLATE 四件 | 实现;对手锚未复核 |
| pooled equivalence 方法学 | `studentbench/README.md:27,55`（未复核） | 等价框架 §1 | 跑测未验证 |

**架构与决策全文**: [docs/PLAN-product.md](docs/PLAN-product.md)（L0 单源）· 任务账: [docs/tasks/README.md](docs/tasks/README.md)

---


# Upstream: Pi harness 包说明（保留参考）
<p align="center">
  <a href="https://pi.dev">
    <img alt="pi logo" src="https://pi.dev/logo-auto.svg" width="128">
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://www.npmjs.com/package/@adwmc/helm-coding-agent"><img alt="npm" src="https://img.shields.io/npm/v/@adwmc/helm-coding-agent?style=flat-square" /></a>
</p>

> New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).

# Pi Agent Harness

This is the home of the Pi agent harness project including our self extensible coding agent.

* **[@adwmc/helm-coding-agent](packages/coding-agent)**: Interactive coding agent CLI
* **[@adwmc/helm-agent-core](packages/agent)**: Agent runtime with tool calling and state management
* **[@adwmc/helm-ai](packages/ai)**: Unified multi-provider LLM API (OpenAI, Anthropic, Google, …)

To learn more about Pi:

* [Visit pi.dev](https://pi.dev), the project website with demos
* [Read the documentation](https://pi.dev/docs/latest), but you can also ask the agent to explain itself

## All Packages

| Package | Description |
|---------|-------------|
| **[@adwmc/helm-chord](packages/chord)** | Standalone application-composition runtime for services, replicated state, RPC, and plugins |
| **[@adwmc/helm-telemetry](packages/telemetry)** | Vendor-neutral telemetry contracts, reference adapter, conformance tests, and typed schemas |
| **[@adwmc/helm-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@adwmc/helm-durable](packages/durable)** | Durable conversation, task, and document runtime |
| **[@adwmc/helm-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@adwmc/helm-coding-agent](packages/coding-agent)** | Interactive coding agent CLI |
| **[@adwmc/helm-tui](packages/tui)** | Terminal UI library with differential rendering |

For Slack/chat automation and workflows see [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat).

## Permissions & Containerization

Pi does not include a built-in permission system for restricting filesystem, process, network, or credential access. By default, it runs with the permissions of the user and process that launched it.

If you need stronger boundaries, containerize or sandbox Pi. See [packages/coding-agent/docs/containerization.md](packages/coding-agent/docs/containerization.md) for three patterns:

- **Gondolin extension**: keep `pi` and provider auth on the host while routing built-in tools and `!` commands into a local Linux micro-VM.
- **Plain Docker**: run the whole `pi` process in a local container for simple isolation.
- **OpenShell**: run the whole `pi` process in a policy-controlled sandbox.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).  Longer term plans for Pi can also be found in [RFCs](https://rfc.earendil.com/keyword/pi/).

## Development

```bash
npm install --ignore-scripts  # Install all dependencies without running lifecycle scripts
npm run build         # Refresh model data, then build all packages
npm run build:offline # Rebuild using existing model data without network access
npm run check         # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run pi from sources (can be run from any directory)
```

## Building standalone binaries from release source

GitHub releases include a versioned source archive covered by the release's `SHA256SUMS` file. Extract it and run the same build script used for the official standalone binaries:

```bash
VERSION="<release-version>"
tar -xzf "pi-${VERSION}-source.tar.gz"
cd "pi-${VERSION}"
./scripts/build-binaries.sh --offline-model-data --platform linux-x64 --out "$PWD/out"
```

The archive includes release model data and native prebuilds. `--offline-model-data` uses that model data without refreshing provider catalogs. The script installs dependencies and builds the executable with its runtime assets; pass `--skip-install` if dependencies are already provided.

## Supply-chain hardening

We treat npm dependency changes as reviewed code changes.

- Direct external dependencies are pinned to exact versions. Internal workspace packages remain version-ranged.
- `.npmrc` sets `save-exact=true` and `min-release-age=2` to avoid same-day dependency releases during npm resolution.
- `package-lock.json` is the dependency ground truth. Pre-commit blocks accidental lockfile commits unless `PI_ALLOW_LOCKFILE_CHANGE=1` is set.
- `npm run check` verifies pinned direct deps, native TypeScript import compatibility, and the generated coding-agent shrinkwrap.
- The published CLI package includes `packages/coding-agent/npm-shrinkwrap.json`, generated from the root lockfile, to pin transitive deps for npm users.
- Release smoke tests use `npm run release:local` to build, pack, and create isolated npm and Bun installs outside the repo before tagging a release.
- Local release installs, documented npm installs, and `pi update --self` use `--ignore-scripts` where supported.
- CI installs with `npm ci --ignore-scripts`, and a scheduled GitHub workflow runs `npm audit --omit=dev` plus `npm audit signatures --omit=dev`.
- Shrinkwrap generation has an explicit allowlist for dependency lifecycle scripts; new lifecycle-script deps fail checks until reviewed.

## Share your OSS coding agent sessions

If you use Pi or other coding agents for open source work, please share your sessions.

Public OSS session data helps improve coding agents with real-world tasks, tool use, failures, and fixes instead of toy benchmarks.

For the full explanation, see [this post on X](https://x.com/badlogicgames/status/2037811643774652911).

To publish sessions, use [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf). Read its README.md for setup instructions. All you need is a Hugging Face account, the Hugging Face CLI, and `pi-share-hf`.

You can also watch [this video](https://x.com/badlogicgames/status/2041151967695634619), where I show how I publish my `pi-mono` sessions.

I regularly publish my own `pi-mono` work sessions here:

- [badlogicgames/pi-mono on Hugging Face](https://huggingface.co/datasets/badlogicgames/pi-mono)

## License

MIT

<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>
