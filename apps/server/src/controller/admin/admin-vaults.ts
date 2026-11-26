import { Controller, Inject } from "@nestjs/common";
import { RemoteVaultDetailSchema, RemoteVaultSchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { ProviderAdminService } from "../../service/admin/provider-admin.ts";

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }) });

const getRemoteVaultsByVaultIdRoute = defineRoute({
	method: "get",
	path: "/api/admin/remote/vaults/{vaultId}",
	tags: ["admin"],
	request: { params: z.object({ vaultId: z.string().regex(/^[A-Za-z0-9_-]+$/) }) },
	responses: {
		200: {
			description: "密钥库详情，仅展示密钥名称、变量名和生效域名，不含密钥值",
			content: { "application/json": { schema: z.object({ data: RemoteVaultDetailSchema }) } },
		},
		400: { description: "密钥库 ID 无效" },
		401: { description: "管理端未认证" },
		403: { description: "无管理端读取权限" },
		404: { description: "密钥库不存在或已不可用" },
		502: { description: "密钥库详情查询失败" },
	},
});

const getRemoteVaultsRoute = defineRoute({
	method: "get",
	path: "/api/admin/remote/vaults",
	tags: ["admin"],
	responses: {
		200: {
			description: "Provider 未归档密钥库完整列表；仅 ID 与名称，不读取凭据",
			content: { "application/json": { schema: z.object({ data: z.array(RemoteVaultSchema) }) } },
		},
		401: { description: "管理端未认证", content: { "application/json": { schema: errorBody } } },
		403: { description: "管理端令牌无效", content: { "application/json": { schema: errorBody } } },
		502: { description: "Provider 密钥库查询失败", content: { "application/json": { schema: errorBody } } },
	},
});

@Controller()
export class AdminVaultsController {
	constructor(@Inject(ProviderAdminService) private readonly providerAdmin: ProviderAdminService) {}

	/**
	 * 读取指定远端密钥库的密钥名称、变量名和生效域名。
	 *
	 * @param request - 路径参数 `vaultId` 指定远端密钥库。
	 * @return 200，`data` 包含密钥库信息及凭据的名称、变量名和生效域名。
	 */
	@KitRoute(getRemoteVaultsByVaultIdRoute)
	async getRemoteVaultsByVaultId(@KitInput() request: KitRequest<typeof getRemoteVaultsByVaultIdRoute>) {
		request.setHeader("Cache-Control", "no-store");
		const detail = await this.providerAdmin.vaultDetail(request.params.vaultId);
		return request.json({ data: detail }, 200);
	}

	/**
	 * 列出可选的未归档远端密钥库，返回各库的 ID 和名称。
	 *
	 * @param request - 已认证的管理端请求。
	 * @return 200，`data` 为未归档密钥库的 ID 和名称列表。
	 */
	@KitRoute(getRemoteVaultsRoute)
	async getRemoteVaults(@KitInput() request: KitRequest<typeof getRemoteVaultsRoute>) {
		return request.json({ data: await this.providerAdmin.listVaults() }, 200);
	}
}
