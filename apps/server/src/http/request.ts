import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteConfig } from "@asteasolutions/zod-to-openapi";
import { KitError } from "@openagentkit/sdk/protocol";
import type { z } from "zod";
import type { DraftResourceActions } from "../service/admin/resource-draft/draft-resources.ts";
import type { AuthenticatedMemberSession } from "../service/shared/member-auth.ts";
import type { OidcMemberGrant } from "../service/shared/oidc-auth.ts";
import type { AdminIdentity, Identity } from "../utils/identity-types.ts";

const contextKey = Symbol("kit-http-request");

export type HttpRequest = IncomingMessage & {
	originalUrl?: string;
	params?: Record<string, string>;
	route?: { path: string };
	[contextKey]?: KitRequest;
};

type Output<Schema> = Schema extends z.ZodType ? z.output<Schema> : Record<string, never>;
type Input<Route extends RouteConfig, Key extends "params" | "query" | "headers"> = Route extends {
	request: Record<Key, infer Schema>;
}
	? Output<Schema>
	: Record<string, never>;
type JsonInput<Route extends RouteConfig> = Route extends {
	request: { body: { content: { "application/json": { schema: infer Schema } } } };
}
	? Output<Schema>
	: Record<string, never>;

export function multimap(values: Iterable<[string, unknown]>) {
	const result: Record<string, unknown> = Object.create(null);
	for (const [key, value] of values) {
		if (!Object.hasOwn(result, key)) result[key] = value;
		else {
			const previous = result[key];
			result[key] = Array.isArray(previous) ? [...previous, value] : [previous, value];
		}
	}
	return result;
}

export class KitRequest<Route extends RouteConfig = RouteConfig> {
	readonly path: string;
	readonly method: string;
	readonly signal: AbortSignal;
	readonly validated: { params?: unknown; query?: unknown; headers?: unknown; input?: unknown } = {};
	private readonly url: string;
	private bodyBytes?: Promise<Buffer>;
	private form?: Promise<FormData>;
	private currentIdentity?: Identity;
	private adminIdentity?: AdminIdentity;
	private draft?: DraftResourceActions;
	memberSession?: AuthenticatedMemberSession;
	oidcMember?: OidcMemberGrant;
	authExpiresAt?: string;

	constructor(
		readonly raw: HttpRequest,
		private readonly res: ServerResponse,
		shutdown: AbortSignal,
	) {
		this.url = raw.originalUrl ?? raw.url ?? "/";
		this.path = this.url.split("?", 1)[0] ?? "/";
		this.method = raw.method ?? "GET";
		const disconnect = new AbortController();
		res.once("close", () => disconnect.abort());
		if (res.destroyed) disconnect.abort();
		this.signal = AbortSignal.any([disconnect.signal, shutdown]);
		raw[contextKey] = this;
	}

	get params(): Input<Route, "params"> {
		return (this.validated.params ?? this.raw.params ?? {}) as Input<Route, "params">;
	}

	get query(): Input<Route, "query"> {
		return this.validated.query as Input<Route, "query">;
	}

	get headers(): Input<Route, "headers"> {
		return this.validated.headers as Input<Route, "headers">;
	}

	get input(): JsonInput<Route> {
		return this.validated.input as JsonInput<Route>;
	}

	get identity(): Identity {
		if (!this.currentIdentity) throw new KitError("unauthorized", "请先登录");
		return this.currentIdentity;
	}

	set identity(value: Identity) {
		this.currentIdentity = value;
	}

	get subjectId(): string | undefined {
		return this.currentIdentity?.subjectId;
	}

	get admin(): AdminIdentity {
		if (!this.adminIdentity) throw new KitError("unauthorized", "缺少管理端令牌");
		return this.adminIdentity;
	}

	set admin(value: AdminIdentity) {
		this.adminIdentity = value;
	}

	get draftResources(): DraftResourceActions {
		if (!this.draft) throw new KitError("not_found", "资源发布批次不存在");
		return this.draft;
	}

	set draftResources(value: DraftResourceActions) {
		this.draft = value;
	}

	get hasDraftResources(): boolean {
		return this.draft !== undefined;
	}

	rawQuery() {
		return multimap(new URLSearchParams(this.url.split("?").slice(1).join("?")));
	}

	pathParam(name: string): string {
		return this.raw.params?.[name] ?? "";
	}

	header(name: string): string | undefined {
		const value = this.raw.headers[name.toLowerCase()];
		return Array.isArray(value) ? value.join(",") : value;
	}

	setHeader(name: string, value: string) {
		this.res.setHeader(name, value);
	}

	json(value: unknown, status = 200): Response {
		return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
	}

	text(value: string, status = 200): Response {
		return new Response(value, { status, headers: { "content-type": "text/plain; charset=UTF-8" } });
	}

	empty(status: number): Response {
		return new Response(null, { status });
	}

	readBody(limit: number): Promise<Buffer> {
		this.bodyBytes ??= readBoundedBody(this.raw, limit);
		return this.bodyBytes;
	}

	body(): Promise<Buffer> {
		if (!this.bodyBytes) throw new Error("请求体尚未经过限额检查");
		return this.bodyBytes;
	}

	formData(): Promise<FormData> {
		this.form ??= this.parseFormData();
		return this.form;
	}

	private async parseFormData() {
		const body = await this.body();
		return new Response(body, { headers: { "content-type": this.header("content-type") ?? "" } }).formData();
	}
}

export function getRequest(raw: HttpRequest): KitRequest {
	const request = raw[contextKey];
	if (!request) throw new KitError("internal", "HTTP 请求未初始化");
	return request;
}

async function readBoundedBody(request: HttpRequest, limit: number) {
	const tooLarge = () => new KitError("invalid_request", "请求体超过上限", { status: 413 });
	if (Number(request.headers["content-length"]) > limit) {
		request.resume();
		throw tooLarge();
	}
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request.iterator({ destroyOnReturn: false })) {
		const bytes = chunk as Buffer;
		size += bytes.length;
		if (size > limit) {
			request.resume();
			throw tooLarge();
		}
		chunks.push(bytes);
	}
	return Buffer.concat(chunks, size);
}
