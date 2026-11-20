import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { KitError } from "@openagentkit/sdk/protocol";
import { loadConfig } from "../config.ts";
import { createMockGateway } from "../gateway/mock.ts";
import { createSdkGateway } from "../gateway/sdk.ts";
import { createDraftTransport } from "./drafts.ts";
import { authorized, errorBody, readJson, requireInternalToken, sendJson } from "./http.ts";
import { providerMethods, streamProvider, upload } from "./provider.ts";

const env = process.env;
const token = requireInternalToken("KIT_SDK_GATEWAY_TOKEN", env.KIT_SDK_GATEWAY_TOKEN);
const config = loadConfig({
	KIT_GATEWAY: env.KIT_GATEWAY,
	BAILIAN_API_KEY: env.BAILIAN_API_KEY,
	BAILIAN_BASE_URL: env.BAILIAN_BASE_URL,
	BAILIAN_WORKSPACE_ID: env.BAILIAN_WORKSPACE_ID,
	KIT_DATA_DIR: env.KIT_SDK_TEMP_DIR,
	KIT_BODY_LIMIT_BYTES: env.KIT_BODY_LIMIT_BYTES,
	KIT_UPLOAD_MAX_BYTES: env.KIT_UPLOAD_MAX_BYTES,
	KIT_MOCK_FILE_SCAN_DELAY_MS: env.KIT_MOCK_FILE_SCAN_DELAY_MS,
});
const gateway =
	config.resolvedGateway === "sdk"
		? createSdkGateway(config.bailian!)
		: createMockGateway({ fileScanDelayMs: config.mockFileScanDelayMs });
const methods = providerMethods(gateway);
const instanceId = randomUUID();
const draftMethods = createDraftTransport(gateway, instanceId, config.uploadMaxBytes);
const prefix = "/internal/sdk/v1";
const port = Number(env.KIT_SDK_PORT ?? 8791);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("KIT_SDK_PORT 无效");

async function invoke(rpc: string, request: IncomingMessage, response: ServerResponse) {
	const transferLimit = Math.ceil((config.uploadMaxBytes * 4) / 3) + 4096;
	if (rpc === "uploadFile") {
		const input = await readJson(request, transferLimit);
		sendJson(response, 200, { data: await upload(gateway, input, config.uploadMaxBytes) });
		return;
	}
	const args = await readJson(request, rpc === "draftStage" ? transferLimit : config.bodyLimitBytes);
	if (!Array.isArray(args)) throw new KitError("invalid_request", "RPC 参数必须为数组");
	if (rpc === "downloadFile" && typeof args[0] === "string") {
		const file = await gateway.downloadFile(args[0]);
		response.writeHead(200, {
			"content-type": "application/octet-stream",
			"content-length": file.body.byteLength,
			"x-kit-filename": encodeURIComponent(file.filename),
			"x-kit-content-type": file.contentType,
		});
		response.end(file.body);
		return;
	}
	const method = draftMethods.get(rpc) ?? methods.get(rpc as Parameters<typeof methods.get>[0]);
	if (!method) throw new KitError("not_found", "内部接口不存在");
	sendJson(response, 200, { data: (await method(...args)) ?? null });
}

function respondError(response: ServerResponse, error: unknown) {
	if (response.headersSent) response.destroy();
	else sendJson(response, error instanceof KitError ? error.status : 502, { error: errorBody(error) });
}

const server = createServer(async (request, response) => {
	if (!authorized(request, token)) {
		sendJson(response, 401, { error: { code: "unauthorized", message: "内部服务认证失败", retryable: false } });
		return;
	}
	try {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		if (request.method === "GET" && url.pathname === `${prefix}/health`) {
			sendJson(response, 200, { data: { instance_id: instanceId, version: 1, mode: gateway.mode } });
			return;
		}
		const session = url.pathname.match(/^\/internal\/sdk\/v1\/sessions\/([^/]+)\/stream$/);
		if (request.method === "GET" && session) {
			await streamProvider(
				gateway,
				response,
				decodeURIComponent(session[1]!),
				url.searchParams.get("after_id") ?? undefined,
			);
			return;
		}
		const rpc = url.pathname.match(/^\/internal\/sdk\/v1\/rpc\/([a-zA-Z]+)$/)?.[1];
		if (request.method !== "POST" || !rpc) throw new KitError("not_found", "内部接口不存在");
		await invoke(rpc, request, response);
	} catch (error) {
		respondError(response, error);
	}
});
server.listen(port, "127.0.0.1", () => {
	const address = server.address();
	if (address && typeof address !== "string") {
		process.stdout.write(`[kit-sdk-gateway] http://127.0.0.1:${address.port}\n`);
	}
});
