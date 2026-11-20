/** biome-ignore-all lint/suspicious/noUndeclaredEnvVars: 验收直接运行，不经过 Turborepo。 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fromServer = createRequire(new URL("../server/package.json", import.meta.url));
const loader = new URL("../server/node_modules/tsx/dist/loader.mjs", import.meta.url).href;
const existing = new URL("../server/src/bin.ts", import.meta.url);
const bridge = new URL("../server/src/sdk-gateway/bin.ts", import.meta.url);
const jar = new URL("./target/kit-server-1.0.0-SNAPSHOT.jar", import.meta.url);
const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, "bin/java") : "java";
const openapi = JSON.parse(await readFile(new URL("../server/openapi.json", import.meta.url), "utf8"));
const id = () => randomUUID().replaceAll("-", "");
const token = () => randomBytes(32).toString("base64url");
const isolated = join(root, ".scratch", "java-server-tests");
await mkdir(isolated, { recursive: true });

async function freePort() {
	const socket = createServer();
	await new Promise((accept, reject) => socket.once("error", reject).listen(0, "127.0.0.1", accept));
	const value = socket.address().port;
	await new Promise((accept) => socket.close(accept));
	return value;
}

function launch(executable, args, env, cwd = root) {
	const child = spawn(executable, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
	let output = "";
	let failure;
	child.on("error", (error) => {
		failure = error;
	});
	for (const stream of [child.stdout, child.stderr]) {
		stream.setEncoding("utf8");
		stream.on("data", (data) => {
			output = (output + data).slice(-9000);
		});
	}
	const exited = () => failure || child.exitCode !== null || child.signalCode !== null;
	return {
		async ready(url, headers) {
			const deadline = Date.now() + 15_000;
			do {
				if (exited()) throw new Error(`启动验收进程失败\n${output}`);
				const response = await fetch(url, { headers, signal: AbortSignal.timeout(900) }).catch(() => null);
				if (response?.ok) return;
				await delay(70);
			} while (Date.now() < deadline);
			throw new Error(`等待后端就绪超时\n${output}`);
		},
		async close(signal = "SIGTERM") {
			if (exited()) return;
			child.kill(signal);
			const end = Date.now() + 5000;
			while (!exited() && end > Date.now()) await delay(50);
			if (!exited()) child.kill("SIGKILL");
		},
	};
}

async function fresh(driver, adminUrl) {
	const directory = await mkdtemp(join(isolated, `${driver}-`));
	const env = { KIT_DATA_DIR: directory, KIT_DB_DRIVER: driver };
	if (driver === "sqlite") {
		return {
			directory,
			env,
			async query(sql, args = []) {
				const db = new DatabaseSync(join(directory, "kit.sqlite"));
				try {
					if (sql.trimStart().toUpperCase().startsWith("SELECT")) return db.prepare(sql).all(...args);
					db.exec(sql);
					return [];
				} finally {
					db.close();
				}
			},
			close: async () => {},
		};
	}
	const url = new URL(adminUrl);
	assert.equal(url.hostname, "127.0.0.1", "Java 测试数据库须使用回环地址");
	const database = `kit_java_${id().slice(0, 20)}`;
	const connector =
		driver === "mysql"
			? async (dsn) => {
					const client = await fromServer("mysql2/promise").createConnection(dsn);
					return { query: async (sql, values) => (await client.query(sql, values))[0], close: () => client.end() };
				}
			: async (dsn) => {
					const { Client } = fromServer("pg");
					const client = new Client({ connectionString: dsn });
					await client.connect();
					return {
						query: async (sql, values = []) => {
							let param = 0;
							return (await client.query(values.length ? sql.replaceAll("?", () => `$${++param}`) : sql, values)).rows;
						},
						close: () => client.end(),
					};
				};
	const admin = await connector(url.href);
	try {
		await admin.query(`CREATE DATABASE ${database}`);
		url.pathname = "/" + database;
		const db = await connector(url.href);
		return {
			directory,
			env: { ...env, KIT_DATABASE_URL: url.href },
			query: db.query,
			async close() {
				await db.close();
				await admin.query(`DROP DATABASE ${database}`);
				await admin.close();
			},
		};
	} catch (error) {
		await admin.close();
		throw error;
	}
}

async function setUp(db) {
	const admin = token();
	const readonly = token();
	const sdkToken = token();
	const callback = token();
	const sdkPort = await freePort();
	const callbackPort = await freePort();
	const port = await freePort();
	const origin = `http://127.0.0.1:${port}`;
	const sdkUrl = `http://127.0.0.1:${sdkPort}`;
	const env = {
		PATH: process.env.PATH,
		JAVA_HOME: process.env.JAVA_HOME,
		TMPDIR: process.env.TMPDIR,
		KIT_GATEWAY: "mock",
		KIT_AUTH_MODE: "member",
		ADMIN_TOKEN: admin,
		KIT_ADMIN_TOKENS: `${readonly}:auditor`,
		KIT_CONFIRM_SECRET: token(),
		KIT_RATE_LIMIT_RPS: "0",
		PORT: String(port),
		...db.env,
	};
	const headers = { authorization: `Bearer ${admin}` };
	const api = async (method, route, body, expected = 200, auth = headers) => {
		const form = body instanceof FormData;
		const response = await fetch(origin + route, {
			method,
			headers: { ...auth, ...(body === undefined || form ? {} : { "content-type": "application/json" }) },
			...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
			signal: AbortSignal.timeout(10_000),
		});
		const json = response.status !== 204 ? await response.json() : null;
		assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(json)}`);
		return json;
	};
	const internal = {
		KIT_SDK_CALLBACK_PORT: String(callbackPort),
		KIT_SDK_GATEWAY_TOKEN: sdkToken,
		KIT_SDK_CALLBACK_TOKEN: callback,
		KIT_SDK_URL: sdkUrl,
		KIT_SDK_PORT: String(sdkPort),
	};
	const node = launch(process.execPath, ["--import", loader, fileURLToPath(bridge)], {
		PATH: env.PATH,
		TMPDIR: env.TMPDIR,
		KIT_GATEWAY: "mock",
		...internal,
		KIT_SDK_TEMP_DIR: join(db.directory, "sdk"),
		KIT_SDK_ASSET_DIR: join(db.directory, "resource-draft-uploads"),
	});
	let runtime;
	try {
		await node.ready(sdkUrl + "/internal/sdk/v1/health", { authorization: `Bearer ${sdkToken}` });
	} catch (error) {
		await node.close();
		throw error;
	}
	return {
		api,
		admin,
		readonly: { authorization: `Bearer ${readonly}` },
		root: origin,
		async start(mode) {
			if (runtime) await runtime.close();
			runtime =
				mode === "java"
					? launch(java, ["-jar", fileURLToPath(jar)], { ...env, ...internal })
					: launch(process.execPath, ["--import", loader, fileURLToPath(existing)], env);
			await runtime.ready(origin + "/healthz");
		},
		async close() {
			if (runtime) await runtime.close();
			await node.close();
		},
	};
}

async function featureCheck(runtime) {
	const { api, readonly } = runtime;
	const member = (
		await api(
			"POST",
			"/api/admin/members",
			{
				username: "compat_member",
				display_name: "兼容会员",
				auth_type: "local",
				password_mode: "auto",
			},
			201,
		)
	).data;
	await api("POST", "/api/admin/groups", { name: "Denied" }, 403, readonly);
	const login = (
		await api("POST", "/api/kit/auth/login", { username: "compat_member", password: member.initial_password })
	).data;
	const auth = { authorization: `Bearer ${login.access_token}` };
	assert.equal(
		(await api("GET", "/api/kit/auth/me", undefined, 200, auth)).data.member.member_id,
		member.member.member_id,
	);
	const group = (await api("POST", "/api/admin/groups", { name: "跨运行时成员组" }, 201)).data;
	const groupUrl = "/api/admin/groups/" + group.group_id;
	await api("PATCH", groupUrl + "/members", { add_member_ids: [member.member.member_id], remove_member_ids: [] });
	assert.equal((await api("GET", groupUrl)).data.member_count, 1);
	await api("GET", groupUrl + "/members?membership=included");
	const choose = (await api("GET", "/api/admin/remote/agents")).data[0];
	assert.ok(choose?.agent_id);
	const template = {
		name: "兼容模版",
		category: "general",
		remote_agent_id: choose.agent_id,
		files: [],
		memory_stores: [],
		vault_ids: [],
		suggested_prompts: ["你好"],
	};
	const created = (await api("POST", "/api/admin/templates", template, 201)).data;
	const templateUrl = "/api/admin/templates/" + created.template_id;
	await api("PUT", templateUrl, { ...template, description: "版本二", base_version: 1 });
	await api("PUT", templateUrl, { ...template, base_version: 1 }, 409);
	assert.deepEqual(
		(await api("GET", templateUrl + "/versions")).data.map((version) => version.version),
		[2, 1],
	);
	const plan = (await api("POST", templateUrl + "/listing/plan", { display_name: "兼容智能体" })).data;
	await api("POST", templateUrl + "/listing", {
		display_name: "兼容智能体",
		plan_id: plan.plan_id,
		confirm_token: plan.confirm_token,
	});
	const entry = (await api("GET", "/api/kit/agents", undefined, 200, auth)).data[0];
	assert.equal(entry.slug, created.template_id);
	await api("GET", "/api/kit/plaza", undefined, 200, auth);
	const session = (await api("POST", "/api/kit/sessions", { agent_slug: entry.slug, title: "兼容会话" }, 201, auth))
		.data;
	assert.ok(session.session_id);
	assert.equal((await api("GET", "/api/kit/sessions", undefined, 200, auth)).data[0].session_id, session.session_id);
	await sessionCheck(runtime, session, member.member.member_id, auth);
	const branding = { productName: "兼容工作台", logoUrl: "/brand/kit-logo.svg" };
	await api("PUT", "/api/admin/branding", branding);
	assert.deepEqual((await api("GET", "/api/config")).data.branding, branding);
	await api("GET", "/api/admin/members/" + member.member.member_id + "/usage");
	await api("GET", "/api/admin/usage/templates");
	await api("GET", "/api/admin/usage/model-usage");
	await api("GET", "/api/admin/eval/workspaces");
	return { groupUrl, auth, templateUrl, member: member.member, password: member.initial_password, agent: entry.slug };
}

async function sessionCheck({ api, root }, session, memberId, auth) {
	const form = new FormData();
	form.set("file", new Blob(["测试附件"], { type: "text/plain" }), "demo.txt");
	const file = (await api("POST", "/api/kit/files", form, 201, auth)).data;
	assert.ok(file.file_id);
	const download = await fetch(`${root}/api/kit/files/${file.file_id}/download`, { headers: auth });
	assert.equal(download.status, 200);
	assert.equal(await download.text(), "测试附件");

	const override = `/api/admin/members/${memberId}/usage-limit`;
	const limits = { monthly_tokens: 100, monthly_active_seconds: null, daily_tokens: null, daily_active_seconds: null };
	await api("PUT", override, limits);
	const url = `/api/kit/sessions/${session.session_id}`;
	const sessionAuth = { ...auth, "x-kit-protocol-version": "2.0.0" };
	const answer = await api(
		"POST",
		`${url}/messages`,
		{ text: "用量随回合累计", client_message_id: "usage-check" },
		202,
		sessionAuth,
	);
	assert.equal(answer.data.event_ids.length, 1);
	const usage = (await api("GET", "/api/kit/usage-limits", undefined, 200, auth)).data;
	assert.equal(usage.tokens.used, 200);
	assert.equal(usage.active_seconds.used, 2);
	const until = Date.now() + 10_000;
	for (;;) {
		const detail = (await api("GET", url, undefined, 200, auth)).data;
		if (detail.status === "idle") break;
		assert.ok(Date.now() < until, "会话应回到 idle");
		await delay(100);
	}
	await api(
		"POST",
		`${url}/messages`,
		{ text: "限额应拒绝新回合", client_message_id: "quota-check" },
		403,
		sessionAuth,
	);
	await api("DELETE", override);
	const plan = (await api("POST", `${url}/plan`, { action: "archive" }, 200, auth)).data;
	const confirmation = { plan_id: plan.plan_id, confirm_token: plan.confirm_token };
	await api("POST", `${url}/archive`, confirmation, 200, auth);
	assert.equal((await api("GET", url, undefined, 200, auth)).data.status, "archived");
	await api("POST", `${url}/archive`, confirmation, 428, auth);
}

async function browserCheck(runtime, fixture) {
	const fromWeb = createRequire(new URL("../web/package.json", import.meta.url));
	const { chromium, expect } = fromWeb("@playwright/test");
	const vite = join(dirname(fromWeb.resolve("vite/package.json")), "bin/vite.js");
	const sites = [];
	const browser = await chromium.launch(
		process.env.KIT_JAVA_BROWSER_CHANNEL
			? {
					channel: process.env.KIT_JAVA_BROWSER_CHANNEL,
				}
			: {},
	);
	try {
		async function pageFor(app, path, search = {}) {
			const port = await freePort();
			const origin = `http://127.0.0.1:${port}`;
			const site = launch(
				process.execPath,
				[vite, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
				{ PATH: process.env.PATH },
				join(root, "apps", app),
			);
			sites.push(site);
			await site.ready(origin);
			const page = await browser.newPage();
			page.on("requestfailed", (request) => {
				const url = new URL(request.url());
				if (url.origin === runtime.root) {
					process.stderr.write(`浏览器请求 ${url.pathname} 失败 ${request.failure()?.errorText}\n`);
				}
			});
			await page.goto(`${origin}${path}?${new URLSearchParams({ api: runtime.root, ...search })}`);
			return page;
		}
		const web = await pageFor("web", "/", { agent: fixture.agent });
		try {
			await expect(web.getByLabel("用户名", { exact: true })).toBeVisible();
		} catch (error) {
			throw new Error(`Web 未进入登录页，可见内容 ${(await web.locator("body").innerText()).slice(0, 300)}`, {
				cause: error,
			});
		}
		await web.getByLabel("用户名", { exact: true }).fill(fixture.member.username);
		await web.getByLabel("密码", { exact: true }).fill(fixture.password);
		await web.getByRole("button", { name: "登录", exact: true }).click();
		await web.getByLabel("消息输入", { exact: true }).fill("验证 Java Kit 的流式消息");
		await web.getByRole("button", { name: "发送", exact: true }).click();
		await expect(web.getByText(/mock gateway 的流式回答/).first()).toBeVisible({ timeout: 20_000 });

		const consolePage = await pageFor("console", "/templates");
		await consolePage.getByPlaceholder("ADMIN_TOKEN").fill(runtime.admin);
		await consolePage.getByRole("button", { name: "进入", exact: true }).click();
		await expect(consolePage.getByRole("region", { name: "模版列表", exact: true })).toBeVisible();
		await expect(consolePage.getByText("兼容模版", { exact: true }).first()).toBeVisible();
		await consolePage.getByTestId("members-tab").click();
		await expect(consolePage.getByText("兼容会员", { exact: true }).first()).toBeVisible();
		process.stdout.write("Chrome 验证了 Web 成员登录及流式回复、Console 模版和成员查询\n");
	} finally {
		await browser.close();
		await Promise.all(sites.map((site) => site.close()));
	}
}

async function freshAndRollback(driver, adminUrl) {
	const db = await fresh(driver, adminUrl);
	let runtime;
	try {
		runtime = await setUp(db);
		await runtime.start("java");
		assert.deepEqual(await runtime.api("GET", "/openapi.json"), openapi);
		const result = await featureCheck(runtime);
		if (driver === "sqlite" && process.env.KIT_JAVA_TEST_BROWSER === "1") await browserCheck(runtime, result);
		const migrationIds = (await db.query("SELECT id FROM _kit_migrations ORDER BY id")).map((row) => row.id);
		assert.ok(migrationIds.includes("001_init"));
		assert.ok(migrationIds.includes("034_java_operation_recovery"));
		await runtime.start("java");
		assert.equal((await runtime.api("GET", result.groupUrl)).data.member_count, 1);
		await runtime.start("hono");
		assert.equal(
			(await runtime.api("GET", "/api/kit/auth/me", undefined, 200, result.auth)).data.member.member_id,
			result.member.member_id,
		);
		assert.equal((await runtime.api("GET", result.templateUrl)).data.version, 2);
		assert.equal((await runtime.api("GET", result.groupUrl)).data.member_count, 1);
		await runtime.api("POST", "/api/kit/auth/logout", undefined, 204, result.auth);
		await runtime.start("java");
		await runtime.api("GET", "/api/kit/auth/me", undefined, 401, result.auth);
		assert.deepEqual(
			(await db.query("SELECT id FROM _kit_migrations ORDER BY id")).map((row) => row.id),
			migrationIds,
		);
		process.stdout.write(`${driver} 空库、重启、表记录和 Hono 回切通过，${migrationIds.length} 个迁移版本\n`);
	} finally {
		await runtime?.close();
		await db.close();
	}
}

async function sqliteHistory(directory) {
	const { sqliteHistory } = await import("../server/src/store/sqlite-history.ts");
	const legacy = new DatabaseSync(join(directory, "kit.sqlite"));
	try {
		legacy.exec("CREATE TABLE _kit_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
		for (const version of sqliteHistory) {
			const now = new Date().toISOString();
			if (version.run) version.run(legacy);
			else legacy.exec(version.sql);
			legacy.prepare("INSERT INTO _kit_migrations VALUES (?,?)").run(version.id, now);
			if (version.id === "005_member_auth") break;
		}
		legacy
			.prepare("INSERT INTO kit_sessions (session_id,subject_id,agent_slug,files_json,created_at) VALUES (?,?,?,?,?)")
			.run("legacy-session", "legacy-owner", "legacy-agent", '[{"file_id":"legacy-file"}]', new Date().toISOString());
	} finally {
		legacy.close();
	}
}

async function externalHistory(driver, db) {
	const historical =
		driver === "mysql"
			? (await import("../server/tests/fixtures/before-shared-mysql.ts")).mysqlSchema
			: (await import("../server/tests/fixtures/before-shared-postgres.ts")).postgresSchema;
	const { mysqlTableOptions } = await import("../server/src/store/schema/render.ts");
	for (const statement of historical)
		await db.query(driver === "mysql" ? `${statement} ${mysqlTableOptions}` : statement);
	await db.query("CREATE TABLE _kit_migrations (id VARCHAR(100) PRIMARY KEY, applied_at VARCHAR(32) NOT NULL)");
	await db.query("INSERT INTO _kit_migrations (id,applied_at) VALUES (?,?)", [
		`001_initial_${driver}_schema`,
		"2026-10-20",
	]);
	await db.query("INSERT INTO quota_policy (id,monthly_credits) VALUES (1,321)");
}

async function legacy(driver, adminUrl) {
	const db = await fresh(driver, adminUrl);
	let runtime;
	try {
		if (driver === "sqlite") await sqliteHistory(db.directory);
		else await externalHistory(driver, db);
		runtime = await setUp(db);
		await runtime.start("java");
		if (driver === "sqlite") {
			assert.equal(
				(await db.query("SELECT subject_id FROM kit_uploaded_files WHERE file_id='legacy-file'"))[0].subject_id,
				"legacy-owner",
			);
		} else {
			assert.equal((await runtime.api("GET", "/api/admin/quota/policy")).data.monthly_credits, 321);
			assert.ok((await db.query("SELECT id FROM _kit_migrations WHERE id='kit_history_adopted'")).length > 0);
		}
		process.stdout.write(`${driver} 带数据的历史升级通过\n`);
	} finally {
		await runtime?.close();
		await db.close();
	}
}

async function resumeMysql(url) {
	const db = await fresh("mysql", url);
	let runtime;
	try {
		const { program } = await import("../server/src/store/schema/generated/mysql.ts");
		const version = program.history[0];
		const fingerprint = createHash("sha256").update(JSON.stringify(version.steps)).digest("hex");
		await db.query("CREATE TABLE _kit_migrations (id VARCHAR(100) PRIMARY KEY,applied_at VARCHAR(32) NOT NULL)");
		await db.query(
			"CREATE TABLE _kit_migration_progress (slot INT PRIMARY KEY,id VARCHAR(100) NOT NULL," +
				"step_index INT NOT NULL,inflight TINYINT NOT NULL,fingerprint VARCHAR(64) NOT NULL)",
		);
		await db.query("INSERT INTO _kit_migration_progress VALUES (1,?,0,1,?)", [version.id, fingerprint]);
		await db.query(version.steps[0].sql);
		runtime = await setUp(db);
		await runtime.start("java");
		assert.equal((await db.query("SELECT * FROM _kit_migration_progress")).length, 0);
		assert.ok((await db.query("SELECT id FROM _kit_migrations WHERE id='034_java_operation_recovery'")).length > 0);
		process.stdout.write("mysql 复用 DDL 已提交、步骤未确认的断点，通过\n");
	} finally {
		await runtime?.close();
		await db.close();
	}
}

for (const [driver, url] of [
	["sqlite", undefined],
	["mysql", process.env.KIT_TEST_MYSQL_URL],
	["postgres", process.env.KIT_TEST_POSTGRES_URL],
]) {
	if (process.env.KIT_JAVA_TEST_DB && process.env.KIT_JAVA_TEST_DB !== driver) continue;
	if (driver !== "sqlite" && !url) {
		process.stdout.write(`跳过 ${driver}，缺少专用回环测试库配置\n`);
		continue;
	}
	await freshAndRollback(driver, url);
	await legacy(driver, url);
	if (driver === "mysql") await resumeMysql(url);
}
