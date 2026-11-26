import { Controller, Inject } from "@nestjs/common";
import type { KitRequest } from "../../http/request.ts";
import { KitInput, KitRoute } from "../../http/routes.ts";
import { threadEvents, threadListing, threadPage } from "../../http/session-thread-routes.ts";
import { KitSessionService } from "../../service/staff/kit-sessions.ts";

const kitThreads = threadListing("kit");
const kitEvents = threadEvents("kit");

/** Session 本地归属先于 Provider 查询。 */
@Controller()
export class SessionThreadsController {
	constructor(@Inject(KitSessionService) private readonly kitSessions: KitSessionService) {}

	/**
	 * 分页列出本人会话中的子智能体线程摘要。
	 *
	 * @param request - 路径参数 `sessionId` 指定本人会话，可通过查询参数 `limit` 和 `page_token` 分页。
	 * @return 200，`data` 为子线程摘要数组，`next_page_token` 为下一页游标。
	 */
	@KitRoute(kitThreads)
	async listKitThreads(@KitInput() request: KitRequest<typeof kitThreads>) {
		return request.json(
			await this.kitSessions.threads(request.identity.subjectId, request.params.sessionId, threadPage(request)),
		);
	}

	/**
	 * 按最新事件优先的顺序分页读取本人会话中指定子线程的事件快照。
	 *
	 * @param request - 路径参数 `sessionId` 和 `threadId` 指定本人会话及子线程，可通过 `limit` 和 `page_token` 分页。
	 * @return 200，`data` 为最新在前的子线程事件快照，`next_page_token` 为下一页游标。
	 */
	@KitRoute(kitEvents)
	async listKitEvents(@KitInput() request: KitRequest<typeof kitEvents>) {
		const result = await this.kitSessions.threadEvents(
			request.identity.subjectId,
			request.params.sessionId,
			request.params.threadId,
			threadPage(request),
		);
		return request.json({ data: result.events, next_page_token: result.next_page_token });
	}
}
