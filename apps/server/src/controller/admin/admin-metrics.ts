import { Controller, Inject } from "@nestjs/common";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import type { EventBufferRegistry } from "../../utils/event-buffer.ts";
import { KIT_EVENT_BUFFERS, KIT_METRICS } from "../../utils/injection-tokens.ts";
import type { Metrics } from "../../utils/metrics.ts";
import { adminErrors as errors } from "./admin-schemas.ts";

const getMetricsRoute = defineRoute({
	method: "get",
	path: "/api/admin/metrics",
	tags: ["admin"],
	responses: {
		200: {
			description: "Prometheus 文本格式的进程内指标（label 只有路由模板/方法/状态码，不含令牌、事件正文与用户输入）",
			content: { "text/plain": { schema: z.string() } },
		},
		...errors,
	},
});

@Controller()
export class AdminMetricsController {
	constructor(
		@Inject(KIT_EVENT_BUFFERS) private readonly buffers: EventBufferRegistry,
		@Inject(KIT_METRICS) private readonly metrics: Metrics,
	) {}

	/**
	 * 以 Prometheus 文本格式导出当前服务进程的运行指标。
	 *
	 * @param request - 已认证的管理端请求。
	 * @return 200，以 `text/plain` 返回 Prometheus 格式的指标文本。
	 */
	@KitRoute(getMetricsRoute)
	getMetrics(@KitInput() request: KitRequest<typeof getMetricsRoute>) {
		const { metrics, buffers } = this;
		metrics.gauge("kit_event_buffer_sessions", buffers.size());
		return request.text(metrics.render(), 200);
	}
}
