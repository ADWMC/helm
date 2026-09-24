/** Deterministic task routing — E4. Pure keyword table. */

export interface RouteHit {
	readonly key: string;
	readonly why: string;
	readonly score: number;
}

interface RouteDef {
	readonly key: string;
	readonly kw: readonly string[];
	readonly why: string;
}

const ROUTES: readonly RouteDef[] = [
	{ key: "apk", kw: ["apk", "aab", "dex", "xapk", "安卓", "android", "smali", "manifest"], why: "Android 包样本" },
	{
		key: "jvm",
		kw: ["jar", "forge", "fabric", "mixin", "minecraft", "mod", "des", "加密常量", "字符串解密"],
		why: "JVM/Mod",
	},
	{
		key: "shell",
		kw: ["壳", "加壳", "packer", "upx", "vmp", "vmprotect", "themida", "ollvm", "脱壳"],
		why: "保护器/壳",
	},
	{ key: "crypto", kw: ["xor", "base64", "hex", "aes", "rc4", "解密", "encode", "decode"], why: "编码/加密" },
	{ key: "strings", kw: ["字符串", "string", "url", "ip", "签名串", "特征码"], why: "字符串情报" },
	{ key: "hook", kw: ["frida", "hook", "interceptor", "插桩"], why: "运行时插桩" },
	{ key: "pcap", kw: ["pcap", "抓包", "tcp", "udp", "流量", "packet"], why: "流量捕获" },
	{ key: "har", kw: ["har", "http", "请求", "response", "接口"], why: "HTTP 会话" },
	{ key: "ioc", kw: ["ioc", "c2", "域名", "domain", "hash", "持久化", "persistence"], why: "威胁指标" },
	{ key: "malware", kw: ["恶意", "malware", "病毒", "backdoor", "木马", "yara"], why: "恶意样本" },
	{ key: "llm", kw: ["prompt", "注入", "injection", "llm", "越狱", "jailbreak"], why: "LLM 应用安全" },
	{
		key: "web",
		kw: ["sqli", "xss", "ssrf", "ssti", "xxe", "rce", "lfi", "文件上传", "越权", "idor", "jwt", "渗透", "pentest"],
		why: "Web 攻击面",
	},
	{
		key: "src",
		kw: ["src", "众测", "bug bounty", "漏洞赏金", "hackerone", "补天", "hvv", "挖洞"],
		why: "SRC/众测",
	},
	{
		key: "native",
		kw: ["exploit", "pwn", "提权", "privesc", "rop", "堆溢出", "heap", "elf", "pe"],
		why: "主机/二进制攻击",
	},
	{ key: "evidence", kw: ["报告", "report", "存证", "证据", "case"], why: "取证与报告" },
	{ key: "tree", kw: ["分析", "analyze", "看看", "unknown", "分诊"], why: "分诊决策树" },
];

export function matchRoute(hint: string): RouteHit[] {
	const text = hint.toLowerCase();
	return ROUTES.map((r) => ({
		key: r.key,
		why: r.why,
		score: r.kw.reduce((n, k) => (text.includes(k.toLowerCase()) ? n + 1 : n), 0),
	}))
		.filter((h) => h.score > 0)
		.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

export function renderRoute(hint: string): string {
	const hits = matchRoute(hint);
	if (hits.length === 0) {
		return [
			"PRIMARY: tree — 未命中已知信号，按分诊决策树处理",
			"依据: 关键词无匹配；先读 references/toolbox/decision-tree.md 或 index.md",
			"备选: skill_index 查看全目录",
		].join("\n");
	}
	const primary = hits[0]!;
	const lines = [
		`PRIMARY: ${primary.key} — ${primary.why}`,
		`依据: 命中信号（score=${primary.score}） hint="${hint.trim().slice(0, 60)}"`,
	];
	if (hits.length > 1) {
		lines.push(
			`备选: ${hits
				.slice(1, 4)
				.map((h) => h.key)
				.join(", ")}`,
		);
	}
	lines.push(`建议: read_reference index 或 tool 首件 → 路由到 ${primary.key}`);
	return lines.join("\n");
}
