import type { AuditLogsPage, AuditLogsQuery, AuditLogView } from "@openagentkit/sdk/protocol";
import type { StoreDatabase } from "./database.ts";

// 管理端可审计动作：智能体管理、旧目录兼容入口与员工端品牌配置。
const agentActions = [
	"templates.create",
	"templates.update",
	"templates.delete",
	"templates.listing",
	"catalog.create",
	"catalog.update",
	"catalog.delete",
	"catalog.list",
	"catalog.unlist",
	"branding.update",
];
const agentActionSet = new Set(agentActions);
const agentActionFilter = `action IN (${agentActions.map(() => "?").join(", ")})`;

export function createAuditLog(db: StoreDatabase) {
	return {
		async append(input: { subject?: string; action: string; target?: string; detail?: unknown }) {
			if (!agentActionSet.has(input.action)) return;
			await db.run(
				"INSERT INTO kit_audit (at, subject, action, target, detail) VALUES (?,?,?,?,?)",
				new Date().toISOString(),
				input.subject ?? null,
				input.action,
				input.target ?? null,
				input.detail === undefined ? null : JSON.stringify(input.detail),
			);
		},
		async list(options: Partial<AuditLogsQuery> = {}) {
			const limit = options.limit ?? 100;
			return (await db.all(
				"SELECT * FROM kit_audit ORDER BY id DESC LIMIT ? OFFSET ?",
				limit,
				options.offset ?? 0,
			)) as AuditLogView[];
		},
		async page(subject: string, options: AuditLogsQuery): Promise<AuditLogsPage> {
			const { total } = (await db.get(
				`SELECT count(*) AS total FROM kit_audit WHERE subject = ? AND ${agentActionFilter}`,
				subject,
				...agentActions,
			)) as { total: number };
			const data = (await db.all(
				`SELECT * FROM kit_audit WHERE subject = ? AND ${agentActionFilter} ORDER BY id DESC LIMIT ? OFFSET ?`,
				subject,
				...agentActions,
				options.limit,
				options.offset,
			)) as AuditLogView[];
			return { data, total };
		},
	};
}
export type AuditLog = ReturnType<typeof createAuditLog>;
