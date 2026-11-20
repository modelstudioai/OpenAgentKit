import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { AGENT_ID, ENV_ID, REPLY, REPLY_ID, startBailian, startFaultProxy } from "./test/fixture.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, "../../../..");
const scratch = join(repo, ".scratch", "java-sdk-poc");
const tools = join(scratch, ".toolchain");
const javaHome = process.env.POC_JAVA_HOME ?? join(tools, "java11", "Contents", "Home");
const java = join(javaHome, "bin", "java");
const maven = process.env.POC_MAVEN ?? join(tools, "apache-maven-3.9.11", "bin", "mvn");
const jar = join(scratch, "target", "java-sdk-poc-0.1.0.jar");
const serverPackage = join(repo, "apps", "server", "node_modules");
const loader = join(serverPackage, "tsx", "dist", "loader.mjs");
const fixtureSession = "/api/kit/sessions/sess_poc";
const upstreamStream = "/internal/poc/sessions/sess_poc/stream";
const draft = "/api/admin/resource-drafts/draft_poc";
const sessionPosts = ["/sessions/sess_poc/events"];
const resourcePosts = ["/environments", "/agents"];

async function until(check, label, timeout = 12_000) {
	const deadline = Date.now() + timeout;
	for (;;) {
		const value = await check();
		if (value) return value;
		if (Date.now() >= deadline) throw new Error(`等待超时 ${label}`);
		await delay(40);
	}
}

