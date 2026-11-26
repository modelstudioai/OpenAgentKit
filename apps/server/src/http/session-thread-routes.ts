import { eventsPageSchema, SessionThreadsResponseSchema } from "@openagentkit/sdk/protocol";
import { defineRoute } from "./routes.ts";
import { z } from "./schemas.ts";

const threadQuery = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(50),
	page_token: z.string().optional(),
});
const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
const errors = {
	400: { description: "invalid_request", content: { "application/json": { schema: errorBody } } },
	401: { description: "unauthorized", content: { "application/json": { schema: errorBody } } },
	404: { description: "not_found", content: { "application/json": { schema: errorBody } } },
	502: { description: "provider_error", content: { "application/json": { schema: errorBody } } },
};
type Scope = "kit" | "admin/debug";

export function threadListing(scope: Scope) {
	return defineRoute({
		method: "get",
		path: `/api/${scope}/sessions/{sessionId}/threads`,
		tags: [scope === "kit" ? "kit" : "admin-debug"],
		request: { params: z.object({ sessionId: z.string() }), query: threadQuery },
		responses: {
			200: {
				description: "子 Agent 线程摘要分页",
				content: { "application/json": { schema: SessionThreadsResponseSchema } },
			},
			...errors,
		},
	});
}

export function threadEvents(scope: Scope) {
	return defineRoute({
		method: "get",
		path: `/api/${scope}/sessions/{sessionId}/threads/{threadId}/events`,
		tags: [scope === "kit" ? "kit" : "admin-debug"],
		request: {
			params: z.object({ sessionId: z.string(), threadId: z.string().regex(/^sthr_[A-Za-z0-9_-]+$/) }),
			query: threadQuery,
		},
		responses: {
			200: {
				description: "子 Agent 完整快照事件分页，最新事件在前",
				content: { "application/json": { schema: eventsPageSchema() } },
			},
			...errors,
		},
	});
}

export function threadPage({ query, signal }: { query: z.output<typeof threadQuery>; signal: AbortSignal }) {
	return {
		limit: query.limit,
		...(query.page_token ? { pageToken: query.page_token } : {}),
		signal,
	};
}
