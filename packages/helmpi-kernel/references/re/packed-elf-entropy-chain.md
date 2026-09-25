# Chain: 加壳 ELF 破壳与入口还原

## Scenario
授权实验室收到一个 32/64 位 Linux ELF,`file` 判为 executable 但 `.text` 极小、
整文件熵异常高;需要判断是否加壳并还原可分析入口（不做脱壳后执行）。

## 信号（可复现）
```bash
readelf -S sample.bin | egrep -i 'upx|\.text|\.data'   # 壳区名/异常段
strings -a -n 8 sample.bin | head -40                   # UPX!/壳特征串
python3 - <<'EOF' # 分段熵: 0.9+ 的 .text 或整文件 >7bit/byte 即高熵
import math,collections,sys
d=open(sys.argv[1] if len(sys.argv)>1 else "sample.bin","rb").read()
c=collections.Counter(d); e=-sum(v/len(d)*math.log2(v/len(d)) for v in c.values())
print(f"entropy={e:.2f} bits/byte size={len(d)}")
EOF
```
判定阈值:整文件熵 ≥7.2 或 `.text` 占比 <5% → 进入下一跳;否则**链终止**（干净样本,
记录"无壳"coverage 行）。

## 方法
段结构 → 特征串 → 熵 → 定位壳种类（UPX/自定义 stub）→ 还原点定位（不在线执行样本）。

## 攻击链（每步终点可存证）
1. `readelf -S` 段清单 → 存证: 段名+大小表（E-id）。
2. UPX 特征在 → `upx -l`（列包内文件,只读）→ 失败则人工按壳类型走 stub 分析,记录依据。
3. 找 stub 跳转: 反汇编入口（`objdump -d -j .text | head` 找到 unpack 例程边界）→
   记录 RVA 与特征字节序列（**证据=字节序列本身,可 diff 复现**）。
4. 还原: 静态抽取被压段（提权工具或手工）→ `file`+`readelf -h` 复核架构一致 →
   **不执行还原物**;终点产物=还原样本+复核输出（双 E-id）。
5. 报告行: 壳类型 / 入口 RVA / 还原方式 / 未执行声明（assumption 面）。

## 工具映射
bash（readelf/strings/python3）→ `save_evidence` 落段表与复核输出 → `record_finding`（如壳内
隐藏网络行为线索,走 scope 校验后再验）。
