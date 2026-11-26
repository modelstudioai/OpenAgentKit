import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	KitError,
	type PresetPackConfiguration,
	PresetPackConfigurationSchema,
	type PresetPackCreateInput,
	PresetPackCreateInputSchema,
	PresetPackPreviewSchema,
	type PresetPackResource,
	PresetPackSummarySchema,
	type PresetPacksPage,
	type PresetPacksQuery,
	PresetPacksQuerySchema,
	type PresetPackView,
	PresetPackViewSchema,
	presetPackResourceId,
} from "@openagentkit/sdk/protocol";
import { KitPresetPacksEntity } from "../../../entity/tables/kit-preset-packs.entity.ts";
import type { ProviderGateway } from "../../../gateway/types.ts";
import { StoreDatabase } from "../../../store/database.ts";
import { jsonText, likePattern } from "../../../store/sql.ts";
import { KIT_PROVIDER_GATEWAY } from "../../../utils/injection-tokens.ts";
import { CatalogResourceService } from "../../shared/catalog-resources.ts";

const identity = (type: string, id: string) => JSON.stringify([type, id]);

function requiredId(
	resource: PresetPackResource,
	field: "environment_id" | "file_id" | "memory_store_id" | "vault_id",
) {
	const id = resource[field];
	if (!id) throw new KitError("invalid_request", "所选资源缺少可复用的底层资源 ID");
	return id;
}

function environmentId(config: PresetPackConfiguration, resource: PresetPackResource) {
	if (config.remote_environment_id) throw new KitError("invalid_request", "创建智能体仅支持一个环境，请只选择一个环境");
	return requiredId(resource, "environment_id");
}

function fileBinding(references: PresetPackResource[]) {
	const file_id = requiredId(references[0]!, "file_id");
	const paths = [...new Set(references.flatMap((resource) => (resource.mount_path ? [resource.mount_path] : [])))];
	if (paths.length > 1)
		throw new KitError("invalid_request", "所选文件存在多个挂载路径，创建页暂不支持该配置，请取消选择该文件");
	if (references.some((resource) => resource.access))
		throw new KitError("invalid_request", "所选文件包含创建页暂不支持的权限配置，请取消选择该文件");
	return { file_id, ...(paths[0] ? { mount_path: paths[0] } : {}) };
}

function memoryBinding(references: PresetPackResource[]) {
	const memory_store_id = requiredId(references[0]!, "memory_store_id");
	const access = [...new Set(references.flatMap((resource) => (resource.access ? [resource.access] : [])))];
	if (access.length > 1)
		throw new KitError("invalid_request", "所选记忆库存在不同访问权限，创建页暂不支持该配置，请取消选择该记忆库");
	return { memory_store_id, access: access[0] ?? ("read_only" as const) };
}

function appendResource(config: PresetPackConfiguration, type: string, references: PresetPackResource[]) {
	switch (type) {
		case "environment":
			config.remote_environment_id = environmentId(config, references[0]!);
			break;
		case "file":
			config.files.push(fileBinding(references));
			break;
		case "memory_store":
			config.memory_stores.push(memoryBinding(references));
			break;
		case "vault":
			config.vault_ids.push(requiredId(references[0]!, "vault_id"));
			break;
		default:
			throw new KitError("invalid_request", "所选资源包含创建页暂不支持的类型，请取消选择后重试");
	}
}

/** 对齐创建页的可表示范围；不截断多环境、多挂载或不同权限，不静默丢弃不支持的资源。 */
function configuration(input: PresetPackCreateInput, resources: PresetPackResource[], version: number) {
	const available = new Map<string, PresetPackResource[]>();
	for (const resource of resources) {
		const id = presetPackResourceId(resource);
		if (!id) continue;
		const key = identity(resource.type, id);
		available.set(key, [...(available.get(key) ?? []), resource]);
	}
	const config: PresetPackConfiguration = {
		remote_agent_id: input.remote_agent_id,
		agent_version: version,
		files: [],
		memory_stores: [],
		vault_ids: [],
	};
	const selected = new Set<string>();
	for (const selection of input.resources) {
		const key = identity(selection.type, selection.resource_id);
		if (selected.has(key)) throw new KitError("invalid_request", "同一资源不能重复选择");
		selected.add(key);
		const references = available.get(key);
		if (!references) throw new KitError("conflict", "所选资源已变化或不属于当前智能体，请重新读取后选择");
		appendResource(config, selection.type, references);
	}
	const parsed = PresetPackConfigurationSchema.safeParse(config);
	if (!parsed.success)
		throw new KitError("invalid_request", "所选资源超过创建页数量限制：文件 10 个、记忆库 8 个、密钥库 10 个");
	return parsed.data;
}

