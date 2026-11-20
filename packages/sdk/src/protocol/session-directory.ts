import { z } from "zod";
import { SessionSummarySchema } from "./api.ts";

/** 当前身份的体验会话索引；未指定时保持旧接口包含归档记录的行为。 */
export const SessionListQuerySchema = z.object({
	agent_slug: z.string().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(200).default(50),
	page_token: z.string().min(1).max(4096).optional(),
	include_archived: z.enum(["true", "false"]).optional(),
	/** 分组查询使用，要求同时提供 agent_slug，仅返回当前未软删条目绑定的会话。 */
	active_entry_only: z.literal("true").optional(),
	/** 在分页前按标题、智能体 slug 与当前 Catalog 展示名检索本人会话。 */
	q: z.string().trim().min(1).max(100).optional(),
});

export const SessionPageSchema = z.object({
	data: z.array(SessionSummarySchema),
	next_page_token: z.string().nullable(),
});
export type SessionPage = z.infer<typeof SessionPageSchema>;

/** 从本人未归档体验会话提取未软删条目的 slug，包含已下架条目。 */
export const SessionAgentsPageSchema = z.object({ data: z.array(z.string()) });
