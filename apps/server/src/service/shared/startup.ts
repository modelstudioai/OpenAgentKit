import { Inject, Injectable } from "@nestjs/common";
import { In, IsNull, Not } from "typeorm";
import { KitOperationsEntity } from "../../entity/tables/kit-operations.entity.ts";
import { KitResourceDraftsEntity } from "../../entity/tables/kit-resource-drafts.entity.ts";
import { QuotaPolicyEntity } from "../../entity/tables/quota-policy.entity.ts";
import { StoreDatabase } from "../../store/database.ts";

/** 在监听 HTTP 前恢复中断的业务记录，并应用首次配置的默认额度。 */
@Injectable()
export class StartupService {
	constructor(@Inject(StoreDatabase) private readonly db: StoreDatabase) {}
	async initialize(defaultMonthly?: number): Promise<void> {
		const now = new Date().toISOString();
		await this.db.transaction(async () => {
			await this.db.write(async (manager) => {
				const pending = In(["pending", "running"]);
				await manager.update(
					KitOperationsEntity,
					{ kind: "resourceDraft.publish", status: pending },
					{
						error_details_json: JSON.stringify({
							code: "publication.interrupted",
							phase: "interrupted",
							retryable: false,
							mutation_started: true,
						}),
					},
				);
				await manager.update(
					KitOperationsEntity,
					{ status: pending },
					{
						status: "failed",
						phase: "interrupted",
						error: "服务已重启，操作结果待核对；请检查远端状态后重新计划，不会自动重试",
						updated_at: now,
					},
				);
				await manager.update(
					KitResourceDraftsEntity,
					{ status: "publishing" },
					{ status: "failed", phase: "uncertain", updated_at: now },
				);
			});
			if (defaultMonthly != null) {
				await this.db.insertEntityIfAbsent(QuotaPolicyEntity, { id: 1, monthly_credits: 200 }, ["id"]);
				await this.db.write((manager) =>
					manager.update(
						QuotaPolicyEntity,
						{ id: 1, updated_at: IsNull(), monthly_credits: Not(defaultMonthly) },
						{ monthly_credits: defaultMonthly, updated_at: now, updated_by: "config" },
					),
				);
			}
		});
	}
}
