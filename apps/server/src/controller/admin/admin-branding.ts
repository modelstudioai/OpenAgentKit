import { Controller, Inject } from "@nestjs/common";
import {
	BRANDING_LOGO_MAX_BYTES,
	BRANDING_LOGO_TYPES,
	BrandingUpdateSchema,
	BrandingViewSchema,
	KitError,
} from "@openagentkit/sdk/protocol";
import { requireAdmin } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { BrandingService } from "../../service/shared/branding.ts";

const errorBody = z.object({
	error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() }),
});

const errors = {
	400: { description: "invalid_request", content: { "application/json": { schema: errorBody } } },
	401: { description: "管理端未认证", content: { "application/json": { schema: errorBody } } },
	403: { description: "forbidden", content: { "application/json": { schema: errorBody } } },
	413: { description: "Logo 超过上传上限", content: { "application/json": { schema: errorBody } } },
};

const getBrandingRoute = defineRoute({
	method: "get",
	path: "/api/admin/branding",
	tags: ["admin"],
	responses: {
		200: {
			description: "员工端品牌配置",
			content: { "application/json": { schema: z.object({ data: BrandingViewSchema }) } },
		},
		...errors,
	},
});

const postBrandingLogoRoute = defineRoute({
	method: "post",
	path: "/api/admin/branding/logo",
	tags: ["admin"],
	request: {
		body: {
			content: {
				"multipart/form-data": {
					schema: z.object({ file: z.any().openapi({ type: "string", format: "binary" }) }),
				},
			},
		},
	},
	responses: {
		201: {
			description: "Logo 已上传；员工端下次读取 `/api/config` 时生效",
			content: { "application/json": { schema: z.object({ data: BrandingViewSchema }) } },
		},
		...errors,
	},
});

const putBrandingRoute = defineRoute({
	method: "put",
	path: "/api/admin/branding",
	tags: ["admin"],
	request: {
		body: { content: { "application/json": { schema: BrandingUpdateSchema } } },
	},
	responses: {
		200: {
			description: "已保存；员工端下次读取 `/api/config` 时生效",
			content: { "application/json": { schema: z.object({ data: BrandingViewSchema }) } },
		},
		...errors,
	},
});

@Controller()
export class AdminBrandingController {
	constructor(@Inject(BrandingService) private readonly brandingService: BrandingService) {}

	/**
	 * 读取员工端当前使用的产品名称、Logo 地址和最近更新信息。
	 *
	 * @param request - 已认证的管理端请求。
	 * @return 200，`data` 包含产品名称、Logo 地址及可用的更新信息。
	 */
	@KitRoute(getBrandingRoute)
	async getBranding(@KitInput() request: KitRequest<typeof getBrandingRoute>) {
		return request.json({ data: await this.brandingService.view() }, 200);
	}

	/**
	 * 上传员工端的品牌 Logo，返回更新后的品牌配置。
	 *
	 * @param request - 管理员通过 `multipart` 表单的 `file` 字段提交一张 Logo 图片。
	 * @return 201，`data` 为包含新 Logo 地址的品牌配置。
	 */
	@KitRoute(postBrandingLogoRoute)
	async postBrandingLogo(@KitInput() request: KitRequest<typeof postBrandingLogoRoute>) {
		const { subject } = requireAdmin(request);
		const form = await request.formData();
		const file = form.get("file");
		if (!(file instanceof File) || form.getAll("file").length !== 1)
			throw new KitError("invalid_request", "请提供一个 Logo 图片文件");
		if (file.size > BRANDING_LOGO_MAX_BYTES)
			return request.json(
				{
					error: {
						code: "invalid_request",
						message: `Logo 不能超过 ${Math.floor(BRANDING_LOGO_MAX_BYTES / 1024)}KB`,
						retryable: false,
					},
				},
				413,
			);
		if (!(BRANDING_LOGO_TYPES as readonly string[]).includes(file.type))
			throw new KitError("invalid_request", "Logo 仅支持 PNG、JPEG、WebP 或 SVG");
		const bytes = new Uint8Array(await file.arrayBuffer());
		const data = await this.brandingService.uploadLogo(subject, file.type, bytes);
		return request.json({ data }, 201);
	}

	/**
	 * 保存员工端的产品名称和可选的 Logo 地址。
	 *
	 * @param request - 管理员在请求体中提供 `productName` 和可选的 `logoUrl`。
	 * @return 200，`data` 为保存后的品牌配置。
	 */
	@KitRoute(putBrandingRoute)
	async putBranding(@KitInput() request: KitRequest<typeof putBrandingRoute>) {
		const { subject } = requireAdmin(request);
		const data = await this.brandingService.update(subject, request.input);
		return request.json({ data }, 200);
	}
}
