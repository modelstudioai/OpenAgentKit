import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { KitError } from "@openagentkit/sdk/protocol";

export function requireInternalToken(name: string, value: string | undefined): string {
	if (!value || !/^[A-Za-z0-9_-]{32,256}$/.test(value)) throw new Error(`${name} 必须配置专用服务令牌`);
	return value;
}

export function authorized(request: IncomingMessage, token: string): boolean {
	const value = Buffer.from(request.headers.authorization ?? "");
	const expected = Buffer.from(`Bearer ${token}`);
	return value.length === expected.length && timingSafeEqual(value, expected);
}

export function sendJson(response: ServerResponse, status: number, data: unknown): void {
	response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
	response.end(JSON.stringify(data));
}

export async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
	const contentLength = Number(request.headers["content-length"]);
	if (contentLength > limit) throw new KitError("invalid_request", "请求体超过上限");
	const chunks: Buffer[] = [];
	let bytes = 0;
	for await (const chunk of request) {
		bytes += chunk.length;
		if (bytes > limit) throw new KitError("invalid_request", "请求体超过上限");
		chunks.push(chunk);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new KitError("invalid_request", "请求体必须为 JSON");
	}
}

export function errorBody(error: unknown) {
	if (error instanceof KitError) {
		return {
			code: error.code,
			message: error.message,
			retryable: error.retryable,
			...(error.details === undefined ? {} : { details: error.details }),
		};
	}
	return { code: "provider_error", message: "Provider 请求失败", retryable: true };
}
