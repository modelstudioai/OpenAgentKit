import { Controller, Inject } from "@nestjs/common";
import type { KitRequest } from "../../http/request.ts";
import { KitInput, KitRoute } from "../../http/routes.ts";
import { threadEvents, threadListing, threadPage } from "../../http/session-thread-routes.ts";
import { DebugService } from "../../service/admin/debug.ts";

const debugThreads = threadListing("admin/debug");
const debugEvents = threadEvents("admin/debug");

@Controller()
export class AdminDebugSessionThreadsController {
	constructor(@Inject(DebugService) private readonly debug: DebugService) {}

	/**
	 * 分页列出本人调试会话中的子智能体线程摘要。
	 *
	 * @param request - 路径指定 `sessionId`，可用查询参数 `limit` 和 `page_token` 分页。
	 * @return 200，`data` 为子智能体线程摘要列表，`next_page_token` 指向下一页。
	 */
	@KitRoute(debugThreads)
	async listDebugThreads(@KitInput() request: KitRequest<typeof debugThreads>) {
		return request.json(await this.debug.threads(request.admin.subject, request.params.sessionId, threadPage(request)));
	}

	/**
	 * 分页读取本人调试会话中指定子智能体线程的事件快照。
	 *
	 * @param request - 路径指定 `sessionId` 和 `threadId`，可用查询参数 `limit` 和 `page_token` 分页。
	 * @return 200，`data` 为线程事件快照列表，`next_page_token` 指向下一页。
	 */
	@KitRoute(debugEvents)
	async listDebugEvents(@KitInput() request: KitRequest<typeof debugEvents>) {
		const result = await this.debug.threadEvents(
			request.admin.subject,
			request.params.sessionId,
			request.params.threadId,
			threadPage(request),
		);
		return request.json({ data: result.events, next_page_token: result.next_page_token });
	}
}
