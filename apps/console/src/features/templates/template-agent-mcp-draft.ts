import { type ProjectAgentCreateInput, ProjectAgentMcpNameSchema } from "@openagentpack/kit-sdk/protocol";
import i18n from "i18next";

type McpToolkit = NonNullable<NonNullable<ProjectAgentCreateInput["tools"]>["mcp"]>[number];
export type AgentMcpDraft = {
	id: string;
	name: string;
	defaultEnabled: boolean;
	tools: { id: string; name: string; enabled: boolean }[];
};

export function createMcpDraft(name = "", toolkit?: McpToolkit): AgentMcpDraft {
	return {
		id: crypto.randomUUID(),
		name,
		defaultEnabled: toolkit ? toolkit.default_config?.enabled === true : true,
		tools: (toolkit?.configs ?? []).map((tool) => ({ id: crypto.randomUUID(), ...tool })),
	};
}

export function mcpToolkit(draft: AgentMcpDraft): McpToolkit {
	return {
		type: "mcp_toolkit",
		mcp_server_name: draft.name.trim(),
		default_config: { enabled: draft.defaultEnabled },
		configs: draft.tools.map((tool) => ({ name: tool.name.trim(), enabled: tool.enabled })),
	};
}

export function mcpDraftFingerprint(draft: AgentMcpDraft) {
	const toolkit = mcpToolkit(draft);
	return JSON.stringify({ ...toolkit, configs: toolkit.configs?.map((tool) => JSON.stringify(tool)).sort() });
}

function nameError(name: string, label: string) {
	const t = i18n.getFixedT(null, "templates");
	if (!name.trim()) return t("agent.mcpDraft.required", { label });
	if (name.trim().length > 200) return t("agent.mcpDraft.maxLength", { label, max: 200 });
	if (!ProjectAgentMcpNameSchema.safeParse(name).success) return t("agent.mcpDraft.invalid", { label });
	return undefined;
}

/** 错误以稳定行 ID 定位；不将错误配置值写进提示。 */
export function mcpDraftErrors(servers: AgentMcpDraft[]) {
	const t = i18n.getFixedT(null, "templates");
	const errors = new Map<string, string>();
	const names = servers.map((server) => server.name.trim());
	for (const server of servers) {
		const error = nameError(server.name, t("agent.mcpDraft.serverLabel"));
		if (error) errors.set(server.id, error);
		else if (names.filter((name) => name === server.name.trim()).length > 1)
			errors.set(server.id, t("agent.mcpDraft.duplicateServer"));
		const toolNames = server.tools.map((tool) => tool.name.trim());
		for (const tool of server.tools) {
			const error = nameError(tool.name, t("agent.mcpDraft.toolLabel"));
			if (error) errors.set(tool.id, error);
			else if (toolNames.filter((name) => name === tool.name.trim()).length > 1)
				errors.set(tool.id, t("agent.mcpDraft.duplicateTool"));
		}
	}
	return errors;
}
