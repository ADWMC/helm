# 2026-wave4-tools — Wave 4 工具/知识面真机套件（步 5 验收）

> **标准**：[../STANDARD.md](../STANDARD.md) · **方案**：[../../PLAN-evolution.md](../../PLAN-evolution.md) §4 步5 · **模式**：attempt1 事故如实入档 + attempt2 成功
> **模型**：`xiaomi/mimo-v2.6-flash` · **宿主**：官方 Pi `0.85.1` · **靶场**：`127.0.0.1:18081` · **新面**：api playbook / phase 门 / attack 字段 / lint+coverage / export 双产物

## 1. Wave 4 落地清单（代码面，全部有 `npm run check` 退出码背书）

| 项 | 落点 | 验证 |
|---|---|---|
| `attack: [T…]` 字段 + 格式拒错 | `playbook.ts`/`playbook-yaml.ts`/`SCHEMA.md` | 单测 ×2（含 `BOGUS` 拒绝） |
| **api 域 playbook**（6 阶段：scope→recon→authz→chain→report→close） | `references/playbooks/api.yaml` | lint ok + 真机全链走通 |
| playbook lint 进 `npm run check` | `tools/lint-playbooks.mjs` + package.json | `lint-playbooks: 4/4 ok · attack ids=4` |
| ATT&CK navigator + 覆盖表 | `tools/attack-coverage.mjs` → `references/attack-{navigator.json,coverage.md}` | `techniques=2 playbooks=2/4`（T1078/T1190 ← api+web-pentest） |
| MCP 受管桥（ScopeGate+risk 阶梯，**零 MCP SDK 依赖**） | `src/host/mcp-bridge.ts` + 假服务器集成测试 | connect/list/call + scope/risk/domain ×4 测试 |
| config `mcp.servers` 严格 schema | `src/config.ts`（未知键拒） | typecheck + 既有 config 测试 |
| export 三件：Diagnostics 段(I6 注明) / JSON twin / 退出码 0·2 | `export.ts`/`cli.ts` | 单测（findings 0→exit0，fact→exit2） |
| references 索引四要素 + 雷达 | `references/index.md`、`agentic-sec-radar.md` | 文档（链接见 MANIFEST） |
| **反模式语料对照测试** | `src/antipatterns-corpus.test.ts`（8 行映射 + 显式 KNOWN GAPS） | 见下方 check 结果 |

**T639 插曲**：api.yaml 初版写 `T639`，本地 Anthropic-Skills ATT&CK 全映射（818 skills + OWASP 交叉表）**零命中** → 判非真实 ID，删除（宁缺勿猜规则自执行）；`TID_RE` 放宽为 3–4 位以容纳真实短 ID。

## 2. 真机两轮

### attempt 1 — **bash 服务故障（事故，如实入档）**

`logs/w4-1-*`：`helmpi_phase start id=api` ✅（playbookId=api 加载成功）、`helmpi_validate_scope` ✅ allow exact；**首次 curl 超时后 bash 服务全故障**（14 连败 `Bash/Service/E_UNEXPECTED`，靶场实测 Lab=True 存活）；模型**拒绝伪造**、报空 E-id、phase 门真实拦截非法推进（`scope→scope: not_allowed_next` = **I11 真机拦截实录**）；`W4_2_EXIT` 前轮 exit0、STDERR=0。

### attempt 2 — **成功全链（`W4_2_EXIT=0`）**

- **双 FLAG**：`FLAG{idor_user2}` + `FLAG{api_chain_ok}`（完整利用链：/health → IDOR → 伪造无签 admin token → /admin/config）
- **E-001..E-006 六个证据文件物理落盘**（`evidence/`）+ `record_finding` 引用
- **api playbook 真机全链**：status JSON = `{playbookId:"api", phaseId:"report", satisfied:[scope_confirmation, authorized_endpoints, endpoint_inventory, auth_surface, authz_matrix, token_trust, chain_proof, impact_statement, final_report]}` —— **9 个 deliverable satisfy，阶段推进到 report**

## 3. 门禁

| 门 | 结果 | 证据 |
|----|------|------|
| L1/L2 | ✅ | STDERR1=STDERR2=0；api playbook/phase/scope 工具真机调用成功 |
| T1 | ✅ | `W4_2_EXIT=0`（attempt1 为宿主故障，不判模型 FAIL，事故单列） |
| T2 | ✅ | 双 FLAG 外部可验 + 9-satisfy status JSON；attempt1 的「拒伪造」是 T2 反面正读 |
| T3/S1 | ✅ | attempt2 `OUTSIDE=0`（全 URL 审计）+ 模型自述仅 18081 |
| T4 | ✅ | E-001..006 ×6 文件在 `evidence/`（stdout E 命中 8 次） |
| I11 | ✅ | attempt1 `not_allowed_next` 真机拦截（bonus，超出 L/T 要求） |
| 协议层 | ✅ | `lint-playbooks LINT_EXIT=0` · `attack-coverage COV_EXIT=0` · `npm run check` → **tests 75/75 + lint 4/4 · CHECK_EXIT=0** |
| §6 token | ✅ | 合计 806347（427888 故障轮 + 378459 成功轮），见 `reports/token-usage.md` |

## 4. 已知局限

- 两轮共享 cwd → token 归因按会话时间戳推定（非 attempt 级隔离）；
- attempt1 的 bash 故障根因未定位（pi 宿主侧 `Bash/Service/E_UNEXPECTED`；lab 存活、stderr 空）—— 重试绕过，非 helm-pi 代码路径；
- MCP 桥仅假服务器集成测试，**未对真实 MCP server 端到端**（hexstrike 依赖未装）；
- 反模式 50 条中 8 条有映射测试 + KNOWN GAPS 显式列出（多 agent 类行因 ADR-001 B 路径 N/A）；
- n=1 成功轮（R 门 n≥3 是 A/B 套件职责，本套件为波次验收）。
