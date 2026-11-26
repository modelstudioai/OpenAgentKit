import { Inject, Injectable } from "@nestjs/common";
import type { AuditLogsPage, AuditLogsQuery, AuditLogView } from "@openagentkit/sdk/protocol";
import { In } from "typeorm";
import { KitAuditEntity } from "../../entity/tables/kit-audit.entity.ts";
import { StoreDatabase } from "../../store/database.ts";

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
const storedActions = new Set([...agentActions, "members.oidc.bind", "members.oidc.unbind"]);

@Injectable()
export class AuditService {
	constructor(@Inject(StoreDatabase) private readonly db: StoreDatabase) {}

	async append(input: { subject?: string; action: string; target?: string; detail?: unknown }) {
		if (!storedActions.has(input.action)) return;
		await this.db.write((manager) =>
			manager.insert(KitAuditEntity, {
				at: new Date().toISOString(),
				subject: input.subject ?? null,
				action: input.action,
				target: input.target ?? null,
				detail: input.detail === undefined ? null : JSON.stringify(input.detail),
			}),
		);
	}
	async list(options: Partial<AuditLogsQuery> = {}) {
		return (await this.db.read((manager) =>
			manager.find(KitAuditEntity, {
				order: { id: "DESC" },
				take: options.limit ?? 100,
				skip: options.offset ?? 0,
			}),
		)) as AuditLogView[];
	}
	async page(subject: string, options: AuditLogsQuery): Promise<AuditLogsPage> {
		const [rows, total] = await this.db.read((manager) =>
			manager.findAndCount(KitAuditEntity, {
				where: { subject, action: In(agentActions) },
				order: { id: "DESC" },
				take: options.limit,
				skip: options.offset,
			}),
		);
		return { data: rows as AuditLogView[], total };
	}
}
