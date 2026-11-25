import i18n from "i18next";

/**
 * 2026-11-01 固定 Managed Agent 的智能模式与模型目录实际返回的选项。
 * 智能模式在前，普通模型保留接口顺序；来源见 docs/research/2026-11-01-managed-agent-models.md。
 */
export const MANAGED_AGENT_MODELS: readonly { id: string; name: string }[] = [
	{ id: "auto", name: "AUTO" },
	{ id: "balanced", name: "Balanced" },
	{ id: "economy", name: "Economy" },
	{ id: "performance", name: "Performance" },
	{ id: "qwen3.8-max", name: "Qwen3.8-Max" },
	{ id: "qwen3.8-flash", name: "Qwen3.8-Flash" },
	{ id: "qwen3.7-plus", name: "Qwen3.7-Plus" },
	{ id: "qwen3.7-max", name: "Qwen3.7-Max" },
	{ id: "qwen3.6-plus", name: "Qwen3.6-Plus" },
	{ id: "qwen3.6-flash", name: "Qwen3.6-Flash" },
	{ id: "deepseek-v4.1-flash-1017", name: "DeepSeek-V4.1-Flash-1017" },
	{ id: "deepseek-v4.1-flash", name: "DeepSeek-V4.1-Flash" },
	{ id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro" },
	{ id: "deepseek-v4-flash-0731", name: "DeepSeek-V4-Flash-0731" },
	{ id: "kimi-k3", name: "Kimi-K3" },
	{ id: "glm-5.3", name: "GLM-5.3" },
	{ id: "glm-5.2", name: "GLM-5.2" },
	{ id: "glm-5.1", name: "GLM-5.1" },
];

const MODEL_LABEL_KEYS = {
	balanced: "agent.models.balanced",
	economy: "agent.models.economy",
	performance: "agent.models.performance",
} as const;

/** 智能模式名称随界面语言展示；具体模型 ID 保持 Provider 原样。 */
export function managedAgentModelLabel(model: { id: string; name: string }): string {
	const key = MODEL_LABEL_KEYS[model.id as keyof typeof MODEL_LABEL_KEYS];
	return key ? i18n.getFixedT(null, "templates")(key) : model.name;
}
