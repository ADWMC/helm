---
name: sample-intake
description: Deterministic sample intake and triage for binaries, APKs, firmware, PCAP and other analysis targets — run the triage command set first, then load only the knowledge files the signals point to. Use when a task starts with a sample/target or the domain is unclear. Do not use for follow-up questions inside a domain already in progress.
---

# 样本分诊（Sample Intake）

目标：**先算，再读，再动手**。拿到样本的第一件事是跑确定性分诊拿到信号，由信号决定读哪几篇、用什么工具、存什么证 —— 不靠"看着像"下手。本技能只给**坐标**，不给结论；结论由工具输出支撑。

## 0. 四问（缺材料就出采集计划，不假装分析）

1. 目标：要回答什么问题（破解校验 / 提取配置 / 找 IOC / 复现协议 …）？
2. 动作：允许做什么（静态读 / 沙箱跑 / 打补丁 …）？
3. 材料：样本在哪、配套有没有（PCAP、日志、固件、App）？
4. 结果：交付物是什么形态（报告 / 补丁 / 解密脚本 / 复现步骤）？

材料缺失时先写采集清单，**不开始分析**。

## 1. 分诊命令（确定性，逐条跑，每条留命令 + 退出码）

```bash
# ① 类型与元数据
file SAMPLE 2>/dev/null || python -c "d=open('SAMPLE','rb').read(16); print(d[:8].hex(), d[:4])"
ls -l SAMPLE

# ② 指纹（存证第一项）
sha256sum SAMPLE        # Windows: Get-FileHash SAMPLE -Algorithm SHA256

# ③ 字符串两面
strings -a -n 8 SAMPLE | head -60 > strings-ascii.txt
strings -el -n 8 SAMPLE | head -60 > strings-utf16.txt     # PE 常见 UTF-16LE

# ④ 段/节 + 逐段熵（加壳第一信号）
python - <<'PY'
import math, sys
d = open('SAMPLE','rb').read()
def H(b):
    if not b: return 0.0
    from collections import Counter
    c, n = Counter(b), len(b)
    return -sum((v/n) * math.log2(v/n) for v in c.values())
print(f"whole: {H(d):.2f}  size={len(d)}")
PY
readelf -S SAMPLE 2>/dev/null || objdump -h SAMPLE 2>/dev/null || python -c "import pefile; [print(s.Name.rstrip(b'\0').decode(), hex(s.Misc_VirtualSize), s.SizeOfRawData) for s in pefile.PE('SAMPLE').sections]"

# ⑤ 壳/保护器签名（命中即定信号）
strings -a SAMPLE | grep -iE 'UPX!|UPX0|UPX1|\.vmp|VMProtect|Themida|WinLicense|OLLVM|UPX_BySpra|TUSI-Obfus' | head
```

命中壳/保护器信号后：**2–3 步内定保护类型**（签名 → 熵 → 结构），再决定策略；不在注定失败的静态路线上反复试。

## 2. 信号 → 坐标（只在命中该信号时读对应文件，`read_reference` 按需）

