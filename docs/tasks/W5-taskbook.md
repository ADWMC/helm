# W5 任务书：评测与收官
> 上级：docs/PLAN-product.md §6 Wave 5｜状态：未开始｜依赖：W2 波门全绿（W3∥W4 完成后方进 W5 终验）｜证据纪律：§7.1，命令+退出码才算完成，无证标未验证

## 0. 完成定义（DoD）
WG5.1–5.5 全绿 + **§7.3 终验 13/13** + 证据全部归档（§6）+ PLAN §8.1 追加本波记录。判据单源在 L0 §7.2/§7.3，本任务书只引用不复制。

## 1. 目标与范围
一句话：把 W1–W4 的能力用评测、竞品对照、对外呈现、行为实验与 UX 联调收口，七任务全过波门后方可对外称 PentestGPT 类竞品。
- **In**：W5-T01–T07（HackSynth 评测 / 等价性竞品对照 / 对外 README+观测 / SARIF / 进化环 / 预算行为实验 / Run 状态 TUI+UX）。
- **Out（显式）**：Web UI（§5.3 明确不做）；mid-token 流中闸与 hashline 编辑（评分 #2/#4，均 P2）；KDL 模型策略树（#6 已拒绝，仅留表驱动原则）；swarm 并行与 A″ 进程级分发（§6 远期不排期）。

## 2. 前置条件
- 上游状态：WG2.1–2.3 全绿方可开工；WG5.3 终验须待 W3∥W4 完成（渗透/逆向真机项分别依赖 WG3.3/WG4.3，W1 四门项依赖 WG1.4–1.7）。
- 环境：local labs（127.0.0.1:18080-18084）在案；`reference/repos/{HackSynth,studentbench,SkillOpt,oh-my-pi,BoxPwnr}` 已拉取；R-gate/双时钟/冻结预算口径按 `docs/tests/STANDARD.md` §5.5/§5.6。
- 拍板已定（2026-09）：①**跑测总额度 = 300 万 tokens 总冻结**（W5+破限双臂+HackSynth 全含,执行前写入 Spec 冻结,单任务超支即停）。（SARIF 已由 L0 澄清=§7.3 第7项）

## 3. 任务分解
### W5-T01 HackSynth 子集评测
- **文件锚**：`reference/repos/HackSynth/README.md:17-18`（200 题库）；`docs/tests/STANDARD.md`（R-gate/六列）；§6 任务1、§7.2 WG5.1。
- **步骤 checklist**：
  - [ ] 接入题库为回归评测层，先固定 ≥20 题起步子集（抽样清单入档，不与 labs 混池）
  - [ ] 真机跑评测：R-gate n≥3；做不到的题标「方向性」
  - [ ] 报告出数：token 六列 + wall/active 双时钟 + stats.json；全数字 --verify 复核（#9③）
- **产出**：评测报告 + stats.json（≥20 题出数）。 **关联 WG**：WG5.1。

### W5-T02 竞品对照与等价性声明框架
- **文件锚**：§1.1 对照表（转对外版）；§2.7 #9 判定（`studentbench/README.md:27,55`）；`BoxPwnr/README.md:13`（traces 回放思想）；§7.2 WG5.2。
- **步骤 checklist**：
  - [ ] 同一 labs/基准实测我方 vs 竞品公开 trace 方法学，逐格记录证据（file:line 或实测数据）
  - [ ] 头条结论改等价性框架：「等价质量（equivalence test）× N 倍成本」，成本口径 = cost-per-verified-finding（#9①②）
  - [ ] 无证据格一律标「未验证」；对照数据全数复核
- **产出**：竞品对照记录 + 等价性/成本口径说明（供 T03 落表）。 **关联 WG**：WG5.2。

### W5-T03 对外 README 与观测呈现
- **文件锚**：fork 根 `README.md`；§1.1（表源）、§1.5③（exit 0/2 语义）、§2.6.1 #5（`oh-my-pi/README.md:490`，只借布局不引包）；§7.2 WG5.2。
- **步骤 checklist**：
  - [ ] README 落三块：竞品表（引用 T02 逐格证据/未验证标记）+ quickstart + exit code 语义
  - [ ] token 六列报表对齐 omp stats 布局与指标口径（本地盘+BPE 计数呈现，零新依赖）
  - [ ] 自检：每格 file:line 或实测，缺则未验证
- **产出**：对外 README（竞品表即 WG5.2 证据落点）。 **关联 WG**：WG5.2（并为 WG5.4④ 头条供数）。

### W5-T04 G6 SARIF 输出
- **文件锚**：`packages/helmpi-kernel/src/export.ts`、`helm report --sarif`（§1.5 命令面）；§4.1 G6 行（借 strix/swarm 模式）；§6 任务4+交付物。
- **步骤 checklist**：
  - [ ] SARIF 输出：findings 映射规则，md+json+SARIF 字段一致性断言
  - [ ] exit code 回归（findings→2 / clean→0）附样本
- **产出**：SARIF 样本 1 份 + 一致性断言输出。 **关联 WG**：判据=**§7.3 第7项（SARIF schema 校验可解析）**,经 WG5.3 的 13/13 验收；L0 已澄清（原"待澄清"作废）。

