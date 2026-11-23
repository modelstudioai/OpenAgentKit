import type { ProjectPlan, ResourceDraftDeclaration } from "@openagentkit/sdk/protocol";
import i18n from "i18next";

const RESOURCE_KEYS = {
	agent: "publish.resources.types.agent",
	environment: "publish.resources.types.environment",
	file: "publish.resources.types.file",
	skill: "publish.resources.types.skill",
	memory_store: "publish.resources.types.memory_store",
	vault: "publish.resources.types.vault",
	deployment: "publish.resources.types.deployment",
} as const;
const ACTION_KEYS = {
	create: "publish.resources.actions.create",
	update: "publish.resources.actions.update",
	delete: "publish.resources.actions.delete",
	noop: "publish.resources.actions.noop",
} as const;

/** 危险标记优先于 noop；不能把不一致的计划当作无需发布。 */
export function pendingPublishResources(plan: ProjectPlan) {
	return plan.diff.filter((entry) => entry.action !== "noop" || entry.destructive);
}

export function publishResourceNames(declarations: ResourceDraftDeclaration[]): Record<string, string> {
	const names: Record<string, string> = {};
	for (const item of declarations) {
		const displayName = item.declaration.display_name;
		const name = item.name || (typeof displayName === "string" ? displayName : item.id);
		names[`${item.type}:${item.id}`] = name;
	}
	return names;
}

export function pendingPublishDescription(plan: ProjectPlan, names: Record<string, string>, includeNoop = false) {
	const t = i18n.getFixedT(null, "templates");
	const translateSummary = i18n.getFixedT(null, "templates") as unknown as (
		key: string,
		options?: Record<string, unknown>,
	) => string;
	const changes = includeNoop ? plan.diff : pendingPublishResources(plan);
	const rows = changes.map((entry) => {
		const address = /^([^:/]+)[:/](.+)$/.exec(entry.resource);
		const type = address?.[1] ?? "";
		const id = address?.[2] ?? entry.resource;
		const name = names[`${type}:${id}`] || id;
		const typeLabel = RESOURCE_KEYS[type as keyof typeof RESOURCE_KEYS]
			? t(RESOURCE_KEYS[type as keyof typeof RESOURCE_KEYS])
			: t("publish.resources.fallbackType");
		const action = `${t(ACTION_KEYS[entry.action])}${entry.destructive ? t("publish.resources.destructive") : ""}`;
		const localizedSummary =
			entry.summary_key && i18n.exists(entry.summary_key, { ns: "templates" })
				? translateSummary(entry.summary_key, entry.summary_params)
				: undefined;
		const summary = localizedSummary || entry.summary;
		return (
			t("publish.resources.row", { type: typeLabel, name, action, resource: entry.resource }) +
			(summary ? t("publish.resources.summary", { summary, interpolation: { escapeValue: false } }) : "")
		);
	});
	return `${t("publish.resources.title", { count: changes.length })}\n\n${rows.join("\n\n")}`;
}
