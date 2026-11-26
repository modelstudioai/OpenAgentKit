import { Inject, Injectable } from "@nestjs/common";
import {
	KitError,
	type ModelUsageSortBy,
	type RemoteSkillSource,
	type ToolUsageSortBy,
	type UsageToolSource,
} from "@openagentkit/sdk/protocol";
import type { ServerConfig } from "../../config.ts";
import type { ProviderGateway } from "../../gateway/types.ts";
import { KIT_CONFIG, KIT_PROVIDER_GATEWAY } from "../../utils/injection-tokens.ts";

const USAGE_DEFAULT_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

interface TelemetryQuery {
	session_id?: string;
	agent_id?: string;
	start_time?: number;
	end_time?: number;
	page_no?: number;
	page_size?: number;
	sort_order?: "asc" | "desc";
}

function usageTimeRange(query: TelemetryQuery) {
	const end = query.end_time ?? Date.now();
	const start = query.start_time ?? end - USAGE_DEFAULT_RANGE_MS;
	if (start > end) throw new KitError("invalid_request", "时间区间无效：start_time 不能晚于 end_time");
	return { start_time: start, end_time: end };
}

function telemetryWorkspaceId(config: ServerConfig) {
	if (config.resolvedGateway === "mock") return "ws-mock";
	const workspaceId = config.bailian?.workspaceId;
	if (!workspaceId)
		throw new KitError(
			"invalid_request",
			"服务端未配置 BAILIAN_WORKSPACE_ID，无法确定用量查询的工作空间；请补充配置后重试",
			{ details: { workspace_unconfigured: true } },
		);
	return workspaceId;
}

function telemetryRequest(query: TelemetryQuery, config: ServerConfig) {
	const scope = query.session_id
		? { type: "session" as const, session_id: query.session_id }
		: {
				type: "workspace" as const,
				workspace_ids: [telemetryWorkspaceId(config)],
				...(query.agent_id ? { agent_id: query.agent_id } : {}),
			};
	return {
		scope,
		// 会话口径按整个会话汇总，不能传 time_range。
		time_range: query.session_id ? undefined : usageTimeRange(query),
		...(query.page_no ? { page_no: query.page_no } : {}),
		...(query.page_size ? { page_size: query.page_size } : {}),
		...(query.sort_order ? { sort_order: query.sort_order } : {}),
	};
}

@Injectable()
export class ProviderAdminService {
	constructor(
		@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway,
		@Inject(KIT_CONFIG) private readonly config: ServerConfig,
	) {}

	listAgents() {
		return this.gateway.listRemoteAgents();
	}

	listAgentVersions(agentId: string) {
		return this.gateway.listRemoteAgentVersions(agentId);
	}

	async agentVersionDetail(agentId: string, version: number) {
		const detail = await this.gateway.getRemoteAgentVersionDetail(agentId, version);
		if (!detail) throw new KitError("not_found", "智能体版本不存在或已不可用");
		return detail;
	}

	listEnvironments() {
		return this.gateway.listRemoteEnvironments();
	}

	async environmentDetail(environmentId: string) {
		const detail = await this.gateway.getRemoteEnvironment(environmentId);
		if (!detail) throw new KitError("not_found", "环境不存在或已不可用");
		return detail;
	}

	listFiles() {
		return this.gateway.listRemoteFiles();
	}

	listVaults() {
		return this.gateway.listRemoteVaults();
	}

	async vaultDetail(vaultId: string) {
		const detail = await this.gateway.getRemoteVaultDetail(vaultId);
		if (!detail) throw new KitError("not_found", "密钥库不存在或已不可用");
		return detail;
	}

	listMemoryStores() {
		return this.gateway.listRemoteMemoryStores();
	}

	async memoryStoreConfiguration(storeId: string) {
		const data = await this.gateway.getRemoteMemoryStoreConfiguration(storeId);
		if (!data) throw new KitError("not_found", "记忆库不存在或已归档");
		return data;
	}

	listSkills(source: RemoteSkillSource) {
		return this.gateway.listRemoteSkills(source);
	}

	modelUsage(query: TelemetryQuery & { model_name?: string; sort_by?: ModelUsageSortBy }) {
		const { gateway, config } = this;
		return gateway.listModelUsage({
			...telemetryRequest(query, config),
			...(query.model_name ? { model_name: query.model_name } : {}),
			...(query.sort_by ? { sort_by: query.sort_by } : {}),
		});
	}

	toolUsage(query: TelemetryQuery & { source?: UsageToolSource; tool_name?: string; sort_by?: ToolUsageSortBy }) {
		const { gateway, config } = this;
		return gateway.listToolUsage({
			...telemetryRequest(query, config),
			...(query.source ? { source: query.source } : {}),
			...(query.tool_name ? { tool_name: query.tool_name } : {}),
			...(query.sort_by ? { sort_by: query.sort_by } : {}),
		});
	}
}
