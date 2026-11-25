import i18n from "i18next";

export type AgentCopyIssue = { field: string; reason: string };
type ValidationIssue = { path: PropertyKey[]; code: string };

export class AgentCopyError extends Error {
	constructor(readonly issues: AgentCopyIssue[]) {
		super(i18n.getFixedT(null, "templates")("agent.copy.errorTitle"));
	}
}

export function rejectAgentCopy(field: string, reason: string): never {
	throw new AgentCopyError([{ field, reason }]);
}

// 路径仅保留已知 Schema 字段和数组下标，不回显动态键或校验错误中的配置值。
const fieldNames = new Set([
	"builtin",
	"default_permission",
	"permissions",
	"mcp",
	"type",
	"mcp_server_name",
	"default_config",
	"configs",
	"name",
	"enabled",
	"skill_id",
	"version",
	"model",
	"id",
	"bailian",
	"instructions",
	"description",
	"tools",
	"skills",
	"mcp_servers",
	"url",
	"server_url",
	"headers",
	"authorization",
	"api_key",
	"token",
	"password",
	"secret",
	"credentials",
	"permission_policy",
	"permissionPolicy",
	"permission",
	"require_approval",
	"requireApproval",
	"defaultConfig",
	"multiagent",
	"agents",
	"agent_id",
]);
export function copyFieldPath(base: string, path: PropertyKey[]) {
	const unknown = i18n.getFixedT(null, "templates")("agent.copy.unknownField");
	return path.reduce<string>((current, key) => {
		if (typeof key === "number") return `${current}[${key}]`;
		return `${current}.${fieldNames.has(String(key)) ? String(key) : `[${unknown}]`}`;
	}, base);
}

function validationReason(issue: ValidationIssue) {
	const t = i18n.getFixedT(null, "templates");
	if (issue.path.at(-1) === "version") return t("agent.copy.skillVersion");
	switch (issue.code) {
		case "invalid_type":
			return t("agent.copy.invalidType");
		case "too_small":
			return t("agent.copy.tooSmall");
		case "too_big":
			return t("agent.copy.tooBig");
		case "invalid_value":
			return t("agent.copy.invalidValue");
		case "unrecognized_keys":
			return t("agent.copy.unrecognizedKeys");
		default:
			return t("agent.copy.invalid");
	}
}

export function parseAgentCopy<T>(
	result: { success: true; data: T } | { success: false; error: { issues: ValidationIssue[] } },
	base: string,
): T {
	if (result.success) return result.data;
	throw new AgentCopyError(
		result.error.issues.map((issue) => ({
			field: copyFieldPath(base, issue.path),
			reason: validationReason(issue),
		})),
	);
}

export function copyBuiltinPermission(entry: Record<string, unknown>, path: string): "allow" | "ask" | undefined {
	const key = ["permission_policy", "permissionPolicy", "permission", "require_approval", "requireApproval"].find(
		(key) => entry[key] != null,
	);
	if (!key) return;
	const t = i18n.getFixedT(null, "templates");
	const value = entry[key];
	const object = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	const policy = object.type ?? value;
	if (["allow", "always_allow", "never"].includes(String(policy))) return "allow";
	if (["ask", "always_ask", "always"].includes(String(policy))) return "ask";
	rejectAgentCopy(`${path}.${key}${object.type == null ? "" : ".type"}`, t("agent.copy.unsupportedPolicy"));
}

export function checkCopyPolicy(entry: Record<string, unknown>, path: string) {
	if (copyBuiltinPermission(entry, path) !== "ask") return;
	const t = i18n.getFixedT(null, "templates");
	const key = ["permission_policy", "permissionPolicy", "permission", "require_approval", "requireApproval"].find(
		(key) => entry[key] != null,
	)!;
	const value = entry[key];
	const hasType = value && typeof value === "object" && "type" in value;
	rejectAgentCopy(`${path}.${key}${hasType ? ".type" : ""}`, t("agent.copy.unsupportedMcpPolicy"));
}

/** 只报告隐藏值的位置；字段标识以外的自由文本键不回显。 */
export function redactedCopyIssues(value: unknown, path = ""): AgentCopyIssue[] {
	const unknown = i18n.getFixedT(null, "templates")("agent.copy.unknownField");
	if (typeof value === "string")
		return value.includes("[redacted]")
			? [{ field: path, reason: i18n.getFixedT(null, "templates")("agent.copy.redacted") }]
			: [];
	if (Array.isArray(value)) return value.flatMap((entry, index) => redactedCopyIssues(entry, `${path}[${index}]`));
	if (!value || typeof value !== "object") return [];
	return Object.entries(value).flatMap(([key, entry]) =>
		redactedCopyIssues(
			entry,
			`${path ? `${path}.` : ""}${/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) ? key : `[${unknown}]`}`,
		),
	);
}

export function copyFieldLabel(field: string) {
	const t = i18n.getFixedT(null, "templates");
	if (field.startsWith("multiagent")) return t("agent.form.multiagent");
	if (field.startsWith("tools")) return t("agent.form.tools");
	if (field.startsWith("skills")) return t("agent.form.skills");
	if (field.startsWith("mcp_servers")) return t("agent.form.mcp");
	if (field.startsWith("instructions")) return t("agent.form.instructions");
	if (field.startsWith("model")) return t("agent.form.model");
	return t("agent.form.baseConfiguration");
}
