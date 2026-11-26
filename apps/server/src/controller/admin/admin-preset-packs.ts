import { Controller, Inject } from "@nestjs/common";
import {
	KitError,
	PresetPackAgentResourcesSchema,
	PresetPackCreateInputSchema,
	PresetPackPreviewSchema,
	PresetPacksPageSchema,
	PresetPacksQuerySchema,
	PresetPackViewSchema,
} from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { PresetPackService } from "../../service/admin/catalog/preset-packs.ts";

const savedResponse = {
	description: "已保存的智能体版本与资源引用，可在创建页重新读取",
	content: { "application/json": { schema: z.object({ data: PresetPackViewSchema }) } },
};

const postPresetPacksPreviewRoute = defineRoute({
	method: "post",
	path: "/api/admin/preset-packs/preview",
	tags: ["admin"],
	request: { body: { required: true, content: { "application/json": { schema: PresetPackCreateInputSchema } } } },
	responses: {
		200: {
			description: "核验所选智能体与资源并返回可回填配置，不保存预设包",
			content: { "application/json": { schema: z.object({ data: PresetPackPreviewSchema }) } },
		},
		400: { description: "选择或创建页配置无效" },
		401: { description: "管理端未认证" },
		403: { description: "审计员不可准备创建配置" },
		404: { description: "智能体不可访问" },
		409: { description: "资源已变化或不可用" },
		502: { description: "Provider 核验失败" },
	},
});

const getPresetPacksRoute = defineRoute({
	method: "get",
	path: "/api/admin/preset-packs",
	tags: ["admin"],
	request: { query: PresetPacksQuerySchema },
	responses: {
		200: {
			description: "已保存预设包的分页摘要，仅查询本地配置目录",
			content: { "application/json": { schema: PresetPacksPageSchema } },
		},
		400: { description: "分页或搜索参数无效" },
		401: { description: "管理端未认证" },
	},
});

const postPresetPacksRoute = defineRoute({
	method: "post",
	path: "/api/admin/preset-packs",
	tags: ["admin"],
	request: { body: { required: true, content: { "application/json": { schema: PresetPackCreateInputSchema } } } },
	responses: {
		201: savedResponse,
		400: { description: "参数、资源数量或创建页不支持的配置" },
		401: { description: "管理端未认证" },
		403: { description: "审计员不可保存预设包" },
		404: { description: "智能体不存在或不可访问" },
		409: { description: "所选资源已变化或不再可用" },
		502: { description: "Provider 资源核验失败" },
	},
});

const getPresetPacksByPresetIdRoute = defineRoute({
	method: "get",
	path: "/api/admin/preset-packs/{presetId}",
	tags: ["admin"],
	request: { params: z.object({ presetId: z.string().regex(/^preset_[0-9a-f-]{36}$/) }) },
	responses: {
		200: savedResponse,
		400: { description: "预设包 ID 无效" },
		401: { description: "管理端未认证" },
		404: { description: "预设包不存在" },
	},
});

const getPresetPacksAgentsByAgentIdResourcesRoute = defineRoute({
	method: "get",
	path: "/api/admin/preset-packs/agents/{agentId}/resources",
	tags: ["admin"],
	request: { params: z.object({ agentId: z.string().regex(/^[A-Za-z0-9_-]+$/) }) },
	responses: {
		200: {
			description: "指定智能体的全部可见会话及资源引用；complete 标记是否全部读取成功",
			content: { "application/json": { schema: z.object({ data: PresetPackAgentResourcesSchema }) } },
		},
		400: { description: "智能体 ID 无效" },
		401: { description: "管理端未认证" },
		404: { description: "智能体不存在或不可访问" },
		502: { description: "会话列表读取失败" },
	},
});

@Controller()
export class AdminPresetPacksController {
	constructor(@Inject(PresetPackService) private readonly presetPacks: PresetPackService) {}

	/**
	 * 核验选中的智能体和资源，返回可回填创建表单的预览配置。
	 *
	 * @param request - 请求体指定 `remote_agent_id`、选中的 `resources` 和可选的 `agent_version`。
	 * @return 200，`data` 包含可回填表单的智能体版本、环境及资源引用。
	 */
	@KitRoute(postPresetPacksPreviewRoute, (result) => {
		if (!result.success) throw new KitError("invalid_request", "预设包参数无效");
		return undefined;
	})
	async postPresetPacksPreview(@KitInput() request: KitRequest<typeof postPresetPacksPreviewRoute>) {
		return request.json({ data: await this.presetPacks.preview(request.input, request.signal) }, 200);
	}

	/**
	 * 按搜索条件分页列出本地已保存的预设包摘要。
	 *
	 * @param request - 可用 `search` 搜索预设包，使用 `limit` 和 `offset` 分页。
	 * @return 200，`data` 是本页预设包摘要，`total` 是匹配总数。
	 */
	@KitRoute(getPresetPacksRoute, (result) => {
		if (!result.success) throw new KitError("invalid_request", "预设包查询参数无效");
		return undefined;
	})
	async getPresetPacks(@KitInput() request: KitRequest<typeof getPresetPacksRoute>) {
		return request.json(await this.presetPacks.list(request.query), 200);
	}

	/**
	 * 核验智能体版本和所选资源，将它们的引用保存为预设包。
	 *
	 * @param request - 请求体提交 `remote_agent_id`、可选的 `agent_version` 及包含 `type`、`resource_id` 的 `resources` 列表。
	 * @return 201，`data` 包含已保存的配置、预设包 ID 和创建时间。
	 */
	@KitRoute(postPresetPacksRoute, (result) => {
		if (!result.success) throw new KitError("invalid_request", "预设包参数无效");
		return undefined;
	})
	async postPresetPacks(@KitInput() request: KitRequest<typeof postPresetPacksRoute>) {
		return request.json({ data: await this.presetPacks.create(request.input, request.signal) }, 201);
	}

	/**
	 * 读取已保存预设包中的智能体版本和资源引用。
	 *
	 * @param request - 路径参数 `presetId` 指定已保存的预设包。
	 * @return 200，`data` 包含预设包的智能体版本、环境及资源引用。
	 */
	@KitRoute(getPresetPacksByPresetIdRoute)
	async getPresetPacksByPresetId(@KitInput() request: KitRequest<typeof getPresetPacksByPresetIdRoute>) {
		return request.json({ data: await this.presetPacks.get(request.params.presetId) }, 200);
	}

	/**
	 * 汇总指定智能体各个可见会话的资源引用，并标明读取是否完整。
	 *
	 * @param request - 路径参数 `agentId` 指定要查找会话资源的智能体。
	 * @return 200，`data.sessions` 列出会话及资源，`data.complete` 表示是否已完整读取。
	 */
	@KitRoute(getPresetPacksAgentsByAgentIdResourcesRoute)
	async getPresetPacksAgentsByAgentIdResources(
		@KitInput() request: KitRequest<typeof getPresetPacksAgentsByAgentIdResourcesRoute>,
	) {
		request.setHeader("Cache-Control", "no-store");
		const { agentId } = request.params;
		return request.json({ data: await this.presetPacks.agentResources(agentId, request.signal) }, 200);
	}
}
