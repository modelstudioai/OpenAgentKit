import { randomUUID, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSdkGateway } from "../../../src/gateway/sdk.ts";
import type { ProjectExecutionPlan, ProjectFeedback } from "../../../src/gateway/types.ts";
import type { YamlDraftStorage } from "../../../src/gateway/yaml-draft-document.ts";
import { PublicationError } from "../../../src/publication-error.ts";

const instanceId = randomUUID();
const sessionId = "sess_poc";
const draftId = "draft_poc";

function env(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`缺少 PoC 配置 ${name}`);
	return value;
}

function loopback(name: string) {
	const url = new URL(env(name));
	if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password)
		throw new Error(`PoC 仅支持回环地址 ${name}`);
	return url.href.replace(/\/$/, "");
}

const token = env("POC_INTERNAL_TOKEN");
const javaBase = loopback("POC_JAVA_BASE_URL");
const gateway = createSdkGateway({ apiKey: env("POC_STUB_TOKEN"), baseUrl: loopback("POC_BAILIAN_BASE_URL") });
const assetRoot = env("POC_ASSET_ROOT");
type Document = Awaited<ReturnType<YamlDraftStorage["read"]>>;

class HttpFailure extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
	) {
		super(code);
	}
}

function checkAuthorization(req: IncomingMessage) {
	const value = Buffer.from(req.headers.authorization ?? "");
	const expected = Buffer.from(`Bearer ${token}`);
	if (value.length !== expected.length || !timingSafeEqual(value, expected)) throw new HttpFailure(401, "unauthorized");
}

function json(res: ServerResponse, status: number, value: unknown) {
	if (res.destroyed || res.writableEnded) return;
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(value));
}

async function body<T>(request: IncomingMessage): Promise<T> {
	let size = 0;
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		size += chunk.length;
		if (size > 256 * 1024) throw new HttpFailure(413, "invalid_request");
		chunks.push(chunk);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
	} catch {
		throw new HttpFailure(400, "invalid_request");
	}
}

function documentStorage(
	document: Document,
	checkpoint?: (seq: number, state: string) => Promise<void>,
): YamlDraftStorage {
	let seq = 0;
	return {
		async read() {
			return { ...document };
		},
		write() {
			throw new HttpFailure(409, "immutable_fixture");
		},
		async writeState(state) {
			if (!checkpoint) throw new HttpFailure(409, "readonly_plan");
			await checkpoint(++seq, state);
			document = { ...document, sdk_state_json: state };
		},
	};
}

async function callback(operationId: string, suffix: string, method: string, value: Record<string, unknown>) {
	const response = await fetch(`${javaBase}/internal/poc/operations/${operationId}${suffix}`, {
		method,
		headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
		body: JSON.stringify({ ...value, instance_id: instanceId }),
		signal: AbortSignal.timeout(5000),
	});
	await response.body?.cancel();
	if (!response.ok) throw new HttpFailure(response.status, "callback_rejected");
}

async function execute(operationId: string, document: Document, expected: ProjectExecutionPlan) {
	await callback(operationId, "/claim", "POST", {});
	const storage = documentStorage(document, (seq, state) =>
		callback(operationId, `/checkpoints/${seq}`, "PUT", { sdk_state_json: state }),
	);
	const draft = gateway.resourceDraftDocument(draftId, assetRoot, storage);
	let report: Parameters<NonNullable<ProjectFeedback["publication"]>>[0] | undefined;
	let result: Record<string, unknown>;
	try {
		await draft.execute(expected, {
			log() {},
			progress() {},
			publication(value) {
				report = value;
			},
		});
		const bindings = await draft.publicationBindings();
		result = { publication: report, bindings };
	} catch (error) {
		const details =
			error instanceof PublicationError
				? error.errorDetails
				: {
						code: "publication.incomplete",
						phase: "execute",
						retryable: false,
						mutation_started: true,
					};
		const outcome = report?.outcome === "partial" ? "partial" : details.mutation_started ? "unknown" : "failed";
		result = {
			publication: {
				outcome,
				mutation_started: details.mutation_started,
				resources: report?.resources ?? [],
			},
			error_details: details,
		};
	}
	// 执行连接与回写独立。调用方断开执行请求时，SDK 仍可保存检查点与结果。
	await callback(operationId, "/result", "PUT", result);
}

async function sessionStream(res: ServerResponse) {
	const cancel = new AbortController();
	res.once("close", () => cancel.abort());
	res.writeHead(200, {
		"content-type": "text/event-stream; charset=utf-8",
		"cache-control": "no-cache",
		"x-accel-buffering": "no",
	});
	res.flushHeaders();
	try {
		for await (const event of gateway.streamEvents(sessionId, {
			signal: cancel.signal,
			onReady: () => {
				if (!cancel.signal.aborted) res.write(`event: ready\ndata: ${JSON.stringify({ session_id: sessionId })}\n\n`);
			},
		})) {
			if (cancel.signal.aborted) break;
			if (!res.write(`event: event\ndata: ${JSON.stringify(event)}\n\n`))
				await once(res, "drain", { signal: cancel.signal });
		}
	} finally {
		res.end();
	}
}

async function handle(req: IncomingMessage, res: ServerResponse) {
	checkAuthorization(req);
	const url = new URL(req.url ?? "/", "http://127.0.0.1");
	const sessionPath = `/internal/poc/sessions/${sessionId}`;
	switch (`${req.method} ${url.pathname}`) {
		case "GET /internal/poc/health":
			return json(res, 200, { instance_id: instanceId });
		case `GET ${sessionPath}/events`: {
			const pageToken = url.searchParams.get("page_token") ?? undefined;
			return json(res, 200, await gateway.listEvents(sessionId, { pageToken }));
		}
		case `GET ${sessionPath}/stream`:
			return sessionStream(res);
		case `POST ${sessionPath}/messages`: {
			const message = await body<{ text: string }>(req);
			return json(res, 200, await gateway.sendMessage(sessionId, { text: message.text }));
		}
		case `POST /internal/poc/drafts/${draftId}/plan`: {
			const document = await body<Document>(req);
			const draft = gateway.resourceDraftDocument(draftId, assetRoot, documentStorage(document));
			return json(res, 200, await draft.plan());
		}
	}
	const operationId = /^\/internal\/poc\/operations\/([a-f0-9-]{36})\/execute$/.exec(url.pathname)?.[1];
	if (req.method !== "POST" || !operationId) throw new HttpFailure(404, "not_found");
	const { document, expected } = await body<{ document: Document; expected: ProjectExecutionPlan }>(req);
	await execute(operationId, document, expected);
	json(res, 200, { acknowledged: true });
}

const server = createServer((req, res) => {
	void handle(req, res).catch((error: unknown) => {
		if (res.headersSent || res.destroyed) {
			res.destroy();
			return;
		}
		if (error instanceof HttpFailure) {
			json(res, error.status, { code: error.code });
			return;
		}
		const code =
			error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "provider_error";
		console.error("PoC Node 请求失败", code);
		json(res, 502, { code: "provider_error" });
	});
});
server.listen(0, "127.0.0.1", () => {
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("PoC Node 监听失败");
	process.stdout.write(`NODE_PORT ${address.port}\n`);
});
