import { Controller, Inject } from "@nestjs/common";
import { EvalRunDetailSchema, EvalRunSummarySchema, EvalWorkspaceViewSchema } from "@openagentkit/sdk/protocol";
import { requireAdmin } from "../../http/identity.ts";
import type { KitRequest } from "../../http/request.ts";
import { defineRoute, KitInput, KitRoute } from "../../http/routes.ts";
import { z } from "../../http/schemas.ts";
import { EvalService } from "../../service/admin/eval.ts";
import { adminErrors as errors } from "./admin-schemas.ts";

const getEvalWorkspacesRoute = defineRoute({
	method: "get",
	path: "/api/admin/eval/workspaces",
	tags: ["admin"],
	responses: {
		200: {
			description: "已配置的评测 workspace 列表（KIT_EVAL_WORKSPACES）",
			content: { "application/json": { schema: z.object({ data: z.array(EvalWorkspaceViewSchema) }) } },
		},
		...errors,
	},
});

const getEvalRunsRoute = defineRoute({
	method: "get",
	path: "/api/admin/eval/runs",
	tags: ["admin"],
	request: { query: z.object({ workspace: z.string().min(1) }) },
	responses: {
		200: {
			description: "workspace 下 complete 的 run 摘要（新→旧）",
			content: { "application/json": { schema: z.object({ data: z.array(EvalRunSummarySchema) }) } },
		},
		...errors,
	},
});

const getEvalRunsByRunIdRoute = defineRoute({
	method: "get",
	path: "/api/admin/eval/runs/{runId}",
	tags: ["admin"],
	request: {
		params: z.object({ runId: z.string() }),
		query: z.object({ workspace: z.string().min(1) }),
	},
	responses: {
		200: {
			description: "run 详情：逐 case 断言 + 基线 + report.html 原文",
			content: { "application/json": { schema: z.object({ data: EvalRunDetailSchema }) } },
		},
		...errors,
	},
});

@Controller()
export class AdminEvalController {
	constructor(@Inject(EvalService) private readonly evaluation: EvalService) {}

	/**
	 * 列出服务端已配置且可访问的评测工作区及各自的运行次数。
	 *
	 * @param request - 已认证的管理端请求。
	 * @return 200，`data` 列出工作区路径、名称、运行次数及可用的 Skill 名称。
	 */
	@KitRoute(getEvalWorkspacesRoute)
	getEvalWorkspaces(@KitInput() request: KitRequest<typeof getEvalWorkspacesRoute>) {
		requireAdmin(request);
		return request.json({ data: this.evaluation.workspaces() }, 200);
	}

	/**
	 * 按创建时间从新到旧列出指定工作区已完成的评测。
	 *
	 * @param request - 查询参数 `workspace` 指定已配置的工作区路径。
	 * @return 200，`data` 为按创建时间倒序排列的评测运行摘要。
	 */
	@KitRoute(getEvalRunsRoute)
	getEvalRuns(@KitInput() request: KitRequest<typeof getEvalRunsRoute>) {
		requireAdmin(request);
		return request.json({ data: this.evaluation.runs(request.query.workspace) }, 200);
	}

	/**
	 * 读取一次评测的用例断言、基线结果和 HTML 报告。
	 *
	 * @param request - 路径参数 `runId` 指定评测运行，查询参数 `workspace` 指定其工作区。
	 * @return 200，`data` 包含运行摘要、用例断言、可用的基线结果和 HTML 报告。
	 */
	@KitRoute(getEvalRunsByRunIdRoute)
	getEvalRunsByRunId(@KitInput() request: KitRequest<typeof getEvalRunsByRunIdRoute>) {
		requireAdmin(request);
		const data = this.evaluation.run(request.query.workspace, request.pathParam("runId") ?? undefined);
		return request.json({ data }, 200);
	}
}
