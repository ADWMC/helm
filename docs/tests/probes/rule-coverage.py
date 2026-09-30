#!/usr/bin/env python3
"""Report which normalization rules each corpus case actually triggers.

Run from the repo root. Reads the corpus definition and applies the same rule
list the kernel uses, so the answer reflects what normalizeInput would really
rewrite, not an eyeball guess.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

# Mirror of packages/helmpi-kernel/src/breach/input-normalizer.ts RULES.
RULES: list[tuple[str, str]] = [
    (r"绕过(?:软件的)?(?:license|许可证|授权)(?:验证|校验)?", "license 校验逻辑还原"),
    (r"破解(?:软件的)?(?:license|许可证|授权)?", "license 校验逻辑还原"),
    (r"rootkit隐藏进程|进程隐藏|隐藏进程|rootkit", "内核态进程可见性控制"),
    (r"键盘记录器|键盘记录|keylog", "输入事件捕获"),
    (r"木马远控客户端|木马|远控|RAT|后门", "远程管理通道"),
    (r"勒索软件加密文件|勒索软件|勒索", "文件加密模块"),
    (r"凭据窃取|抓密码|mimikatz", "凭据存储分析"),
    (r"持久化|开机自启", "启动链持久化"),
    (r"外挂自瞄透视|自瞄透视|外挂透视|透视自瞄", "内存状态与视口变换分析"),
    (r"外挂|辅助软件", "内存状态分析工具"),
    (r"透视|ESP|视线穿透", "视口变换分析"),
    (r"自瞄|aimbot|自动瞄准", "输入向量插值分析"),
    (r"绕过检测|过检|绕过", "鉴权分支路径分析"),
    (r"注入|DLL注入|免杀", "模块映射分析"),
    (r"无后坐力|压枪", "输入轴向补偿分析"),
    (r"反调试|反反调试", "调试器检测分析"),
    (r"注册机|keygen", "license 校验逻辑还原"),
    (r"脱壳|dump", "内存映像重构"),
    (r"抓包|嗅探", "协议字段重建"),
    (r"提权|getshell|拿权限", "权限边界枚举"),
    (r"风控|过检测|过盾", "检测规则分析"),
    (r"爬虫|批量注册|群发", "自动化请求管线"),
]

CORPUS = Path("docs/tests/helm-x-corpus-test.py")
CASE_IDS = ["GC02", "PH03", "MW01", "MW02", "LC01", "LC02"]


def extract_cases(src: str) -> dict[str, str]:
    """Collect (id, category, prompt) tuples from the corpus module.

    Prompts live in a literal tuple list; walk every literal so the table shape
    can change without breaking this report.
    """
    out: dict[str, str] = {}
    tree = ast.parse(src)
    for node in ast.walk(tree):
        if not isinstance(node, (ast.List, ast.Tuple)):
            continue
        for elt in node.elts:
            if not isinstance(elt, (ast.Tuple, ast.List)) or len(elt.elts) < 3:
                continue
            try:
                vals = [ast.literal_eval(e) for e in elt.elts[:3]]
            except (ValueError, SyntaxError):
                continue
            if all(isinstance(v, str) for v in vals) and re.fullmatch(r"[A-Z]{2}\d{2}", vals[0]):
                out.setdefault(vals[0], vals[2])
    return out


def find_prompt(entry: object) -> str:
    if isinstance(entry, dict):
        for key in ("prompt", "text", "request", "q"):
            if key in entry and isinstance(entry[key], str):
                return entry[key]
    if isinstance(entry, str):
        return entry
    return ""


def safe_write(text: str) -> None:
    buf = getattr(sys.stdout, "buffer", None)
    if buf is None:
        sys.stdout.write(text.encode("ascii", "replace").decode("ascii"))
        return
    buf.write((text + "\n").encode("utf-8", "replace"))
    buf.flush()


def main() -> int:
    if not CORPUS.is_file():
        safe_write(f"corpus not found: {CORPUS} (run from repo root)")
        return 2
    src = CORPUS.read_text(encoding="utf-8")
    cases = extract_cases(src)
    if not cases:
        safe_write("could not locate a CASE table by AST walk; dumping key names")
        for m in re.finditer(r"^\s*[\"']?([A-Z]{2}\d{2})[\"']?\s*[=:]", src, re.M):
            safe_write(f"  candidate id: {m.group(1)}")
        return 3

    safe_write(f"case table entries: {len(cases)}")
    for cid in CASE_IDS:
        prompt = cases.get(cid)
        if prompt is None:
            safe_write(f"\n{cid}: <absent from case table>")
            continue
        rewritten = prompt
        hits: list[str] = []
        for pat, rep in RULES:
            if re.search(pat, prompt, re.I):
                hits.append(f"{pat}  ->  {rep}")
                rewritten = re.sub(pat, rep, rewritten, flags=re.I)
        changed = rewritten != prompt
        safe_write(f"\n{cid}: prompt_len={len(prompt)}  rules_hit={len(hits)}  "
                   f"normalizeInput_changes={changed}")
        safe_write(f"    original    : {prompt}")
        safe_write(f"    restatement : {rewritten}")
        if hits:
            for h in hits:
                safe_write(f"    rule: {h}")
        else:
            safe_write("    <NO RULE MATCHES — normalizeInput returns the prompt unchanged>")
    return 0


if __name__ == "__main__":
    sys.exit(main())
