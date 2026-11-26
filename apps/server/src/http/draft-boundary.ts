import { KitError } from "@openagentkit/sdk/protocol";
import type { ResourceDraftService } from "../service/admin/resource-draft/resource-drafts.ts";
import type { KitRequest } from "./request.ts";

function draftResponseData(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(draftResponseData);
	if (!value || typeof value !== "object") return value;
	const result = { ...value } as Record<string, unknown>;
	for (const key of ["source_path", "owner_agent", "config_path", "state_path", "project_root"]) delete result[key];
	for (const key of ["agent", "environment", "memory_store", "vault"]) {
		if (result[key] && typeof result[key] === "object") result[key] = draftResponseData(result[key]);
	}
	return result;
}

export async function filterDraftResponse(request: KitRequest, response: Response): Promise<Response> {
	if (
		!request.hasDraftResources ||
		!response.ok ||
		!response.headers.get("content-type")?.includes("application/json")
	) {
		return response;
	}
	const body = (await response.json()) as { data?: unknown };
	const headers = new Headers(response.headers);
	headers.delete("content-length");
	return new Response(JSON.stringify({ ...body, data: draftResponseData(body.data) }), {
		status: response.status,
		headers,
	});
}

/** 先绑定经过归属校验的批次，再执行批次内的资源路由。 */
export async function bindDraftResources(
	request: KitRequest,
	resourceDrafts: ResourceDraftService,
): Promise<Response | undefined> {
	if (request.path.startsWith("/api/admin/operations/")) {
		const id = request.path.split("/")[4];
		if (id && !(await resourceDrafts.canReadOperation(id, request.admin.subject))) {
			throw new KitError("not_found", "operation 不存在");
		}
	}
	const match = /^\/api\/admin\/resource-drafts\/([^/]+)\/resources(.*)$/.exec(request.path);
	if (!match) return;
	const name = decodeURIComponent(match[1]!);
	if (!name.startsWith("draft_")) throw new KitError("not_found", "资源发布批次不存在");
	const scoped = await resourceDrafts.resourcesFor(name, request.admin.subject, request.method, match[2]!);
	if ("published" in scoped) return request.json({ data: scoped.published });
	request.draftResources = scoped;
}