| 信号 | 读这几篇（references/ 下） | 存证格式 |
|---|---|---|
| 未知样本 / 域不明 | `toolbox/decision-tree.md` → `toolbox/methodology.md` | 分诊表（类型/信号/去向） |
| 壳 / packer / OEP | `native/protection-detection-methodology.md` → `native/packer-handling.md` → `re/packed-elf-entropy-chain.md` | 段名+逐段熵+签名串+入口点 |
| PE（Windows）样本 | `malware/malware-static-playbook-pe.md` → `native/native-casebook.md` | 头/节/导入/资源/签名 |
| ELF / Mach-O | `malware/malware-static-playbook-elf-macho.md` | 同上（对应格式） |
| APK / Android | `android/mobile-methodology.md` → `malware/malware-static-playbook-apk.md` | manifest/权限/DEX/native 清单 |
| Office / 脚本马 | `malware/malware-static-playbook-office-script.md` | 宏/脚本原文+落地行为 |
| 恶意样本通法 | `malware/malware-analysis-methodology.md` → `malware/malware-case-workflow.md` | 家族判定+IOC |
| IOC / C2 / 持久化 | `malware/malware-analysis-methodology.md` | hash/domain/ip/mutex/注册表 |
| 弱加密 / XOR / RC4 | `native/crypto-analysis-methodology.md` → `re/elf-weakcrypto-chain.md` | 算法+密钥+明文 |
| License / 校验绕过 | `native/license-bypass-workflow.md` → `native/memory-patchcode-bypass.md` | 校验点枚举+补丁+冷热启动对比 |
| 反调试 / 反分析 | `native/anti-debug-methodology.md` | 反调试手段+绕过验证 |
| ARM64 | `native/arm64-reverse-methodology.md` | 函数/xrefs/调用链 |
| 固件 | `native/firmware-analysis-methodology.md` → `re/firmware-extraction-chain.md` | 文件系统+凭据+服务 |
| 协议 / PCAP | `protocol/protocol-reverse-methodology.md` → `re/protocol-state-replay-chain.md` | 报文序列+状态机+重放证据 |
| 游戏 / 反作弊 / 内存 | `native/game-security-methodology.md` | 结构体/偏移/指针链 |
| Web / API | `web/web-methodology.md`（API 面：`web/api-recon-and-docs.md`） | 请求/响应+影响 |
| LLM / 提示注入 | `ai-security/llm-injection-playbook.md` | 载荷+命中证据 |
| 证据与报告 | `evidence/workflow.md` → `evidence/reporting.md` → `evidence/finding-schema-severity.md` | E 编号+置信度 |
| 工具缺失 | `toolbox/tool-install.md` → `toolbox/tool-matrix.md` | 装了哪个版本+路径 |
| 需要出网 | `toolbox/network-egress.md`（**不改变授权边界**） | 代理/直连选择与结果 |

分工边界：**方法论层是建议**（模型自主判断是否适用）；**范围与预算由 Spec 与闸门说话**（越界即拒，不要绕）。

## 3. 落 case（分诊结论必须落盘，否则等于没做）

- 建案（`begin_case`）→ 把 ① 四问、② 命令输出（含退出码）、③ 命中信号与坐标表进 evidence（`save_evidence`）。
- 结论只有两类：**已验证事实**（有命令输出）与**推断**（标置信度）。拿不出信号的写 `unverified`。
- 严禁把"一条字符串 / 一行日志 / 自动反编译产物"当作已确认调用链。

## 4. 六阶段（分诊之后按此推进，每阶段末给编号化下一步）

| 阶段 | 出口交付物（缺证据不准进下一阶段） |
|---|---|
| Intake 分诊 | 四问答案 + 分诊表 + 指纹 |
| Triage 分析 | 类型/熵/字符串/导入/壳/架构/风险面 |
| Report 报告 | 带证据/置信度/未知项/下一步的简洁报告 |
| Reverse 逆向 | 针对选定目标的静态/动态结论 + 复现命令 |
| Vulnerability 研判 | 候选弱点+根因+影响面+可达性+复现证据 |
| Decision 决策点 | 3–6 个可执行下一步（编号） |

## 5. 反理性化（负触发清单，命中就要停下来改做法）

| 借口 | 为什么错 | 必须做 |
|---|---|---|
| "先快速看一眼" | 跳基线 = 漏回归 | 先跑 §1 分诊三件套 |
| "我知道这个壳" | 自定义/更新版会打破假设 | 先验保护类型再选策略 |
| "静态够了" | 加壳/混淆隐藏行为 | 高熵或无字符串 → 升级动态分析 |
| "改一处就行" | 校验点常多处存在 | 枚举全部校验点再打补丁 |
| "口头解释下" | 没有产出 = 结论丢失 | 落报告或落产物 |

- dump 必须校验 headers/mappings/imports/符号，并用消费工具验证后才算有效；
- 补丁必须 baseline + 冷启动 + 热启动 + 重复运行对比后才算稳定；
- 证据缺失时说明**最小下一步取什么**，不补造结论。
