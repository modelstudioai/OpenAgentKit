import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request } from "node:http";

export const ENV_ID = "env_poc_created";
export const AGENT_ID = "agent_poc_created";
export const REPLY_ID = "sevt_poc_reply";
export const REPLY = "断线之后的完整正文";
const MESSAGE_ID = "sevt_poc_user";
const SESSION = "/sessions/sess_poc/events";
const BAILIAN_PREFIX = "/api/v1/agentstudio";

async function listen(handler) {
	const server = createServer(handler);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	return {
		origin: `http://127.0.0.1:${server.address().port}`,
		async close() {
			const stopped = new Promise((resolve) => server.close(resolve));
			server.closeAllConnections();
			await stopped;
		},
	};
}

function json(res, status, body) {
	if (res.destroyed) return;
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify(body));
}

async function readJson(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function event(id, type, content, role) {
	return {
		id,
		object: "message",
		status: "completed",
		created_at: "2026-11-19T00:00:00.000Z",
		type,
		content,
		...(role ? { role } : {}),
	};
}

export async function startBailian(token) {
	const subscriptions = new Set();
	const events = [
		event("sevt_poc_old_1", "message", [{ type: "text", text: "第一段历史" }], "user"),
		event("sevt_poc_old_2", "message", [{ type: "text", text: "第二段历史" }], "assistant"),
	];
	const calls = [];
	const agentReplies = new Set();
	const resources = new Map();
	let connections = 0;

	function push(raw) {
		for (const res of subscriptions) res.write(`data: ${JSON.stringify(raw)}\n\n`);
	}

	async function handle(req, res) {
		const url = new URL(req.url, "http://127.0.0.1");
		if (req.headers.authorization !== `Bearer ${token}` || !url.pathname.startsWith(`${BAILIAN_PREFIX}/`)) {
			json(res, 401, { code: "Unauthorized" });
			return;
		}
		const path = url.pathname.slice(BAILIAN_PREFIX.length);
		calls.push({ method: req.method, path, page: url.searchParams.get("page") });
		switch (`${req.method} ${path}`) {
			case `GET ${SESSION}/stream`:
				res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
				res.write(": local fixture\n\n");
				connections++;
				subscriptions.add(res);
				res.on("close", () => subscriptions.delete(res));
				return;
			case `GET ${SESSION}`:
				if (url.searchParams.get("page") === "fixture-page-2") {
					json(res, 200, { data: events.slice(1), has_more: false });
				} else {
					json(res, 200, { data: events.slice(0, 1), has_more: true, next_page: "fixture-page-2" });
				}
				return;
			case `POST ${SESSION}`: {
				const body = await readJson(req);
				const user = event(MESSAGE_ID, "message", body.input[0].content, "user");
				events.push(user);
				push(user);
				return json(res, 200, { id: MESSAGE_ID });
			}
			case "GET /agents":
			case "GET /environments":
				return json(res, 200, { data: [], has_more: false });
			case "POST /environments": {
				const body = await readJson(req);
				const environment = { ...body, id: ENV_ID };
				resources.set(`/environments/${ENV_ID}`, environment);
				return json(res, 201, environment);
			}
			case "POST /agents": {
				const body = await readJson(req);
				assert.ok(resources.has(`/environments/${ENV_ID}`), "SDK 应先创建声明依赖的 Environment");
				const agent = { ...body, id: AGENT_ID, version: 1 };
				resources.set(`/agents/${AGENT_ID}`, agent);
				const held = { res, agent };
				agentReplies.add(held);
				res.on("close", () => agentReplies.delete(held));
				return;
			}
		}
		if (req.method === "GET" && resources.has(path)) return json(res, 200, resources.get(path));
		console.error("本地百炼替身遇到未预期的接口", req.method, path);
		json(res, 404, { code: "NotFound" });
	}

	const server = await listen((req, res) => {
		void handle(req, res).catch((error) => {
			console.error("本地百炼替身拒绝请求", error.message);
			json(res, 400, { code: "FixtureRequestRejected" });
		});
	});
	return {
		...server,
		url: server.origin + BAILIAN_PREFIX,
		calls,
		connections: () => connections,
		activeSubscriptions: () => subscriptions.size,
		writes: () => calls.filter((call) => call.method === "POST").map((call) => call.path),
		agentApplied: () => resources.has(`/agents/${AGENT_ID}`),
		releaseAgent() {
			assert.equal(agentReplies.size, 1, "替身应扣住一个 Agent 写入响应");
			for (const { res, agent } of agentReplies) json(res, 201, agent);
		},
		partial() {
			assert.ok(subscriptions.size > 0, "SDK 应已建立真实 HTTP 流");
			push({
				type: "event_start",
				event: { id: REPLY_ID, type: "message" },
				object: "message",
				status: "in_progress",
			});
			push({
				type: "event_delta",
				event_id: REPLY_ID,
				delta: { type: "content_delta", index: 0, content: { type: "text", text: "断线" } },
				object: "content",
				status: "in_progress",
			});
		},
		complete() {
			const final = event(REPLY_ID, "message", [{ type: "text", text: REPLY }], "assistant");
			const idle = event("sevt_poc_idle", "session_status", [{ type: "data", data: { session_status: "idle" } }]);
			events.push(final, idle);
			push(final);
			push(idle);
		},
	};
}

export async function startFaultProxy() {
	let target;
	const active = new Set();
	const blocked = new Set();
	const delayedReplies = new Set();
	const calls = [];
	const server = await listen((req, res) => {
		const path = new URL(req.url, "http://127.0.0.1").pathname;
		calls.push({ method: req.method, path });
		if (!target || blocked.has(path)) {
			json(res, 503, { code: "fixture_link_unavailable" });
			return;
		}
		const url = new URL(req.url, target);
		const upstream = request(url, {
			method: req.method,
			headers: { ...req.headers, host: url.host },
		});
		const flow = { path, res, upstream };
		active.add(flow);
		upstream.on("response", (reply) => {
			if (delayedReplies.has(path)) {
				reply.resume();
				return;
			}
			res.writeHead(reply.statusCode ?? 502, reply.headers);
			res.flushHeaders();
			reply.on("error", () => res.destroy());
			reply.pipe(res);
		});
		upstream.on("error", () => {
			if (res.headersSent) res.destroy();
			else json(res, 502, { code: "fixture_upstream_unavailable" });
		});
		res.on("close", () => {
			active.delete(flow);
			upstream.destroy();
		});
		req.on("aborted", () => upstream.destroy());
		req.pipe(upstream);
	});
	return {
		...server,
		calls,
		target(origin) {
			target = origin;
		},
		delayReply(path) {
			delayedReplies.add(path);
		},
		active(path) {
			return [...active].filter((flow) => flow.path === path).length;
		},
		cut(path, hold = false) {
			if (hold) blocked.add(path);
			const flows = [...active].filter((flow) => flow.path === path);
			assert.ok(flows.length > 0, `没有可注入故障的 HTTP 连接 ${path}`);
			for (const { res, upstream } of flows) {
				res.destroy();
				upstream.destroy();
			}
		},
		unblock(path) {
			blocked.delete(path);
		},
	};
}
