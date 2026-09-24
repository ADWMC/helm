# 自测包：labs 全关卡（本地 + 模型）

> **标准**：[../STANDARD.md](../STANDARD.md) · **导航**：[../README.md](../README.md)  
> **日期**：2026 · **模型**：`xiaomi/mimo-v2.6-flash` · **范围**：仅 127.0.0.1:18080–18084

---

## 1. 靶场

| 端口 | 名称 | 类型 |
|------|------|------|
| 18080 | VulnCMS | SQLi |
| 18081 | weblab-api | IDOR + admin token |
| 18082 | ctf-webchain | 多步拼 flag + verify |
| 18083 | rev-license | license 算法逆向 |
| 18084 | blue-irlog | 日志 IR |

源码：仓库根 `labs/` + 测试包外 VulnCMS。

---

## 2. 机械求解（`logs/solve_labs.mjs` · `solve-all.json`）

| 靶场 | 结果 |
|------|------|
| cms | **pass** · baseline 401 / probe 200 · `FLAG{helmpi_local_lab_ok}` |
| api | **pass** · IDOR 200 + admin 200 · `FLAG{api_chain_ok}` |
| ctf | **pass** · robots→backup→拼装→verify CORRECT · `FLAG{ctf_8chain}` |
| rev | **pass** · serial `AB-1234-ZX` → lic `0751` → `FLAG{license_reversed}` |
| ir | **pass** · 16 行 · 5×401 爆破 + success + shell + C2 |

**5/5 全部通过。**

---

## 3. 真实模型 + 宿主（Pi 0.85 · 默认 packages 含 helmpi/SoL-Pi）

| 关 | 耗时 | 退出 | 结果 | 证据 |
|----|------|------|------|------|
| **api 18081**（短 prompt） | **25.9s** | 0 | **`FLAG{api_chain_ok}`** | 本轮 `--no-session`，无 E 链；SoL-Pi 报 `requires persistent session`（预期） |
| **ctf 18082** | **79.8s** | 0 | **`FLAG{ctf_8chain}`** + verify CORRECT | **E-002..E-006** · case `./case-ctf` |
| **ir 18084** | **77s** | 0 | 攻击者 `198.51.100.66` 五步链 + IOC | **E-002** · case `cases/st-ir` |
| **rev 18083** | **132s** | 0 | **`FLAG{license_reversed}`** · lic=`0751` | 读本地 `server.py` 算法（合法本地） |

模型输出全文：`logs/*-model-output.md`。  
helmpi 证据拷贝：`evidence/`（CTF/IR 等）。

---

## 4. 结论

1. **机械层**：五靶场可重复通关（含 verify 401 反例）。  
2. **模型层**：四关模型全部 exit 0 并拿到 FLAG/IOC；CTF/IR **带 E 证据链**。  
3. **SoL-Pi**：`--no-session` 时 API 轮出现已知报错；**有 session 的 CTF/IR/rev 无 SoL-Pi Extension error**。  
4. **耗时差异大**（26–132s）符合纪律 7：**不按秒表裁决 harness**；CTF/IR 的价值在链与 E-id，不在最快。  
5. 范围：全程仅本地端口。

## 5. 复现

```powershell
# 靶场
Get-ChildItem labs/*/server.py | % { Start-Process python $_.FullName -WindowStyle Hidden }
python %TEMP%\vulncms\server.py   # 18080 若有

# 机械
node docs/tests/2026-labs-selftest/logs/solve_labs.mjs

# 模型（示例）
pi -p --model xiaomi/mimo-v2.6-flash "…prompt see logs…"
```

## 6. 已知局限

- 模型关为单次，非 n≥3。  
- api 轮用了 `--no-session`（对比 token 表见前一 A/B 套件）。  
- rev 通过读本机源码逆向（本地授权靶场允许）。
