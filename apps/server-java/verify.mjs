/** biome-ignore-all lint/suspicious/noUndeclaredEnvVars: 验收直接运行，不经过 Turborepo。 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	AGENT_ID,
	ENV_ID,
	REPLY,
	REPLY_ID,
	startBailian,
	startFaultProxy,
} from "../server/tests/java-sdk-poc/test/fixture.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const scratch = join(root, ".scratch", "java-server-tests");
const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin/java") : "java";
const jar = new URL("./target/kit-server-1.0.0-SNAPSHOT.jar", import.meta.url);
const bridge = new URL("../server/src/sdk-gateway/bin.ts", import.meta.url);
const loader = new URL("../server/node_modules/tsx/dist/loader.mjs", import.meta.url);
const draftYaml = await readFile(
	new URL("../server/tests/java-sdk-poc/src/main/resources/poc-draft.yaml", import.meta.url),
	"utf8",
);
const stream = "/api/kit/sessions/sess_poc/stream";
const internalStream = "/internal/sdk/v1/sessions/sess_poc/stream";
const execute = "/internal/sdk/v1/rpc/draftExecute";

async function check(fn, label, timeout = 12_000) {
	const stop = Date.now() + timeout;
	do {
		const value = await fn();
		if (value) return value;
		await delay(40);
	} while (Date.now() < stop);
	throw new Error(`等待超时 ${label}`);
}

async function port() {
	const server = createServer();
	await new Promise((accept, reject) => server.once("error", reject).listen(0, "127.0.0.1", accept));
	const result = server.address().port;
	await new Promise((accept) => server.close(accept));
	return result;
}

function launch(executable, args, env) {
	const child = spawn(executable, args, { env, cwd: root, stdio: ["ignore", "pipe", "pipe"] });
	let logs = "";
	let failure;
	child.on("error", (error) => {
		failure = error;
	});
	for (const channel of [child.stdout, child.stderr]) {
		channel.setEncoding("utf8");
		channel.on("data", (data) => {
			logs = (logs + data).slice(-9000);
		});
	}
	const ended = () => failure || child.exitCode !== null || child.signalCode !== null;
	return {
		sanity() {
			if (failure) throw failure;
			if (ended()) throw new Error(`测试进程提前退出\n${logs}`);
		},
		logs: () => logs,
		async stop(signal = "SIGTERM") {
			if (ended()) return;
			child.kill(signal);
			try {
				await check(ended, "子进程退出", 3000);
			} catch {
				child.kill("SIGKILL");
				await check(ended, "子进程强制退出", 4000);
			}
		},
	};
}

function token() {
	return randomBytes(32).toString("base64url");
}

async function runtime() {
	await mkdir(scratch, { recursive: true });
	const directory = await mkdtemp(join(scratch, "run-"));
	const providerToken = token();
	const gatewayToken = token();
	const callbackToken = token();
	const adminToken = token();
	const confirm = token();
	const fixture = await startBailian(providerToken);
	const proxy = await startFaultProxy();
	const publicPort = await port();
	const callbackPort = await port();
	const origin = `http://127.0.0.1:${publicPort}`;
	const admin = { authorization: `Bearer ${adminToken}` };
	const member = { cookie: "kit_subject=anon_java_fixture", "x-kit-protocol-version": "2.0.0" };
	const services = [];
	const base = {
		PATH: process.env.PATH,
		JAVA_HOME: process.env.JAVA_HOME,
		TMPDIR: process.env.TMPDIR,
		KIT_SDK_GATEWAY_TOKEN: gatewayToken,
		KIT_SDK_CALLBACK_TOKEN: callbackToken,
		KIT_SDK_CALLBACK_PORT: String(callbackPort),
	};
	let node;
	let app;

	async function startNode() {
		const nodePort = await port();
		node = launch(process.execPath, ["--import", loader.href, fileURLToPath(bridge)], {
			...base,
			KIT_GATEWAY: "sdk",
			KIT_SDK_PORT: String(nodePort),
			BAILIAN_API_KEY: providerToken,
			BAILIAN_BASE_URL: fixture.url,
			KIT_SDK_TEMP_DIR: join(directory, "bridge-temp"),
			KIT_SDK_ASSET_DIR: join(directory, "resource-draft-uploads"),
		});
		services.push(node);
		const origin = `http://127.0.0.1:${nodePort}`;
		await check(async () => {
			node.sanity();
			return fetch(origin + "/internal/sdk/v1/health", { headers: { authorization: `Bearer ${gatewayToken}` } })
				.then((response) => response.ok)
				.catch(() => false);
		}, "Node SDK 就绪");
		proxy.target(origin);
	}

	async function startApp() {
		app = launch(java, ["-jar", fileURLToPath(jar)], {
			...base,
			PORT: String(publicPort),
			KIT_SDK_URL: proxy.origin,
			KIT_DATA_DIR: directory,
			KIT_DB_DRIVER: "sqlite",
			KIT_AUTH_MODE: "anonymous",
			KIT_RATE_LIMIT_RPS: "0",
			KIT_CONFIRM_SECRET: confirm,
			ADMIN_TOKEN: adminToken,
		});
		services.push(app);
		await check(async () => {
			app.sanity();
			return fetch(origin + "/healthz")
				.then((response) => response.ok)
				.catch(() => false);
		}, "Spring Boot 就绪");
	}

	async function close() {
		for (const service of services.slice().reverse()) await service.stop();
		await proxy.close();
		await fixture.close();
	}

	try {
		await startNode();
		await startApp();
	} catch (error) {
		await close();
		throw error;
	}

	function database(work) {
		const db = new DatabaseSync(join(directory, "kit.sqlite"));
		try {
			return work(db);
		} finally {
			db.close();
		}
	}

	async function api(path, options = {}) {
		const { method = "GET", body, auth = admin, expected = 200 } = options;
		const response = await fetch(origin + path, {
			method,
			headers: { ...auth, ...(body === undefined ? {} : { "content-type": "application/json" }) },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		const json = await response.json();
		assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(json)}`);
		return json;
	}

	return {
		origin,
		fixture,
		proxy,
		database,
		api,
		member,
		admin,
		close,
		restartJava: async () => {
			await app.stop();
			await startApp();
		},
		restartNode: async () => {
			await node.stop("SIGKILL");
			await startNode();
		},
	};
}

function parseFrame(value) {
	const lines = value.split("\n");
	const event = lines
		.find((line) => line.startsWith("event:"))
		?.slice(6)
		.trim();
	const id = lines
		.find((line) => line.startsWith("id:"))
		?.slice(3)
		.trim();
	const data = lines
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5))
		.join("\n");
	return event && data ? { event, id, data: JSON.parse(data) } : null;
}

function collectFrames(buffer, events, queue) {
	let separator = buffer.indexOf("\n\n");
	while (separator >= 0) {
		const frame = parseFrame(buffer.slice(0, separator));
		if (frame) {
			events.push(frame);
			queue.push(frame);
		}
		buffer = buffer.slice(separator + 2);
		separator = buffer.indexOf("\n\n");
	}
	return buffer;
}

async function openStream(origin, path, headers) {
	const controller = new AbortController();
	const response = await fetch(origin + path, { signal: controller.signal, headers });
	assert.equal(response.status, 200, await (response.status === 200 ? Promise.resolve("") : response.text()));
	assert.match(response.headers.get("content-type"), /text\/event-stream/);
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	const events = [];
	const queue = [];
	let buffered = "";
	let done = false;
	void (async () => {
		try {
			for (;;) {
				const result = await reader.read();
				if (result.done) break;
				buffered = collectFrames(buffered + decoder.decode(result.value, { stream: true }), events, queue);
			}
		} catch (error) {
			if (!controller.signal.aborted) console.error("SSE 读取失败", error.name);
		} finally {
			done = true;
		}
	})();
	return {
		events,
		close: () => controller.abort(),
		next: (test) =>
			check(() => {
				const point = queue.findIndex(test);
				if (point < 0) {
					if (done) throw new Error(`SSE 提前结束，收到帧 ${events.map((frame) => frame.event)}`);
					return null;
				}
				return queue.splice(0, point + 1).at(-1);
			}, "SSE 帧"),
	};
}

async function sessionScenario(mode) {
	const test = await runtime();
	let client;
	try {
		const now = new Date().toISOString();
		test.database((db) =>
			db
				.prepare(
					"INSERT INTO kit_sessions (session_id,subject_id,purpose,agent_slug,status,created_at,last_event_at) " +
						"VALUES ('sess_poc','anon_java_fixture','experience','fixture','idle',?,?)",
				)
				.run(now, now),
		);
		client = await openStream(test.origin, stream, test.member);
		const initial = await client.next((frame) => frame.event === "ready");
		assert.equal(initial.data.replayed, 2);
		await test.api("/api/kit/sessions/sess_poc/messages", {
			method: "POST",
			auth: test.member,
			body: { text: "续传测试", client_message_id: "fixture-send" },
			expected: 202,
		});
		test.fixture.partial();
		const intermediate = await client.next((frame) => frame.event === "event" && frame.data.event_id === REPLY_ID);
		if (mode === "browser") {
			const status = () =>
				test.database((db) => db.prepare("SELECT status FROM kit_sessions WHERE session_id='sess_poc'").get().status);
			assert.equal(status(), "running");
			client.close();
			test.fixture.complete();
			await check(() => status() === "idle", "Java 在客户端断开期间接收完成事件");
			client = await openStream(test.origin, stream + "?after=" + encodeURIComponent(intermediate.id), test.member);
		} else {
			test.proxy.cut(internalStream, true);
			await check(() => test.fixture.activeSubscriptions() === 0, "Provider 实际连接释放");
			test.fixture.complete();
			test.proxy.unblock(internalStream);
			await client.next((frame) => frame.event === "reset");
		}
		const reply = await client.next(
			(frame) =>
				frame.event === "event" &&
				frame.data.event_id === REPLY_ID &&
				frame.data.content?.some((part) => part.text === REPLY),
		);
		const ready = await client.next((frame) => frame.event === "ready");
		if (mode === "browser") {
			assert.equal(ready.data.after, intermediate.id);
			assert.equal(test.fixture.connections(), 1);
		}
		assert.equal(reply.id.split(":")[0] === intermediate.id.split(":")[0], mode === "browser");
		assert.deepEqual(test.fixture.writes(), ["/sessions/sess_poc/events"]);
		await test.api("/api/kit/sessions/sess_poc/messages", {
			method: "POST",
			auth: test.member,
			body: { text: "续传测试", client_message_id: "fixture-send" },
			expected: 202,
		});
		await test.api("/api/kit/sessions/sess_poc/messages", {
			method: "POST",
			auth: test.member,
			body: { text: "相同标识的不同消息", client_message_id: "fixture-send" },
			expected: 409,
		});
		assert.equal(test.fixture.writes().length, 1);
		process.stdout.write(`会话 ${mode} 通过，游标 ${reply.id}，消息写入 1 次\n`);
	} finally {
		client?.close();
		await test.close();
	}
}

async function publishScenario(mode) {
	const test = await runtime();
	try {
		const root = "/api/admin/resource-drafts";
		const key = { ...test.admin, "x-kit-draft-key": randomUUID() };
		const { data: draft } = await test.api(root, { method: "POST", auth: key });
		const prefix = root + "/" + draft.draft_id;
		test.database((db) =>
			db.prepare("UPDATE kit_resource_draft_documents SET yaml=? WHERE draft_id=?").run(draftYaml, draft.draft_id),
		);
		const { data: plan } = await test.api(prefix + "/resources/plan", { method: "POST", body: { action: "publish" } });
		assert.equal(plan.diff.length, 2);
		const confirmation = { plan_id: plan.plan_id, confirm_token: plan.confirm_token };
		if (mode === "reply") test.proxy.delayReply(execute);
		const { data } = await test.api(prefix + "/resources/publish", {
			method: "POST",
			body: confirmation,
			expected: 202,
		});
		const operation = "/api/admin/operations/" + data.operation_id;
		await check(() => test.fixture.agentApplied(), "Provider 已受理 Agent", 25_000);
		const checkpoint = () =>
			test.database(
				(db) =>
					db.prepare("SELECT COUNT(*) AS n FROM kit_sdk_checkpoints " + "WHERE operation_id=?").get(data.operation_id)
						.n,
			);
		assert.ok(checkpoint() > 0);
		if (mode === "reply") {
			test.proxy.cut(execute);
			test.fixture.releaseAgent();
		} else if (mode === "java-restart") {
			await test.restartJava();
			assert.equal((await test.api(operation)).data.status, "running");
			test.fixture.releaseAgent();
		} else {
			await test.restartNode();
		}
		const result = await check(
			async () => {
				const { data } = await test.api(operation);
				return ["succeeded", "failed"].includes(data.status) && data;
			},
			"原 Operation 终态",
			25_000,
		);
		const observer = await openStream(test.origin, `${operation}/events`, test.admin);
		try {
			const snapshot = await observer.next((frame) => frame.event === "operation");
			assert.equal(snapshot.data.operation_id, data.operation_id);
			assert.equal(snapshot.data.status, result.status);
			assert.equal((await observer.next((frame) => frame.event === "done")).data.status, result.status);
		} finally {
			observer.close();
		}
		const { data: published } = await test.api(prefix);
		if (mode !== "node-restart") {
			assert.equal(result.status, "succeeded", JSON.stringify(result));
			assert.deepEqual(new Set(published.resources.map((binding) => binding.remote_id)), new Set([ENV_ID, AGENT_ID]));
			await test.restartJava();
			assert.equal((await test.api(operation)).data.status, "succeeded");
		} else {
			assert.equal(result.publication.outcome, "unknown");
			assert.ok(result.publication.resources.some((entry) => entry.remote_id === ENV_ID));
			assert.equal(published.recovery_action, "read_result");
		}
		await test.api(prefix + "/resources/publish", { method: "POST", body: confirmation, expected: 428 });
		assert.deepEqual(test.fixture.writes(), ["/environments", "/agents"]);
		process.stdout.write(
			`发布 ${mode} 通过，${data.operation_id}，${checkpoint()} 个检查点，两个 Provider 创建各 1 次\n`,
		);
	} finally {
		await test.close();
	}
}

await sessionScenario("browser");
await sessionScenario("node-stream");
await publishScenario("reply");
await publishScenario("java-restart");
await publishScenario("node-restart");
