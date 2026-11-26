import { Controller, Inject } from "@nestjs/common";
import { MemberUsageLimitViewSchema } from "@openagentkit/sdk/protocol";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { usageLimitErrors } from "../../http/usage-limit-schemas.ts";
import { UsageLimitService } from "../../service/shared/usage/usage-limits.ts";
import { dailyWindowQuery } from "./staff-schemas.ts";

const getUsageLimitsRoute = defineRoute({
	method: "get",
	path: "/api/kit/usage-limits",
	tags: ["kit"],
	request: {
		query: z.object({ days: dailyWindowQuery }),
	},
	responses: {
		200: {
			description: "当前本地成员月度额度（daily 为最近 days 天逐日增量，缺省 30、最多 400）；匿名与外部身份为 null",
			content: { "application/json": { schema: z.object({ data: MemberUsageLimitViewSchema.nullable() }) } },
		},
		...usageLimitErrors,
	},
});

@Controller()
export class StaffUsageLimitsController {
	constructor(@Inject(UsageLimitService) private readonly usageLimits: UsageLimitService) {}

	/**
	 * 查询本地成员的 Token 与执行时长限额、当期及逐日用量，其他身份返回 null。
	 *
	 * @param request - 请求身份限定成员，可通过查询参数 `days` 指定逐日用量的天数，默认 30 天。
	 * @return 200，本地成员的 `data` 包含 Token 与运行时长限额、当日及逐日用量，匿名及外部身份的 `data` 为 `null`。
	 */
	@KitRoute(getUsageLimitsRoute)
	async getUsageLimits(@KitInput() request: KitRequest<typeof getUsageLimitsRoute>) {
		const { usageLimits } = this;
		const subjectId = request.identity.subjectId;
		const { days } = request.query;
		return request.json(
			{
				data: (await usageLimits.isMember(subjectId)) ? await usageLimits.member(subjectId, { dailyDays: days }) : null,
			},
			200,
		);
	}
}
