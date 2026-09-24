/** Input semantic normalizer — map high-friction slang to engineering terms before routing. */

const RULES: Array<[RegExp, string]> = [
	[/外挂|辅助软件/gi, "内存分析与状态评估"],
	[/透视|ESP|视线穿透/gi, "视口变换与深度测试"],
	[/自瞄|aimbot|自动瞄准/gi, "输入向量插值算法"],
	[/绕过检测|过检|绕过/gi, "鉴权逻辑分支分析"],
	[/注入|DLL注入|免杀/gi, "模块映射与内存页管理"],
	[/无后坐力|压枪/gi, "输入轴向补偿衰减"],
	[/反调试|反反调试/gi, "调试器检测与环境分析"],
	[/脱壳|dump/gi, "内存映像重构与导出表修复"],
	[/破解|破解版|注册机|keygen/gi, "license 校验逻辑分析与补丁设计"],
	[/抓包|嗅探/gi, "协议捕获与字段重建"],
	[/提权|getshell|拿权限/gi, "权限边界枚举与路径评估"],
	[/风控|过检测|过盾/gi, "检测规则与对抗样本分析"],
	[/爬虫|批量注册|群发/gi, "自动化请求管线与速率建模"],
];

export function normalizeInput(text: string): string {
	if (typeof text !== "string" || text.length === 0) return text;
	let result = text;
	for (const [pattern, replacement] of RULES) {
		result = result.replace(pattern, replacement);
	}
	return result;
}

export function routingHint(original: string): string {
	return normalizeInput(original);
}