@Injectable()
export class PresetPackService {
	constructor(
		@Inject(StoreDatabase) private readonly db: StoreDatabase,
		@Inject(KIT_PROVIDER_GATEWAY) private readonly gateway: ProviderGateway,
		@Inject(CatalogResourceService) private readonly resources: CatalogResourceService,
	) {}

	agentResources(agentId: string, signal: AbortSignal) {
		return this.gateway.getPresetPackAgentResources(agentId, signal);
	}

	async get(id: string): Promise<PresetPackView> {
		const row = await this.db.read((manager) => manager.findOneBy(KitPresetPacksEntity, { preset_pack_id: id }));
		if (!row) throw new KitError("not_found", "预设包不存在");
		return PresetPackViewSchema.parse(JSON.parse(row.config_json));
	}

	async list(query: PresetPacksQuery): Promise<PresetPacksPage> {
		const parsed = PresetPacksQuerySchema.safeParse(query);
		if (!parsed.success) throw new KitError("invalid_request", "预设包查询参数无效");
		const { search, limit, offset } = parsed.data;
		const pattern = likePattern(search);
		const searchWhere = `LOWER(${jsonText(this.db, "config_json", "remote_agent_name")}) LIKE LOWER(:pattern) ESCAPE '!'
		OR LOWER(${jsonText(this.db, "config_json", "remote_agent_id")}) LIKE LOWER(:pattern) ESCAPE '!'
		OR LOWER(preset_pack_id) LIKE LOWER(:pattern) ESCAPE '!'`;
		const [rows, total] = await this.db.read((manager) =>
			manager
				.createQueryBuilder(KitPresetPacksEntity, "pack")
				.select(["pack.config_json"])
				.where(searchWhere, { pattern })
				.orderBy("pack.created_at", "DESC")
				.addOrderBy("pack.preset_pack_id", "DESC")
				.take(limit)
				.skip(offset)
				.getManyAndCount(),
		);
		return {
			data: rows.map((row) => {
				const preset = PresetPackViewSchema.parse(JSON.parse(row.config_json));
				return PresetPackSummarySchema.strip().parse({
					...preset,
					resource_count:
						Number(Boolean(preset.remote_environment_id)) +
						preset.files.length +
						preset.memory_stores.length +
						preset.vault_ids.length,
				});
			}),
			total,
		};
	}

	private async agentMetadata(input: PresetPackCreateInput) {
		const agent = (await this.gateway.listRemoteAgents()).find((item) => item.agent_id === input.remote_agent_id);
		if (!agent) throw new KitError("invalid_request", "所选智能体不存在或不可访问");
		const version = input.agent_version ?? agent.version;
		if (!version) throw new KitError("invalid_request", "所选智能体缺少可用版本，请重新选择");
		return { name: agent.name || agent.agent_id, version };
	}

	async preview(value: PresetPackCreateInput, signal?: AbortSignal) {
		const parsed = PresetPackCreateInputSchema.safeParse(value);
		if (!parsed.success) throw new KitError("invalid_request", "预设包参数无效");
		const input = parsed.data;
		const [agent, discovered] = await Promise.all([
			this.agentMetadata(input),
			input.resources.length
				? this.gateway.getPresetPackAgentResources(input.remote_agent_id, signal)
				: Promise.resolve(null),
		]);
		const config = configuration(
			input,
			discovered?.sessions.flatMap((session) => session.resources) ?? [],
			agent.version,
		);
		const environments = config.remote_environment_id ? await this.gateway.listRemoteEnvironments() : [];
		const environment = environments.find((item) => item.environment_id === config.remote_environment_id);
		if (config.remote_environment_id && !environment) throw new KitError("invalid_request", "所选环境不存在或不可访问");
		const prepared = await this.resources.prepare(config);
		signal?.throwIfAborted();
		return PresetPackPreviewSchema.parse({
			...prepared,
			remote_agent_name: agent.name,
			...(environment ? { remote_environment_name: environment.name || environment.environment_id } : {}),
		});
	}

	async create(value: PresetPackCreateInput, signal?: AbortSignal): Promise<PresetPackView> {
		const preset = PresetPackViewSchema.parse({
			...(await this.preview(value, signal)),
			preset_pack_id: `preset_${randomUUID()}`,
			created_at: new Date().toISOString(),
		});
		await this.db.write((manager) =>
			manager.insert(KitPresetPacksEntity, {
				preset_pack_id: preset.preset_pack_id,
				config_json: JSON.stringify(preset),
				created_at: preset.created_at,
			}),
		);
		return preset;
	}
}
