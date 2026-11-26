import { z } from "../../http/schemas.ts";

export const data = (schema: z.ZodTypeAny) => z.object({ data: schema });

/** 每日用量窗口为 1 到 400 天，缺省 30 天。 */
export const dailyWindowQuery = z.coerce.number().int().min(1).max(400).optional().default(30);

const errorBody = z.object({
	error: z.object({
		code: z.string(),
		message: z.string(),
		retryable: z.boolean().optional(),
		details: z.unknown().optional(),
	}),
});

export const kitErrors = {
	400: { description: "invalid_request", content: { "application/json": { schema: errorBody } } },
	401: { description: "unauthorized", content: { "application/json": { schema: errorBody } } },
	404: { description: "not_found", content: { "application/json": { schema: errorBody } } },
	403: { description: "forbidden / quota_exceeded", content: { "application/json": { schema: errorBody } } },
	409: { description: "conflict / request_pending", content: { "application/json": { schema: errorBody } } },
	428: { description: "confirmation_required", content: { "application/json": { schema: errorBody } } },
	502: { description: "provider_error", content: { "application/json": { schema: errorBody } } },
};
