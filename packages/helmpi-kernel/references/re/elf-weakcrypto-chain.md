# Chain: 二进制弱密码学误用

## Scenario
授权审计目标二进制（本地样本）需判定密码学误用面:ECB 模式、DES/RC4、硬编码盐/密钥、
自造 HMAC。**只做静态判定,不提取可用于真实系统的密钥材料**。

## 信号（可复现）
```bash
readelf -Ws sample.bin | egrep -i 'EVP_|AES_|DES_|RC4|MD5|SHA1' | head -30  # 弱算法符号
strings -a sample.bin | egrep -i 'aes-128-ecb|des-cbc|Salted__' | head       # 模式串/盐头
python3 -c "import sys; d=open('sample.bin','rb').read(); print(d.count(bytes.fromhex('53616c7465645f5f')))"  # 'Salted__' 计数
```
判定:ECB/DES/RC4/MD5-作为完整性 任一命中 → 进链;全无 → 终止并记 coverage（查过=无）。

## 方法
符号 → 字面串 → 用法点反汇编上下文 → 影响面归类（机密性/完整性/仅混淆）。

## 攻击链
1. 符号表命中清单 → 存证 E-id（`-Ws` 输出片段）。
2. 命中 AES-ECB → 按调用点定位数据粒度（block 型字段=可比对性泄漏）:
   `objdump -d sample.bin | grep -B4 -A6 <call_site>` → 证据=调用点指令序列。
3. 硬编码 8 字节以上密钥材料 → **不输出原值**,报告记"硬编码密钥@<段+偏移>"（偏移可复现）。
4. 自造 MAC/HMAC 命名 → 标 CWE-327/328 类,影响=完整性可伪造 → 记 finding（需 scope 的话走
   本地样本即可,无网络面）。
5. 报告行: 算法清单 / 用法点偏移 / 影响归类 / 未提取声明。

## 工具映射
bash（readelf/objdump/strings/python3）→ `save_evidence`（符号与指令片段）→
`record_finding`（影响归类行）。
