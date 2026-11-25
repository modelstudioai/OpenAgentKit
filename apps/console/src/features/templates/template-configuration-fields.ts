import i18n from "i18next";
import {
	configList,
	configObject,
	configText,
	versionMcpServers,
	versionToolkits,
} from "./agent-version-configuration.ts";
import { MANAGED_AGENT_MODELS, managedAgentModelLabel } from "./managed-agent-models.ts";
import type { AgentFormDetail } from "./template-agent-form-draft.ts";

/** 创建预览与管理列表共用字段顺序及配置投影。 */
export const AGENT_CONFIGURATION_FIELDS = [
	{ key: "model", label: "fields.model" },
	{ key: "multiagent", label: "fields.multiagent" },
	{ key: "description", label: "fields.description" },
	{ key: "instructions", label: "fields.instructions" },
	{ key: "tools", label: "fields.tools" },
	{ key: "mcp_servers", label: "fields.mcpServers" },
	{ key: "skills", label: "fields.skills" },
] as const;

export function agentConfigurationValues(detail?: AgentFormDetail) {
	const t = i18n.getFixedT(null, "templates");
	const config = detail?.configuration ?? {};
	const fields = configObject(config.model);
	const provider = fields.bailian;
	const model = configText(
		fields.name ?? fields.id ?? configObject(provider).name ?? configObject(provider).id ?? provider ?? config.model,
	);
	const toolkits = versionToolkits(config.tools).filter((group) => group.kind !== "mcp");
	const managed = MANAGED_AGENT_MODELS.find((option) => option.id === model);
	return {
		model: (managed ? managedAgentModelLabel(managed) : model) || t("common.notSelected"),
		multiagent:
			configObject(config.multiagent).type === "coordinator" ? t("configuration.enabled") : t("configuration.disabled"),
		description: detail?.description || "—",
		instructions: config.instructions || "—",
		tools: [
			...new Set(
				toolkits.flatMap((group) => group.tools.filter((tool) => tool.enabled !== false).map((tool) => tool.name)),
			),
		],
		mcp_servers: [...new Set(versionMcpServers(config.mcp_servers, config.tools).map((server) => server.name))],
		skills: [
			...new Set(
				configList(config.skills).flatMap((value) => {
					const skill = configObject(value);
					const name = configText(
						skill.name ?? skill.skill_name ?? skill.skillName ?? skill.skill_id ?? skill.id ?? value,
					);
					return name ? [name] : [];
				}),
			),
		],
	};
}

export type AgentConfigurationKey = (typeof AGENT_CONFIGURATION_FIELDS)[number]["key"];

export function agentConfigurationText(detail: AgentFormDetail, key: AgentConfigurationKey) {
	const t = i18n.getFixedT(null, "templates");
	const value = agentConfigurationValues(detail)[key];
	return Array.isArray(value)
		? value.join("\n") || (key === "skills" ? t("common.notSelected") : t("common.notConfigured"))
		: value;
}
