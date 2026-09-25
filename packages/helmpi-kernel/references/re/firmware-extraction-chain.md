# Chain: 固件镜像解包与凭据发现

## Scenario
授权样本: 厂商公开固件 bin（squashfs/ubi 常见）。目标=列出文件系统、发现默认凭据与
硬编码服务,**全程本地离线,不碰在线设备**。

## 信号（可复现）
```bash
file firmware.bin                                      # 类型识别
strings -a firmware.bin | egrep -i 'squashfs|ubifs|u-boot' | head   # 文件系统魔数串
python3 -c "d=open('firmware.bin','rb').read(); print(hex(d.find(b'hsqs')))"  # squashfs 头偏移(小端魔数)
```
判定:魔数命中 → 进链;无已知魔数 → 终止（记录"未知容器" coverage,进 stub 分析是另一条链）。

## 方法
魔数定位 → 偏移提取（dd 切片）→ 只读挂载或解包 → 敏感文件面扫描 → 凭据形态归类（**不落原口令值**,
记文件+行号+形态）。

## 攻击链
1. 魔数+偏移 → 存证（偏移可复现=证据）。
2. `dd if=firmware.bin bs=1 skip=<off> of=fs.img && file fs.img` → 证据=`file` 输出。
3. 解包（unsquashfs/7z,环境有则用;无则切片+strings 兜底,并如实记工具缺位）。
4. 扫描: `grep -rniE 'password|passwd|root:' <tree> | head -30` → 归类:
   (a) 默认口令 (b) 凭据哈希 (c) 恢复 shell → 各记 E-id。
5. 服务面: `grep -rniE 'telnetd|dropbear|nc -l' <tree>` → 报告行=暴露服务+启动路径。
6. 报告: 容器类型/偏移/敏感文件清单/形态（无原值）/工具缺位说明。

## 工具映射
bash（file/dd/strings/grep）→ 解包工具（在则用,不在则 fallback 并记录）→ `save_evidence` →
`record_finding`（默认凭据/暴露服务,本地样本无网络 scope 问题）。