function launch(executable, args, env) {
	const proc = spawn(executable, args, {
		cwd: root,
		env: { ...process.env, ...env },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let logs = "";
	let failed;
	for (const stream of [proc.stdout, proc.stderr]) {
		stream.setEncoding("utf8");
		stream.on("data", (data) => {
			logs = (logs + data).slice(-9500);
		});
	}
	proc.on("error", (error) => {
		failed = error;
	});
	const stopped = () => proc.exitCode !== null || proc.signalCode !== null || failed;
	return {
		logs: () => logs,
		async port(marker) {
			return until(
				() => {
					if (failed) throw failed;
					if (stopped()) throw new Error(`PoC 进程提前退出 ${marker}\n${logs}`);
					const match = new RegExp(`${marker} (\\d+)`).exec(logs);
					return match ? Number(match[1]) : null;
				},
				marker,
				20_000,
			);
		},
		async stop(signal = "SIGTERM") {
			if (stopped()) return;
			proc.kill(signal);
			try {
				await until(stopped, "PoC 进程退出", 4000);
			} catch {
				proc.kill("SIGKILL");
				await until(stopped, "PoC 进程强制退出", 4000);
			}
		},
	};
}

async function startCase(directory) {
	const assets = join(directory, "assets");
	await mkdir(assets);
	const credentials = Object.fromEntries(
		["MEMBER_TOKEN", "ADMIN_TOKEN", "INTERNAL_TOKEN", "CONFIRM_SECRET", "STUB_TOKEN"].map((name) => [
			`POC_${name}`,
			randomBytes(32).toString("hex"),
		]),
	);
	const provider = await startBailian(credentials.POC_STUB_TOKEN);
	const proxy = await startFaultProxy();
	const children = [];
	const dbPath = join(directory, "kit.sqlite");
	let boot;
	let bridge;
	let javaOrigin;
	let nodeOrigin;
	let javaPort;
	const headers = (role) => ({
		authorization: `Bearer ${credentials[`POC_${role}_TOKEN`]}`,
		"x-kit-protocol-version": "2.0.0",
	});

	async function startJava() {
		boot = launch(java, ["-jar", jar, "--server.address=127.0.0.1", `--server.port=${javaPort ?? 0}`], {
			POC_MEMBER_TOKEN: credentials.POC_MEMBER_TOKEN,
			POC_ADMIN_TOKEN: credentials.POC_ADMIN_TOKEN,
			POC_INTERNAL_TOKEN: credentials.POC_INTERNAL_TOKEN,
			POC_CONFIRM_SECRET: credentials.POC_CONFIRM_SECRET,
			POC_DB_PATH: dbPath,
			POC_NODE_BASE_URL: proxy.origin,
		});
		children.push(boot);
		javaPort = await boot.port("JAVA_PORT");
		javaOrigin = `http://127.0.0.1:${javaPort}`;
		const health = await call("GET", "/healthz", "MEMBER", undefined, 200);
		assert.match(health.java_version, /^11\./);
		assert.equal(health.spring_boot, "2.7.18");
	}

	async function startNode() {
		bridge = launch(process.execPath, ["--import", loader, join(root, "node", "bridge.ts")], {
			POC_INTERNAL_TOKEN: credentials.POC_INTERNAL_TOKEN,
			POC_STUB_TOKEN: credentials.POC_STUB_TOKEN,
			POC_BAILIAN_BASE_URL: provider.url,
			POC_JAVA_BASE_URL: javaOrigin,
			POC_ASSET_ROOT: assets,
		});
		children.push(bridge);
		nodeOrigin = `http://127.0.0.1:${await bridge.port("NODE_PORT")}`;
		proxy.target(nodeOrigin);
	}

	async function call(method, path, role, body, expected) {
		const response = await fetch(javaOrigin + path, {
			method,
			headers: { ...headers(role), ...(body ? { "content-type": "application/json" } : {}) },
			...(body ? { body: JSON.stringify(body) } : {}),
			signal: AbortSignal.timeout(7000),
		});
		const data = response.status === 204 ? {} : await response.json();
		assert.equal(response.status, expected, `${method} ${path} ${JSON.stringify(data.error ?? {})}`);
		return data.data ?? data;
	}

	async function openStream(after) {
		const controller = new AbortController();
		const path = `${fixtureSession}/stream${after ? `?after=${encodeURIComponent(after)}` : ""}`;
		const response = await fetch(javaOrigin + path, {
			headers: { ...headers("MEMBER"), accept: "text/event-stream" },
			signal: AbortSignal.any([controller.signal, AbortSignal.timeout(18_000)]),
		});
		assert.equal(response.status, 200);
		assert.match(response.headers.get("content-type"), /text\/event-stream/);
		const frames = readFrames(response.body);
		return {
			close: () => controller.abort(),
			async until(test) {
				const received = [];
				for (;;) {
					const next = await frames.next();
					assert.ok(!next.done, "SSE 在收到预期帧前结束");
					received.push(next.value);
					if (test(next.value)) return received;
				}
			},
		};
	}

	async function close() {
		for (const child of children.reverse()) await child.stop();
		await proxy.close();
		await provider.close();
	}

	try {
		await startJava();
		await startNode();
	} catch (error) {
		for (const child of children) console.error(child.logs());
		await close();
		throw error;
	}

	return {
		provider,
		proxy,
		call,
		openStream,
		close,
		childLogs: () =>
			children
				.map((child) => child.logs())
				.filter(Boolean)
				.join("\n"),
		instance: async () => {
			const response = await fetch(`${nodeOrigin}/internal/poc/health`, {
				headers: headers("INTERNAL"),
				signal: AbortSignal.timeout(3000),
			});
			assert.equal(response.status, 200);
			return (await response.json()).instance_id;
		},
		stopNode: () => bridge.stop("SIGKILL"),
		startNode,
		async restartJava() {
			await boot.stop();
			await startJava();
		},
		checkpoint(operationId) {
			const sqlite = new DatabaseSync(dbPath, { readOnly: true });
			try {
				const row = sqlite
					.prepare("SELECT seq, sdk_state_json FROM checkpoints WHERE operation_id = ? ORDER BY seq DESC LIMIT 1")
					.get(operationId);
				return row ? { sequence: row.seq, state: JSON.parse(row.sdk_state_json), stateJson: row.sdk_state_json } : null;
			} finally {
				sqlite.close();
			}
		},
	};
}

async function* readFrames(body) {
	let pending = "";
	for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
		pending += chunk;
		for (;;) {
			const separator = /\r?\n\r?\n/.exec(pending);
			if (!separator) break;
			const frame = parseFrame(pending.slice(0, separator.index));
			pending = pending.slice(separator.index + separator[0].length);
			if (frame) yield frame;
		}
	}
}

function parseFrame(block) {
	let type;
	let id;
	const data = [];
	for (const line of block.split(/\r?\n/)) {
		if (line.startsWith("event:")) type = line.slice(6).trimStart();
		else if (line.startsWith("id:")) id = line.slice(3).trimStart();
		else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
	}
	return type && data.length ? { type, id, data: JSON.parse(data.join("\n")) } : null;
}

const ready = (frame) => frame.type === "ready";
const isReply = (frame) => frame.type === "event" && frame.data.event_id === REPLY_ID;
const textOf = (frame) => frame.data.content?.find((block) => block.type === "text")?.text;
const finalReply = (frame) =>
	isReply(frame) && frame.data.metadata?.event_status === "completed" && textOf(frame) === REPLY;

async function beginSession(test) {
	const { call, openStream, provider, proxy } = test;
	await call("POST", `${fixtureSession}/messages`, "MEMBER", { text: "先发" }, 409);
	const stream = await openStream();
	const initial = await stream.until(ready);
	assert.deepEqual(
		initial.map((frame) => frame.type),
		["reset", "event", "event", "ready"],
	);
	assert.equal(initial[2].data.event_id, "sevt_poc_old_2");
	assert.equal(provider.connections(), 1, "首次水合应使用一个真实 SDK 订阅");
	assert.equal(proxy.active(upstreamStream), 1);
	const sent = await call("POST", `${fixtureSession}/messages`, "MEMBER", { text: "一次会话请求" }, 200);
	assert.deepEqual(sent.event_ids, ["sevt_poc_user"]);
	provider.partial();
	const partial = (await stream.until((frame) => isReply(frame) && textOf(frame) === "断线")).at(-1);
	assert.equal(textOf(partial), "断线");
	assert.equal(partial.data.metadata.event_status, "in_progress");
	assert.match(partial.id, /^[a-f0-9-]+:\d+$/);
	return { stream, cursor: partial.id };
}

async function clientResume(test) {
	const { stream, cursor } = await beginSession(test);
	stream.close();
	test.provider.complete();
	const frames = await until(async () => {
		const resumed = await test.openStream(cursor);
		try {
			const received = await resumed.until(ready);
			return received.some(finalReply) ? received : null;
		} finally {
			resumed.close();
		}
	}, "客户端得到回放中的最终快照");
	const final = frames.find(finalReply);
	assert.equal(
		frames.some((frame) => frame.type === "reset"),
		false,
	);
	assert.equal(frames.at(-1).data.after, cursor);
	assert.ok(frames.at(-1).data.replayed > 0);
	assert.equal(final.id.split(":")[0], cursor.split(":")[0]);
	assert.ok(Number(final.id.split(":")[1]) > Number(cursor.split(":")[1]));
	assert.equal(test.provider.connections(), 1);
	assert.deepEqual(test.provider.writes(), sessionPosts);
	return { after: cursor, final_cursor: final.id, provider_posts: test.provider.writes() };
}

async function upstreamResume(test) {
	const { stream, cursor } = await beginSession(test);
	try {
		test.proxy.cut(upstreamStream, true);
		await until(() => test.provider.activeSubscriptions() === 0, "Java 断开后 Node 释放 SDK 订阅");
		test.provider.complete();
		test.proxy.unblock(upstreamStream);
		const frames = await stream.until(ready);
		assert.equal(frames[0].type, "reset");
		assert.equal(frames.filter(isReply).length, 1);
		const final = frames.find(finalReply);
		assert.ok(final, "新的水合结果应包含断线期间的最终快照");
		assert.notEqual(final.id.split(":")[0], cursor.split(":")[0]);
		assert.ok(test.provider.calls.filter((call) => call.page === "fixture-page-2").length >= 2);
		assert.equal(test.provider.connections(), 2);
		assert.deepEqual(test.provider.writes(), sessionPosts);
		return { previous_cursor: cursor, reset_cursor: final.id, provider_posts: test.provider.writes() };
	} finally {
		stream.close();
	}
}

async function beginPublication(test) {
	const { call, provider } = test;
	const plan = await call("POST", `${draft}/resources/plan`, "ADMIN", { action: "publish" }, 200);
	assert.deepEqual(plan.diff.map((item) => item.resource).sort(), ["agent:poc-agent", "environment:poc-env"]);
	assert.ok(plan.diff.every((item) => item.action === "create"));
	const confirmation = { plan_id: plan.plan_id, confirm_token: plan.confirm_token };
	await call("POST", `${draft}/resources/publish`, "ADMIN", { ...confirmation, confirm_token: "invalid" }, 428);
	assert.deepEqual(provider.writes(), [], "预览和无效令牌不触发百炼写入");
	const { operation_id: operationId } = await call("POST", `${draft}/resources/publish`, "ADMIN", confirmation, 202);
	await until(provider.agentApplied, "替身已创建 Agent 并扣住响应");
	const checkpoint = test.checkpoint(operationId);
	assert.ok(checkpoint);
	assert.deepEqual(
		checkpoint.state.resources.map((row) => row.remote_id),
		[ENV_ID],
	);
	assert.deepEqual(provider.writes(), resourcePosts);
	const checkpointPath = `/internal/poc/operations/${operationId}/checkpoints/${checkpoint.sequence}`;
	const replay = { instance_id: await test.instance(), sdk_state_json: checkpoint.stateJson };
	await call("PUT", checkpointPath, "INTERNAL", replay, 204);
	await call("PUT", checkpointPath, "INTERNAL", { ...replay, sdk_state_json: '{"resources":[]}' }, 409);
	assert.equal(test.checkpoint(operationId).sequence, checkpoint.sequence);
	return {
		id: operationId,
		confirmation,
		checkpoint,
		execute: `/internal/poc/operations/${operationId}/execute`,
		read: () => call("GET", `/api/admin/operations/${operationId}`, "ADMIN", undefined, 200),
	};
}

function executionOnce(test, publication) {
	assert.deepEqual(test.provider.writes(), resourcePosts);
	assert.equal(
		test.proxy.calls.filter((call) => call.method === "POST" && call.path === publication.execute).length,
		1,
	);
}

async function publishDisconnect(test) {
	const publication = await beginPublication(test);
	test.proxy.cut(publication.execute);
	assert.equal((await publication.read()).status, "running");
	test.provider.releaseAgent();
	const success = await until(async () => {
		const current = await publication.read();
		assert.notEqual(current.status, "failed", JSON.stringify(current.error_details));
		return current.status === "succeeded" ? current : null;
	}, "断开执行连接后原 Operation 成功");
	assert.equal(success.publication.outcome, "succeeded");
	assert.deepEqual(success.result.bindings.map((binding) => binding.remote_id).sort(), [AGENT_ID, ENV_ID]);
	assert.equal((await test.call("GET", draft, "ADMIN", undefined, 200)).recovery_action, "none");
	await test.restartJava();
	assert.deepEqual(await publication.read(), success);
	await test.call("POST", `${draft}/resources/publish`, "ADMIN", publication.confirmation, 428);
	executionOnce(test, publication);
	return {
		operation_id: success.operation_id,
		first_checkpoint: publication.checkpoint.sequence,
		final_checkpoint: test.checkpoint(publication.id).sequence,
		outcome: success.publication.outcome,
		provider_posts: test.provider.writes(),
	};
}

async function publishRestart(test) {
	const publication = await beginPublication(test);
	const old = await test.instance();
	await test.stopNode();
	assert.equal((await publication.read()).status, "running");
	await test.startNode();
	assert.notEqual(await test.instance(), old);
	const interrupted = await publication.read();
	assert.equal(interrupted.status, "failed");
	assert.equal(interrupted.publication.outcome, "unknown");
	assert.equal(interrupted.publication.mutation_started, true);
	assert.deepEqual(
		interrupted.publication.resources.map((item) => item.remote_id),
		[ENV_ID],
	);
	assert.equal(interrupted.error_details.code, "publication.interrupted");
	assert.equal((await test.call("GET", draft, "ADMIN", undefined, 200)).recovery_action, "read_result");
	await test.call("POST", `${draft}/resources/plan`, "ADMIN", { action: "publish" }, 409);
	await test.call("POST", `${draft}/resources/publish`, "ADMIN", publication.confirmation, 428);
	assert.equal(test.checkpoint(publication.id).sequence, publication.checkpoint.sequence);
	executionOnce(test, publication);
	return {
		operation_id: interrupted.operation_id,
		checkpoint: publication.checkpoint.sequence,
		outcome: interrupted.publication.outcome,
		known_environment_id: ENV_ID,
		provider_posts: test.provider.writes(),
	};
}

const cases = {
	client_resume: clientResume,
	upstream_resume: upstreamResume,
	publish_disconnect: publishDisconnect,
	publish_restart: publishRestart,
};

async function main() {
	assert.ok(Number(process.versions.node.split(".")[0]) >= 24, "使用 Node 24 或更新版本运行验收");
	const runtime = spawnSync(java, ["-XshowSettings:properties", "-version"], { encoding: "utf8" });
	assert.equal(runtime.status, 0, "需要在 .toolchain/java11 解包 JDK 11，或设置 POC_JAVA_HOME");
	const javaVersion = /version "(11\.[^"]+)"/.exec(runtime.stderr)?.[1];
	const javaVendor = /java\.vendor = ([^\r\n]+)/.exec(runtime.stderr)?.[1]?.trim();
	assert.ok(javaVersion, "PoC 必须运行在 Java 11");
	const packageJson = JSON.parse(await readFile(join(serverPackage, "@openagentpack", "sdk", "package.json"), "utf8"));
	assert.equal(packageJson.version, "0.10.0");
	if (!process.argv.includes("--skip-build")) {
		const build = spawnSync(maven, ["-B", "-ntp", `-Dmaven.repo.local=${join(tools, "m2")}`, "package"], {
			cwd: root,
			env: { ...process.env, JAVA_HOME: javaHome },
			stdio: "inherit",
		});
		assert.equal(build.status, 0, "Maven 编译失败");
	}
	const runs = join(scratch, "runs");
	await mkdir(runs, { recursive: true });
	const run = await mkdtemp(join(runs, "run-"));
	process.stdout.write(`PoC 证据目录 ${run}\n`);
	const selected = process.argv.find((arg) => arg.startsWith("--case="))?.slice(7);
	assert.ok(!selected || Object.hasOwn(cases, selected), "未知的 PoC 用例");
	const results = [];
	for (const [name, verify] of Object.entries(cases)) {
		if (selected && name !== selected) continue;
		const directory = join(run, name);
		await mkdir(directory);
		const test = await startCase(directory);
		try {
			const evidence = await verify(test);
			results.push({ case: name, ...evidence });
			process.stdout.write(`PASS ${name} ${JSON.stringify(evidence)}\n`);
		} catch (error) {
			console.error(test.childLogs());
			console.error("本地替身请求摘要", JSON.stringify(test.provider.calls));
			throw error;
		} finally {
			await test.close();
		}
	}
	const result = {
		java: javaVersion,
		java_vendor: javaVendor,
		node: process.versions.node,
		spring_boot: "2.7.18",
		sdk: packageJson.version,
		results,
	};
	await writeFile(join(run, "evidence.json"), `${JSON.stringify(result, null, 2)}\n`);
	const total = selected ? 1 : Object.keys(cases).length;
	process.stdout.write(`验收通过 ${results.length}/${total}\n`);
}

await main();
