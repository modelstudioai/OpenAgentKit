import { Controller, Inject } from "@nestjs/common";
import { BRANDING_LOGO_PATH, KitAuthConfigSchema, PROTOCOL_VERSION } from "@openagentkit/sdk/protocol";
import type { ServerConfig } from "../config.ts";
import type { KitRequest } from "../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../http/routes.ts";
import { z } from "../http/schemas.ts";
import { BrandingService } from "../service/shared/branding.ts";
import { KIT_CONFIG, KIT_GATEWAY_MODE } from "../utils/injection-tokens.ts";

const getHealthzRoute = defineRoute({
	method: "get",
	path: "/healthz",
	tags: ["meta"],
	responses: {
		200: {
			description: "存活探针",
			content: { "application/json": { schema: z.object({ ok: z.boolean(), gateway: z.string() }) } },
		},
	},
});

const getApiConfigRoute = defineRoute({
	method: "get",
	path: "/api/config",
	tags: ["meta"],
	responses: {
		200: {
			description: "运行时公开配置",
			content: {
				"application/json": {
					schema: z.object({
						data: z.object({
							apiBaseUrl: z.string(),
							protocolVersion: z.string(),
							gateway: z.enum(["sdk", "mock"]),
							auth: KitAuthConfigSchema,
							capabilities: z.object({
								streaming: z.boolean(),
								fileUpload: z.boolean(),
								artifacts: z.boolean(),
								threads: z.boolean(),
							}),
							branding: z.object({
								productName: z.string(),
								logoUrl: z.string().optional(),
								accent: z.string().optional(),
							}),
						}),
					}),
				},
			},
		},
	},
});

const getBrandingLogoRoute = defineRoute({
	method: "get",
	path: BRANDING_LOGO_PATH,
	tags: ["meta"],
	responses: {
		200: {
			description: "上传的 Logo 图片",
			content: { "image/*": { schema: z.string().openapi({ format: "binary" }) } },
		},
		404: {
			description: "Logo 不存在",
			content: {
				"application/json": {
					schema: z.object({
						error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() }),
					}),
				},
			},
		},
	},
});

@Controller()
export class MetaController {
	constructor(
		@Inject(BrandingService) private readonly brandingService: BrandingService,
		@Inject(KIT_CONFIG) private readonly config: ServerConfig,
		@Inject(KIT_GATEWAY_MODE) private readonly gatewayMode: ServerConfig["resolvedGateway"],
	) {}

	/**
	 * 报告服务存活状态和当前使用的 Gateway 模式。
	 *
	 * @param request - 公开的存活探测请求，无业务参数。
	 * @return 200，返回 `ok` 和当前 Gateway 模式 `gateway`。
	 */
	@KitRoute(getHealthzRoute)
	getHealthz(@KitInput() request: KitRequest<typeof getHealthzRoute>) {
		return request.json({ ok: true, gateway: this.gatewayMode }, 200);
	}

	/**
	 * 返回客户端启动所需的 API 地址、协议版本、认证方式、可用能力和品牌配置。
	 *
	 * @param request - 读取运行时配置的公开请求，无业务参数。
	 * @return 200，`data` 包含 `apiBaseUrl`、`protocolVersion`、`gateway`、`auth`、`capabilities` 和 `branding`。
	 */
	@KitRoute(getApiConfigRoute)
	async getApiConfig(@KitInput() request: KitRequest<typeof getApiConfigRoute>) {
		const origin = this.config.publicBaseUrl;
		const { authMode, oidc, passwordLogin } = this.config;
		const auth = KitAuthConfigSchema.parse({
			mode: authMode,
			passwordLogin,
			...(oidc ? { oidc: { issuer: oidc.issuer, clientId: oidc.clientId, adminUsersUrl: oidc.adminUsersUrl } } : {}),
		});
		const branding = await this.brandingService.publicView();
		return request.json(
			{
				data: {
					apiBaseUrl: origin,
					protocolVersion: PROTOCOL_VERSION,
					gateway: this.gatewayMode,
					auth,
					capabilities: { streaming: true, fileUpload: true, artifacts: true, threads: true },
					branding,
				},
			},
			200,
		);
	}

	/**
	 * 返回已上传的品牌 Logo 图片及其内容类型。
	 *
	 * @param request - 读取品牌 Logo 的公开请求，无业务参数。
	 * @return 200，返回带实际图片 `Content-Type` 的二进制内容，尚未上传时返回 404。
	 */
	@KitRoute(getBrandingLogoRoute)
	async getBrandingLogo(@KitInput() request: KitRequest<typeof getBrandingLogoRoute>) {
		const logo = await this.brandingService.getLogo();
		if (!logo) return request.json({ error: { code: "not_found", message: "Logo 不存在", retryable: false } }, 404);
		return new Response(new Uint8Array(logo.bytes), {
			status: 200,
			headers: {
				"content-type": logo.contentType,
				"content-security-policy":
					"sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
				"x-content-type-options": "nosniff",
				"cache-control": "public, max-age=31536000, immutable",
			},
		});
	}
}
