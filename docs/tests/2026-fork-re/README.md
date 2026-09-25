# 2026-fork-re — W4 crackme 真机逆向 suite（WG4.3）

> **标准**：[../STANDARD.md](../STANDARD.md)（R-gate n≥3 · 双时钟 · token 六列 · 报告 md+json）
> **样本授权**：**自建 fixture**（`crackme.c` 随库,授权自证;Session 层 SOW 语义见 PLAN §1.5）——
> 无网络、无文件系统、无子进程;错误输入 exit 2。
> **模型**：`xiaomi/mimo-v2.6-flash` · **宿主**：fork helm bundle · **链**：recon→定位→证据切片→finish(coverage 门)

## 1. 样本

- `crackme.c`：凭据经 **XOR 0x5a** 混淆（11 字节,`strings` 不可直读）——求解必须定位校验例程并解码。
- 构建：`gcc -O0 -o crackme crackme.c`（build 记录见 MANIFEST;sha256 由 runner E-001 固化）。
- 自测：`echo 'helm{re_ok}' | ./crackme` → ACCESS GRANTED;错误输入 → denied exit 2。

## 2. 轮次与命令

```bash
# 镜像协议（ci 用户 + round10 白名单 env）
cd docs/tests/2026-fork-re && node run-re.mjs
```

- **R-gate n=3** 每 attempt：`evidence/attempt-N/E-001..004`（sha/elf/syms/disasm 切片）+ stdout/stderr 落 `logs/`。
- **finish 链（内核真件）**：attempt-1 真实 E 文件 → ledger `recordCoverage`(I19, requireCoverage) +
  真实行作 exact-slice observation → `compileFinish(receipts)`（**completion.ts 零改动复用**,§5.2）→
  `report/report.md` + `report/report.json`（C2 双胞）。
- 产出 `reports/stats.json`（n=3、双时钟、token 五列+grand_total）、`MANIFEST.txt` 刷新、进程退出码留档。

## 3. 实测结果（首轮 2026-09-25）

| 门 | 结果 | 证据 |
|----|------|------|
| **T1 exit=0** | ✅ pass=true | runner 退出 0 |
| **T2 可解结论** | ✅ **flagAll 3/3** | 三轮均输出 `CRED=helm{re_ok}`（解码链真跑） |
| **T3 证据切片** | ✅ evidAll | 每轮 ≥4 个 E-id 文件物理落盘 |
| **finish(coverage)** | ✅ ok | exact-slice grounded + I19 coverage 行（`completion.ts` 零改动） |
| **C 时钟** | ✅ | wallMs median **19,579**（15,105–41,680）;activeMs=wallMs（-p 单发口径,stats 注明） |
| **S token 六列** | ✅ | median **90,175**（76,362–150,501）,五列+grand 入 stats.json |
| **报告双胞** | ✅ | `report/report.md` + `report/report.json` |

## 4. 残余（如实）

- 单样本（XOR 一层）——多层壳/反调试形态的 crackme 泛化未覆盖（W5 crackme 泛化=可选延伸,非波门要求）。
- `file` 命令在镜像缺失 → 使用 readelf 路径（E-002/003 代替,不影响判据）。
