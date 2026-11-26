import { z } from "./schemas.ts";

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }) });

export const usageLimitErrors = {
	400: { description: "限额必须是非负有效数值或 null", content: { "application/json": { schema: errorBody } } },
	401: { description: "身份未认证", content: { "application/json": { schema: errorBody } } },
	403: { description: "无管理权限或只读身份不能修改", content: { "application/json": { schema: errorBody } } },
	404: { description: "成员不存在", content: { "application/json": { schema: errorBody } } },
};
