# 产品 v1.0 终验清单 — §7.3 13/13（WG5.3）

> 逐项 = 判据 + 命令/证据。全绿后本文件 = WG5.3 门证据。
> 生成 2026-09-25 · fork HEAD `f3c366024`（终验复核于 `4cf3b87a6`~`f3c366024` 区间）

| # | 项 | 状态 | 命令 / 证据 |
|---|---|---|---|
| 1 | 从零构建:干净 clone→ci→build→check→test 全 exit0 | ✅ | `/tmp/fresh-helm`（file:// clone）+ **round10 可信配方**:`CI=0 BUILD=0 CHECK=0 TEST=0`,12 workspace 段零失败（`/tmp/r10.log` 同款结构）;**过程如实**:首次裸 env 链遭 clipboard/acme/eager 环境类假败=重演"拼 env"老忌（历史 incident 同类）,配方版即绿——**终验以配方版为准** |
| 2 | 回归底线:测试数≥重定基线 + check(含 lint-playbooks 4项) exit0 | ✅ | 基线"2450 vitest+145 kernel"→现 **2456+ 测试/286 文件（coding-agent 段）+ kernel 157 + scripts 24**;`npm run check` 0;lint-playbooks 4 项于 `playbook-lint.test.ts`（npm test 内,配方段全绿） |
| 3 | 六闸负向矩阵每闸≥1 | ✅ | G1 `g1-prompt`(no-HCOT/强制替换/flush 一发) · G2 `g2-scope-gate`(无 Spec 拒/越界拒+pre-exec journal) · G3 `task.test`(lite 拒)+`tool-surface` · G4 `g4-live`(熔断 block+terminate)+`w3-t04`(永不硬停) · G5 `g5-finish`(复述/截断/缺据三拒) · G6 `g6-report`(退 0/2+双胞) —— 配方段全绿 |
| 4 | 真机渗透 suite:4 实证+R-gate n≥3 | ✅ | `docs/tests/2026-fork-gates`:allPass **5/5**(scope denials=16 phaseOk/真拒改写/live 熔断/lite-full 探针/零菜单)+`stats.json` n=3 median 7722;注入批 n=3 **3/3 零执行** |
| 5 | 真机逆向 suite:hash scope+finish(coverage)+STANDARD | ✅ | `2026-fork-re` pass=true flagAll 3/3 finish(coverage) ok + STANDARD 全项;**样本 hash scope 今日真机复测**:whitelist→`ALLOW_EXIT=0` / 非白名单→`DENY_EXIT=3`（`targetKind=sample_hash` 真 CLI;首测还白送 L2-lint 拒进 2 的真机证） |
| 6 | 统计与预算:n≥3 中位+区间或显式无统计主张;双时钟+六列(除 totalTokens) | ✅ | 各 suite `reports/stats.json`(median/min/max+wallMs==activeMs 口径注明+五列+grand,provider totalTokens 排除);双臂部分=**显式标注**（拍板③口径) |
| 7 | 报告契约:md=json;0/2 各实测;SARIF schema 可解析 | ✅ | 单测+CLI e2e(`helm-commands` 9/9);**今日真机双实测**:clean→`CLEAN_EXIT=0 findings=0` / findings→`FIND_EXIT=2 findings=1` + **`SARIF_PARSE v 2.1.0 results=1`** |
| 8 | 上游 rebase 演练 exit0 | ✅ | 五波 rebase 全记 §8.1;末次=**上游+3 的 89 提交 rebase**(iter0 解毕)+post-rebase 门 **0/0/0/0 @4cf3b87a6** |
| 9 | 许可与安全:LICENSE 合规/`git diff --check` 0/SECRET_HITS=0 | ✅ | `git diff --check`=**0**;tracked 扫描 `sk-/api_key/Bearer`=`**SECRET_HITS=0**`(auth 从未入库,运行时供给);MIT 版权头保留(pi/LICENSE) |
| 10 | 文档单源刷新 | ✅ | 本轮补 **INVARIANTS I20**(合法硬停仅 scope/预算/tripwire)+**I21**(finish exact-slice+receipts 持久化);§8 双仓行 待决策→**已执行(拍板②)**;README 竞品表=T03 落点;P1–P10 于方案自体(P10=无 SDK,mcp-bridge 注释兑现) |
| 11 | W1 四门 WG1.4–1.7 | ✅ | SoL-Pi 默认开(efficiency 53/53) · 配置分离(config-schema+env 更名 HELM_*) · tool-memory(doctor 联调+WG1.6 记录) · i18n(parity+冻结面 WG1.7 断言) —— §8.1 W1 记录+套件绿 |
| 12 | UX+行为实验 | ✅ | WG5.4 六项=`ux-tui.test` 6/6+`run-status`2/2+headline+doctor;WG5.5=`2026-behavior-2x2` 400 跑:敌意✓零菜单✓、**G4 反标 evi_min=4**、EVI 基线+曲线(异象=澄清全0/18 无据跳,如实记) |
| 13 | 破限真机评测在案:≥100 题+双臂拒答对照+越权拦截=100% | ✅(按拍板③口径) | 题库 **105**(负向自检 0 违规) · 双臂对照 `dual-arm-stats.json`(bare 0.879 vs S1 0.824,拒答率列全) · **拦截硬断言=替代证据组**:G2 真机 denials=16+注入 3/3+corpus 自检 0——原"双臂① 100%"按**拍板③(A)**以"预算约束下未评估"关闭(§8.1 留痕);**破限未做不判过**的反向条款满足(题库/口径/对照全在案) |

## 结论

**13/13 全过**（第 13 项按用户拍板③口径,替代证据组齐且原始未评估状态已留痕）。
附:测试总数(配方版)=coding-agent **292 文件段 286 passed/6 skipped**、kernel **157/157**、scripts **24/24** 及 10 个子 workspace 段全绿(见 `fb`/round10 日志结构);大项实测退出码均于本文件逐行留档。
