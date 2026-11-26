import { Inject, Injectable } from "@nestjs/common";
import { AgentDetailSchema, AgentSummarySchema, KitError } from "@openagentkit/sdk/protocol";
import type { ProviderGateway } from "../../gateway/types.ts";
import { KIT_PROVIDER_GATEWAY } from "../../utils/injection-tokens.ts";
import { CatalogService } from "../shared/catalog.ts";

@Injectable()
export class StaffCatalogService {
	constructor(
		@Inject(CatalogService) private readonly catalog: CatalogService,
		@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway,
	) {}

	async listPublished() {
		return (await this.catalog.listed()).map((entry) => AgentSummarySchema.parse(entry));
	}

	async requirePublished(slug: string) {
		const entry = await this.catalog.getBySlug(slug);
		if (entry?.status !== "listed") throw new KitError("not_found", "agent 不存在或未上架");
		return entry;
	}

	async publishedDetail(slug: string) {
		const entry = await this.requirePublished(slug);
		// 目录原始记忆配置不公开，网关只返回名称和描述。
		const { memory_stores: catalogMemories, ...catalogEntry } = entry;
		const detail = AgentDetailSchema.parse(catalogEntry);
		const { gateway } = this;
		try {
			const resources = await gateway.getRemoteAgentResources(entry.remote_agent_id);
			if (resources) detail.resources = resources;
		} catch {
			// 远端读取失败时，资源面板按缺省渲染。
		}
		if (catalogMemories?.length) {
			try {
				detail.memory_stores = await gateway.getAgentMemoryStores(catalogMemories);
			} catch {
				// 远端读取失败时省略记忆库。
			}
		}
		return detail;
	}

	async matchingSlugs(query: string) {
		const search = query.toLowerCase();
		return (await this.catalog.list())
			.filter((agent) => agent.slug.toLowerCase().includes(search) || agent.display_name.toLowerCase().includes(search))
			.map((agent) => agent.slug);
	}
}
