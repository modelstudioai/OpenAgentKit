import { KitError } from "@openagentpack/kit-sdk/protocol";
import { createBailianChatProvider } from "@openagentpack/kit-sdk/providers/bailian";
import { type BackendConfig, createBackendHttp, readJson, record } from "./backend-http.ts";

export function createRawBailianProvider(config: BackendConfig) {
	const backend = createBackendHttp(config);
	return createBailianChatProvider({
		request: backend.request,
		...backend.operations,
		openStream: {
			buildRequest: ({ sessionId }) => ({
				path: `${backend.sessionPath(sessionId)}/stream`,
				init: { headers: { Accept: "text/event-stream" } },
			}),
			mapResponse(response) {
				// 后端先建立上游订阅，再发送此响应头。
				// 跨域时通过 Access-Control-Expose-Headers 暴露此头。
				if (response.headers.get("x-upstream-ready") !== "true")
					throw new KitError("conflict", "后端未确认上游订阅就绪。");
				// 立即返回响应体与就绪 Promise，由工厂读取并等待。
				return { response, ready: Promise.resolve() };
			},
		},
		listEvents: {
			buildRequest({ sessionId, pageToken }) {
				const query = new URLSearchParams({ order: "asc" });
				if (pageToken) query.set("page_token", pageToken);
				return { path: `${backend.sessionPath(sessionId)}/events?${query}` };
			},
			async mapResponse(response) {
				const page = record(await readJson(response));
				if (!Array.isArray(page.data)) throw new KitError("provider_error", "后端返回的历史分页无效。");
				const next = page.next_page_token;
				if (next !== undefined && next !== null && typeof next !== "string")
					throw new KitError("provider_error", "后端返回的历史游标无效。");
				return {
					// 保留完整原始对象，包括事件标识及执行状态。
					events: page.data.map(record),
					nextPageToken: next,
				};
			},
		},
	});
}
