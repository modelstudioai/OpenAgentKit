import { z } from "../../http/schemas.ts";

const errorBody = z.object({
	error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean().optional() }),
});

export const adminErrors = {
	400: { description: "invalid_request", content: { "application/json": { schema: errorBody } } },
	401: { description: "管理端未认证", content: { "application/json": { schema: errorBody } } },
	403: {
		description: "forbidden（令牌无效，或 auditor 尝试写操作）",
		content: { "application/json": { schema: errorBody } },
	},
	404: { description: "not_found", content: { "application/json": { schema: errorBody } } },
	409: { description: "conflict", content: { "application/json": { schema: errorBody } } },
	428: {
		description: "confirmation_required（上下架等破坏性动作缺确认令牌）",
		content: { "application/json": { schema: errorBody } },
	},
};
