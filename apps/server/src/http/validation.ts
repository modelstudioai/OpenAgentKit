import type { RouteConfig } from "@asteasolutions/zod-to-openapi";
import { KitError } from "@openagentkit/sdk/protocol";
import type { z } from "zod";
import { type KitRequest, multimap } from "./request.ts";
import type { InvalidInputHandler } from "./routes.ts";

type RouteBody = NonNullable<NonNullable<RouteConfig["request"]>["body"]>;

export class InvalidInput extends Error {
	constructor(readonly error: z.ZodError) {
		super("请求参数不符合 Schema");
	}
}

function schema(value: unknown): z.ZodType | undefined {
	if (value && typeof value === "object" && "safeParseAsync" in value) return value as z.ZodType;
}

async function validate(value: unknown, input: unknown, invalid?: InvalidInputHandler): Promise<unknown> {
	const contract = schema(value);
	if (!contract) return input;
	const result = await contract.safeParseAsync(input);
	if (result.success) return result.data;
	invalid?.(result);
	throw new InvalidInput(result.error);
}

function mediaSchema(content: RouteBody["content"], mediaType: string) {
	const entry = content[mediaType];
	return entry && "schema" in entry ? entry.schema : undefined;
}

function parseJson(payload: Buffer): unknown {
	try {
		return JSON.parse(payload.toString("utf8"));
	} catch {
		// Node 的解析错误可能包含原始请求正文；此处只暴露固定错误消息。
		throw new KitError("invalid_request", "JSON 请求体格式无效");
	}
}

function requestMediaType(header?: string): string {
	const incomingType = header?.split(";")[0]?.trim().toLowerCase() ?? "";
	return /^application\/[a-z0-9!#$%&'*.^_`|~+-]+\+json$/.test(incomingType) ? "application/json" : incomingType;
}

async function validateBody(request: KitRequest, { content, required }: RouteBody, invalid?: InvalidInputHandler) {
	const mediaType = requestMediaType(request.header("content-type"));
	const payload = await request.body();
	const hasBody = Boolean(mediaType || payload.length);
	if (hasBody && !Object.hasOwn(content, mediaType)) {
		throw new Error("Unsupported Media Type");
	}
	const json = mediaSchema(content, "application/json");
	if (json) {
		const input = mediaType === "application/json" ? parseJson(payload) : {};
		request.validated.input = mediaType || required ? await validate(json, input, invalid) : input;
	}
	const multipart = mediaSchema(content, "multipart/form-data");
	if (multipart && (mediaType || required)) {
		const form = mediaType ? multimap(await request.formData()) : {};
		await validate(multipart, form, invalid);
	}
}

export async function validateRequest(request: KitRequest, route: RouteConfig, invalid?: InvalidInputHandler) {
	const spec = route.request;
	if (!spec) return;
	const { validated } = request;
	if (spec.query) validated.query = await validate(spec.query, request.rawQuery(), invalid);
	if (spec.params) validated.params = await validate(spec.params, request.raw.params ?? {}, invalid);
	if (spec.headers) validated.headers = await validate(spec.headers, request.raw.headers, invalid);
	if (spec.body) await validateBody(request, spec.body, invalid);
}
