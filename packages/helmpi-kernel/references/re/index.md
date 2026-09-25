# RE 知识包（W4-T01 · 逆向/固件/协议域）

> 按需读,不进 system prompt（E5/P3）。每链遵守 open-reverselab 范式的**自有改写**:
> Scenario → 信号 → 方法 → 攻击链 → 工具映射;**不可执行的步骤不进本知识包**——
> 每条信号必须可复现,每条链必须终点落到工具与可存证产物（evidence E-id / 报告行）。

- `packed-elf-entropy-chain.md` — 加壳 ELF 破壳与入口还原链 · Use when: 样本 sections 异常/高熵 · **不用于**: 已确认无壳脚本类 · kw: packer entropy upx entry
- `elf-weakcrypto-chain.md` — 二进制弱密码学误用链 · Use when: 需判定 ECB/硬编码盐/弱哈希 · **不用于**: 协议层在线解密 · kw: crypto ecb des hardcoded salt
- `firmware-extraction-chain.md` — 固件镜像解包与凭据发现链 · Use when: 固件 bin/rom 样本 · **不用于**: 运行中设备抓取 · kw: firmware uboot busybox passwd
- `protocol-state-replay-chain.md` — 私有协议状态与重放面链 · Use when: 有抓包/自定义端口服务 · **不用于**: 标准 HTTP 面（走 web playbook）· kw: protocol replay state magic