### W5-T05 方法论进化环（SkillOpt 离线，dev-time only）
- **文件锚**：`reference/repos/SkillOpt/README.md:18,32-39`（sleep 环 / 有界编辑+拒绝缓冲+文本学习率预算）；§6 任务5；§1.6 机制⑤（en 规范本）；G1 prompt 库 / playbook。
- **步骤 checklist**：
  - [ ] harvest：从 ledger/journal 抽运行教训成候选编辑
  - [ ] replay：local labs 重放；held-out 门 = WG 套件（replay 与门分离，防泄漏）
  - [ ] consolidate：仅过门候选以有界编辑进 G1 prompt 库/playbook，拒绝入缓冲；产物保持 300-2000 token 紧凑形态（en 规范本）
  - [ ] 负向确认：部署产物零运行时改动（不碰模型防御层红线）
- **产出**：一次完整 harvest→consolidate 的 journal + 变更记录。 **关联 WG**：held-out=WG 套件（consolidate 后套件须仍全绿）；本体无独立 §7.2 行，锚 #10 判定。

### W5-T06 预算压力行为实验（Tool-Lab 2×2）
- **文件锚**：§2.7 #11 判定、§2.7.1 L6、§4 G4（EVI 子集+justification）、§6 任务6；§7.2 WG5.5。
- **步骤 checklist**：
  - [ ] 2×2（token 成本 × Spec 特异性）在 local labs 复刻：schema 校验 rollout、逐属性省略计数
  - [ ] 每格 n≥100（预算冻结+分批跑；主套件另按 R-gate n≥3 口径单报）
  - [ ] EVI/Expectimax 规范基线并跑；LLM 侧剂量-反应曲线自测填补（论文未见）
  - [ ] 曲线反标 G4 下限参数；L6 澄清阻断 + 信息面敌意场景（拆分诊断面）断言不被诱导跳步
- **产出**：实验 stats.json + 剂量曲线图 + G4 参数反标记录。 **关联 WG**：WG5.5。

### W5-T07 Run 状态 TUI + UX 联调
- **文件锚**：§1.5 五块、§1.6（i18n）、`helmpi-kernel/i18n/{en,zh-CN}.json`；§7.2 WG5.4。
- **步骤 checklist**：
  - [ ] ① `helm --help`/子命令全量可发现，`helmpi` 别名等价
  - [ ] ② `helm doctor` 探测 → 写 tool-memory 联调成功
  - [ ] ③ Run 状态渲染：阶段门 + 预算六列 + `instead:` 行（只读不打断）
  - [ ] ④ 报告 md 头条 cost-per-verified-finding
  - [ ] ⑤ Run 层全程无编号菜单（负向，与 WG2.2 联动）
  - [ ] ⑥ `locale=zh-CN`：TUI 事件行/帮助中文 + CJK 宽度正确；json/exit 仍 en
- **产出**：UX 截图/输出留档 + suite 断言。 **关联 WG**：WG5.4（6/6）。

## 4. 波门验收（单源 L0 §7.2，此处仅摘要引用）
- **WG5.1** HackSynth 子集 ≥20 题出数，n≥3 或标方向性 → T01。
- **WG5.2** 竞品表每格证据、无则标未验证 → T02+T03。
**- WG5.3** §7.3 终验 13/13 → **等待判据**：依赖上游 WG 的跨波项在上游未绿期间挂「等待」——不计失败、不提前勾选；W3∥W4 全绿后按 §7.3 原文逐项重跑一次取终态。
- **WG5.4** UX 契约 6/6 → T07。
- **WG5.5** 行为实验：每格 n≥100 或标规模、G4 反标、敌意负向过 → T06。

## 5. 风险与回滚
1. **HackSynth 题库与 labs 分布偏差**：结论一律标方向性（WG5.1 允许口径），附 labs 同题型对照，不外推绝对数。
2. ~~SARIF 口径不一~~ → **L0 已裁决**：W5 必交；§1.1 旧标 P2 已纠正、判据补入 §7.3 第7项（原"待澄清"作废）。
3. **行为实验成本**：n≥100/格 token 预算先冻结再分批跑（§7.4 冻结预算/双时钟），小批估单价后放大。
4. **进化环 held-out 泄漏**：replay 用 labs、门用 WG 套件，二者分离；consolidate 必须过门，未过门进拒绝缓冲不改 prompt；en 规范本防双语双训练目标。
5. **终验 13 项跨波依赖**：等待判据见 §4（WG5.3 行），W3/W4 未完不得以「未跑」判过、也不得提前勾选。
**回滚**：W5 直改上游文件 = 0（§3.6.5）；一逻辑一提交，T02/T03/T04/T05/T06 各自独立可 revert；consolidate 引入退化 → 回退该次变更（缓冲留痕）；rebase 粒度按 §3.6.4。

## 6. 证据清单（归档根：`docs/evidence/w5/`）
- 评测报告 + stats.json + 剂量曲线图（T01/T06）
- README 竞品表（fork 根 `README.md`，即 WG5.2 落点）
- SARIF 样本 + 字段一致性输出（T04）
- 进化环一次完整 harvest→consolidate 的 journal + 变更记录（T05）
- UX 截图/输出留档 + suite 断言（T07）
- §7.3 终验 13 项 checklist（逐项命令+退出码，WG5.3）
