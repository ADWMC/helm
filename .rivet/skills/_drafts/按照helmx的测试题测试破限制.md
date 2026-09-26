---
name: 按照helmx的测试题测试破限制
description: 按照helmx的测试题测试破限制 — verified by 3 checks
triggers: ['auth-gate', 'Routes', 'fixture-evidence', 'null']
---

# 按照helmx的测试题测试破限制

> 自动从会话 20260926 蒸馏的草稿。审核后用 `/skill approve 按照helmx的测试题测试破限制` 入库，或 `/skill reject 按照helmx的测试题测试破限制` 丢弃。

## Steps
1. 阅读 / 搜索：ls packages/helmpi-kernel/scripts/ 2>/dev/null; ec、grep -n "export " packages/helmpi-kernel/src/runti、cat > /tmp/hx-probe.mjs <<'EOF'
const { RecoveryOr
2. 操作：todo
3. 修改：C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\fixtures\auth-gate.json、C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\fixtures\mock-site\Routes.json、C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\fixtures\fixture-evidence.txt
4. 阅读 / 搜索：rm "packages/helmpi-kernel/fixtures/mock-site/Rout
5. 修改：C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\fixtures\mock-site\routes.json
6. 阅读 / 搜索：grep -n "kind: RecoveryKind = \"readonly_diagnosti
7. 修改：C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\src\runtime\recovery.ts
8. 阅读 / 搜索：grep -n "recoveryDenied, {" packages/helmpi-kernel、sed -n '286,300p' packages/helmpi-kernel/src/runti
9. 修改：C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\src\runtime\recovery.ts、C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\scripts\hx-fixture.mjs
10. 阅读 / 搜索：node scripts/hx-fixture.mjs --case all 2>&1 | tail、cat > /tmp/loop-probe.mjs <<'EOF'
import { createS、node scripts/hx-fixture.mjs --case HX-03 --mock-ss
11. 修改：C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\scripts\hx-fixture.mjs
12. 阅读 / 搜索：grep -n "TAIL-NEVER-CONSUMED\|hang: true\|closeAll、node scripts/hx-fixture.mjs --case all 2>&1 | tail
13. 修改：C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\scripts\hx-fixture.mjs
14. 阅读 / 搜索：node scripts/hx-fixture.mjs --case all > /tmp/hx-a、node scripts/hx-fixture.mjs --case HX-01 --dry-run
15. 修改：C:\Users\Administrator\Documents\GitHub\helm\packages\helmpi-kernel\src\runtime\hx-cases.test.ts
16. 验证：node --test --test-concurrency=1 src/runtime/recov、node --test --test-concurrency=1 src/*.test.ts src、node --test src/breach.test.ts 2>&1 | grep -E "^(ℹ
17. 阅读 / 搜索：node scripts/hx-fixture.mjs --case all > /tmp/hx-f
18. 操作：todo

## Verified by
- cd packages/helmpi-kernel && node --test --test-concurrency=1 src/runtime/recovery.test.ts src/runtime/review-gate.test.ts src/runtime/hx-cases.test.ts 2>&1 | grep -E "^(ℹ tests|ℹ pass|ℹ fail|✖)" | he (passed 26)
- cd packages/helmpi-kernel && node --test --test-concurrency=1 src/*.test.ts src/memory/*.test.ts src/guard/*.test.ts src/runtime/*.test.ts 2>&1 | grep -E "^(ℹ tests|ℹ pass|ℹ fail|✖)" | head -6; echo = (passed 222)
- cd packages/helmpi-kernel && node --test src/breach.test.ts 2>&1 | grep -E "^(ℹ tests|ℹ pass|ℹ fail)" && cd /c/Users/Administrator/Documents/GitHub/helm && npm run check > /tmp/check2.log 2>&1; echo " (passed 8)

<!-- skill-draft-key: 48b4237eace3 -->
<!-- source-session: 20260926 -->
