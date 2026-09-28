# helm-pi references 总索引

> 知识按需读，不注入 system prompt（E5/P3）。**每行 = 发现信号**：做什么 · Use when · 不用于（负触发）· 关键词 —— Anthropic-Skills「description 是唯一发现信号」规范。命中再展开正文。

- `playbooks/api.yaml` — API/IDOR/鉴权链阶段门 · Use when: REST/IDOR/token 链任务 · **不用于**: 二进制（→reverse）、IR（→blue-ir） · kw: IDOR token authz api
- `playbooks/web-pentest.yaml` — Web 渗透阶段门（scope→recon→enum→test→exploit→verify→report→close）· Use when: HTTP 面授权测试 · **不用于**: 纯 API 任务（→api.yaml） · kw: web sqli xss http
- `playbooks/ctf.yaml` — CTF 多步拼 flag 阶段门 · Use when: 靶机打 flag · **不用于**: 报告型审计 · kw: ctf flag chain
- `playbooks/reverse.yaml` — 逆向分析阶段门 · Use when: 样本/二进制研判 · kw: reverse entropy packer
- `attack-coverage.md` — **生成文件**：playbook × ATT&CK 技术覆盖表 · Use when: 查技术映射 · **不用于**: 手改（单源=各 YAML `attack:` 字段）
- `attack-navigator.json` — ATT&CK Navigator layer（生成）· Use when: 导入 Navigator 可视化覆盖
- `agentic-sec-radar.md` — agentic 安全**技术雷达**（7 个未覆盖方向）· Use when: 选型/新机制调研 · **不用于**: 运行时注入、系统提示、Agent 指令（雷达≠知识） · kw: radar mcp receipt sandbox anti-pattern

## 通用入口

- [toolbox/decision-tree.md](toolbox/decision-tree.md) — 分诊决策树 · Use when: 拿到未知样本/任务，先分类再深入 · **不用于**: 已明确领域（直接进该域索引） · kw: triage decision route
- [toolbox/methodology.md](toolbox/methodology.md) — 通用分析方法论：标准流程与工具选择 · Use when: 需要方法而非速查 · kw: methodology workflow
- [toolbox/patterns.md](toolbox/patterns.md) — 保护器签名、反分析技术、Patch 模式速查 · Use when: 识别壳/反调试 · **不用于**: 脱壳实操（→native/packer-handling） · kw: packer signature anti-debug patch
- [toolbox/tool-install.md](toolbox/tool-install.md) — 工具安装、环境配置与验证 · Use when: 工具缺失或环境报错 · kw: install setup verify
- [toolbox/network-egress.md](toolbox/network-egress.md) — 出站通道：本机代理发现与直连回退 · Use when: 网络请求需走代理 · **不用于**: 绕 scope 门（代理不改变授权边界） · kw: proxy egress
- [toolbox/tool-matrix.md](toolbox/tool-matrix.md) — 按任务推荐工具的矩阵 · Use when: 选工具 · kw: tool matrix
- [evidence/reporting.md](evidence/reporting.md) — 证据链与报告输出模板 · Use when: 要写报告/留证据 · kw: report evidence template
- [evidence/workflow.md](evidence/workflow.md) — Case 工作区与证据编号流程 · Use when: 建 case/维护 E 编号 · kw: case evidence workflow
- [evidence/vulnerability-review.md](evidence/vulnerability-review.md) — 漏洞研判与定级 · Use when: 判断漏洞真伪与严重度 · kw: vuln severity review
- [evidence/finding-schema-severity.md](evidence/finding-schema-severity.md) — finding schema 与严重度标尺 · Use when: 结构化 finding · kw: finding schema
- [evidence/vuln-kb-schema.md](evidence/vuln-kb-schema.md) — 漏洞知识库 schema · Use when: 建漏洞条目 · kw: vuln kb
- [evidence/pentest-report-template.md](evidence/pentest-report-template.md) — 渗透报告模板 · Use when: 出正式报告 · kw: report template

## 垂直领域入口

各域先读 `index.md`，再选具体文档。

- [native/index.md](native/index.md) — **Native 二进制域入口**（PE/ELF/Mach-O、脱壳、反混淆、PWN、Hook、Patch、固件、密码分析）· Use when: 样本是二进制/固件 · **不用于**: 纯源码审计（→web/protocol） · kw: native pe elf macho packer pwn hook
- [web/index.md](web/index.md) — **Web 安全域入口**（API 授权、注入、SSO/OAuth/JWT/SAML、缓存、文件上传、请求走私）· Use when: HTTP 面 · **不用于**: 二进制（→native） · kw: web api injection oauth saml
- [android/index.md](android/index.md) — **Android 逆向域入口**（APK 脱壳、Frida、MITM、Root 模块）· Use when: APK/移动端 · **不用于**: 纯 native .so（→native） · kw: apk android frida mitm
- [ai-security/index.md](ai-security/index.md) — **AI 安全域入口**（Prompt 注入、越狱、H-CoT、模型防御画像、载体构造、**意图澄清 / 上下文优化 / 记忆管理**）· Use when: LLM/Agent 安全 · **不用于**: 传统 Web 注入（→web） · kw: prompt injection jailbreak llm agent intent clarification context memory
- [malware/index.md](malware/index.md) — **恶意代码域入口**（静态分析 playbook、隐写）· Use when: 样本研判/IOC · **不用于**: 加壳脱壳实操（→native） · kw: malware ioc static playbook
- [protocol/index.md](protocol/index.md) — **网络协议域入口**（协议逆向、命名解析投毒、常见服务未授权、依赖混淆）· Use when: pcap/私有协议/服务面 · **不用于**: Web 应用层（→web） · kw: protocol pcap websocket smuggling
- [evidence/index.md](evidence/index.md) — **证据与报告域入口**（Case 管理、finding schema、报告模板）· Use when: 要落地证据或报告 · kw: evidence case report

- [re/index.md](re/index.md) — **RE 领域入口**（破壳/弱加密/固件/协议重放 4 条可执行链索引）· Use when: 逆向样本/固件/私有协议域 · **不用于**: Web 面（→web-pentest.yaml） · kw: reverse re packer firmware protocol replay

## 既有语料（helm 原有）

- [re/elf-weakcrypto-chain.md](re/elf-weakcrypto-chain.md) — ELF 弱加密链 · Use when: 二进制里发现弱加密 · kw: elf crypto weak
- [re/firmware-extraction-chain.md](re/firmware-extraction-chain.md) — 固件提取链 · Use when: 拿到固件镜像 · kw: firmware extraction
- [re/packed-elf-entropy-chain.md](re/packed-elf-entropy-chain.md) — 加壳 ELF 熵分析链 · Use when: 熵异常/疑似加壳 · kw: packer entropy
- [re/protocol-state-replay-chain.md](re/protocol-state-replay-chain.md) — 协议状态重放链 · Use when: 私有协议复现 · kw: protocol replay
- [agentic-sec-radar.md](agentic-sec-radar.md) — Agent 安全态势（7 个未覆盖方向）· Use when: 选型/新机制调研 · **不用于**: 运行时注入（雷达≠知识） · kw: radar mcp receipt sandbox anti-pattern
- [attack-coverage.md](attack-coverage.md) — 攻击面覆盖（playbook × ATT&CK 生成表）· Use when: 查技术映射 · **不用于**: 手改（单源=各 YAML `attack:` 字段）
- `playbooks/*.yaml` — 按场景的 playbook（api / ctf / reverse / web-pentest）
- `attack-navigator.json` — MITRE ATT&CK Navigator 图层（生成）· Use when: 导入 Navigator 可视化覆盖
