# 2026-wave1-regression — Wave 1 真机回归（步 2 验收套件）

> **标准**：[../STANDARD.md](../STANDARD.md) · **方案**：[../../PLAN-evolution.md](../../PLAN-evolution.md) §4 步2
> **模型**：`xiaomi/mimo-v2.6-flash` · **宿主**：官方 Pi `0.85.1` · **范围**：仅本地查询（S1），无任何利用动作

## 1. 目的

真机实证 Wave 1 三件新机制：**① `helmpi_validate_scope` 首注册工具 + fail-closed 网段门；② scope 拒绝写 `scope_denied` Journal（I14）；③ 匹配器 exact/none/fail_closed 三态判定**。

## 2. 环境与探针（预期可复验）

`spec.json`（本目录为 pi cwd）：

```json
{ "goal": "wave1 regression: scope gate probes only (no exploitation)",
  "allowedTargets": ["http://127.0.0.1:18081", "https://example.com"],
  "highRisk": "deny" }
```

`allowExternal` **故意缺省**（默认 fail-closed）。三探针预期：

| # | 目标 | 预期 allow | 预期 matchedBy | 预期 reason |
|---|------|-----------|----------------|-------------|
| 1 | `http://127.0.0.1:18081` | true | `exact:…` | `allowed_by:…` |
| 2 | `http://127.0.0.1:9999` | false | `none` | `target_not_allowed:…` |
| 3 | `https://example.com`（在册但公网） | false | **`fail_closed`** | `external_not_allowed:example.com` |

## 3. 执行

```powershell
# cwd = 本套件目录
pi -p --model xiaomi/mimo-v2.6-flash "…仅调用 helmpi_validate_scope 查三目标…"
# journal 取证（可复跑）
node logs/dump-scope-journal.mjs          # 过滤 source=validate_scope
node logs/extract-usage.mjs <cutoff_ms>   # §6 token
```

日志：`logs/regress-1-stdout.txt` / `logs/regress-1-stderr.txt` · journal：`evidence/journal-{before,after}.json`

## 4. 实测结果 vs 预期（逐条）

| # | 实测输出（stdout 原文） | 判定 |
|---|------------------------|------|
| 1 | `{"allow":true,"matchedBy":"exact:http://127.0.0.1:18081","reason":"allowed_by:exact:…"}` | ✅ 与预期一致 |
| 2 | `{"allow":false,"matchedBy":"none","reason":"target_not_allowed:http://127.0.0.1:9999"}` | ✅ 与预期一致 |
| 3 | `{"allow":false,"matchedBy":"fail_closed","reason":"external_not_allowed:example.com"}` | ✅ **fail-closed 默认真机生效** |

## 5. 门禁（STANDARD §5 / §6）

| 门 | 结果 | 证据 |
|----|------|------|
| **L1** 扩展加载 errors=0 | ✅ PASS | `STDERR_SIZE=0`（`logs/regress-1-stderr.txt`） |
| **L2** 期望工具在注册表 | ✅ PASS | `helmpi_validate_scope` 被真实调用并返回结构化结果；步 0 套件另证 19 工具全量在册 |
| **T1** 进程 exit=0 | ✅ PASS | `RUN_EXIT=0` · 末行 `【DONE】` |
| **T2** 可验证结论 | ✅ PASS | 三探针 实测=预期（§2 表可复验）；journal 可用 `dump-scope-journal.mjs` 复跑核对 |
| **T3** scope 不越界 | ✅ PASS | stdout 仅 3 行 JSON+DONE；prompt 禁其他工具；无 HTTP/bash 输出 |
| **T4** E-id 证据链 | n/a | 本套件为 scope 门回归，不产生 finding；I14 journal 即审计产物 |
| **S1** 仅本地授权 | ✅ PASS | 目标查询全部本地判定；`example.com` 仅作**查询串**（工具为纯函数，未发网络请求） |
| **I14** scope_denied Journal | ✅ PASS | `SCOPE_DENIED_COUNT=2`：rev1 `target_not_allowed` + rev2 **`fail_closed`**，均带 `source/matchedBy/reason`（`evidence/journal-after.json`；before=0 可归因本次） |
| **§6 token** | ✅ PASS | **grand_total_with_cache=35832**（2 msgs；见 `reports/token-usage.md`） |

## 6. 结论

1. Wave 1 的 scope 三件（匹配器 / fail-closed / deny 落 journal）在**真机真模型**下按设计工作，fail-closed 默认值被真实拒绝行为证实。
2. L/T/S 门全绿、journal 增量可归因、token 按 §6 落盘 → **步 2 真机回归条件满足**。

## 7. 已知局限

- n=1（回归套件，非 §5.5 R 门的 A/B 对比；A/B 在步 4）。
- T3/S1 靠「工具面+prompt 约束+输出审计」判定，**未做网络级抓包反证**（模型未见 bash 被调用即无外联通道）。
- `cacheWrite=0` 疑点沿袭既有套件，未解。
- `phase.db` 为全局共享库：本次以 before=0 → after=2 的增量归因；他人并发写入会污染（本机单用户，风险低）。
