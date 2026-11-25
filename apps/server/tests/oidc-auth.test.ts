import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { loadConfig } from "../src/config.ts";
import { signJwt } from "../src/services/identity.ts";
import { openKitServices } from "../src/services/index.ts";

const issuer = "https://sso.example.test/realms/kit";
const password = "Local!Password2026";
const admin = "test-admin";
const disposals: Array<() => Promise<void>> = [];

afterEach(async () => {
	for (const dispose of disposals.splice(0).reverse()) await dispose();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function headers(token?: string) {
	return {
		"content-type": "application/json",
		"x-kit-protocol-version": "3.0.0",
		...(token ? { authorization: `Bearer ${token}` } : {}),
	};
}

async function fixture() {
	vi.useFakeTimers({ toFake: ["Date"] });
	const dir = mkdtempSync(join(tmpdir(), "kit-oidc-auth-"));
	let services: Awaited<ReturnType<typeof openKitServices>> | undefined;
	disposals.push(async () => {
		await services?.close();
		rmSync(dir, { recursive: true, force: true });
	});
	const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
	const jwk = { ...(await exportJWK(publicKey)), kid: "kit-oidc-test", alg: "RS256" };
	const fetchJwks = vi.fn(async (url: string | URL) => {
		expect(String(url)).toBe(`${issuer}/protocol/openid-connect/certs`);
		return Response.json({ keys: [jwk] });
	});
	vi.stubGlobal("fetch", fetchJwks);

	async function open(mode: "member" | "oidc") {
		await services?.close();
		services = await openKitServices(
			loadConfig({
				KIT_GATEWAY: "mock",
				KIT_DATA_DIR: dir,
				ADMIN_TOKEN: admin,
				KIT_ADMIN_TOKENS: "test-auditor:auditor",
				KIT_AUTH_MODE: mode,
				KIT_JWT_SECRET: "test-legacy-secret",
				KIT_OIDC_ISSUER: issuer,
				KIT_OIDC_CLIENT_ID: "kit-web",
				KIT_OIDC_AUDIENCE: "kit-api",
			}),
		);
		return createApp(services);
	}
	function accessToken(sub: string, overrides: JWTPayload = {}) {
		const issued = Math.floor(Date.now() / 1000);
		return new SignJWT({
			iss: issuer,
			sub,
			aud: ["kit-api"],
			azp: "kit-web",
			typ: "Bearer",
			jti: randomUUID(),
			iat: issued,
			exp: issued + 300,
			...overrides,
		})
			.setProtectedHeader({ alg: "RS256", kid: jwk.kid })
			.sign(privateKey);
	}
	return { open, accessToken, services: () => services!, fetchJwks };
}

type TestApp = ReturnType<typeof createApp>;
async function responseData<T>(response: Response) {
	return ((await response.json()) as { data: T }).data;
}

function requestCreateMember(app: TestApp, username: string, passwordMode: "auto" | "custom") {
	return app.request("/api/admin/members", {
		method: "POST",
		headers: headers(admin),
		body: JSON.stringify({
			username,
			display_name: username,
			auth_type: "local",
			password_mode: passwordMode,
			...(passwordMode === "custom" ? { password } : {}),
		}),
	});
}

async function createPasswordMember(app: TestApp, username: string) {
	const response = await requestCreateMember(app, username, "custom");
	expect(response.status).toBe(201);
	return (await responseData<{ member: { member_id: string } }>(response)).member.member_id;
}

const bindingPath = (id: string) => `/api/admin/members/${id}/oidc-binding`;
function bind(app: TestApp, memberId: string, sub: string, actor = admin) {
	return app.request(bindingPath(memberId), {
		method: "PUT",
		headers: headers(actor),
		body: JSON.stringify({ sub }),
	});
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, expected?: string) {
	const decoder = new TextDecoder();
	let body = "";
	for (;;) {
		const next = await reader.read();
		if (next.done) return body;
		body += decoder.decode(next.value, { stream: true });
		if (expected && body.includes(expected)) return body;
	}
}

describe("Keycloak 员工 OIDC", () => {
	it("预绑定并切换至 OIDC 后，原成员的会话和限额仍按相同 ID 归属", async () => {
		const env = await fixture();
		const preflight = await env.open("member");
		const alice = await createPasswordMember(preflight, "alice");
		const bob = await createPasswordMember(preflight, "bob");
		expect((await bind(preflight, alice, "kc-alice", "test-auditor")).status).toBe(403);
		const first = await bind(preflight, alice, "kc-alice");
		expect(first.status).toBe(200);
		const binding = await first.json();
		expect(await (await bind(preflight, alice, "kc-alice")).json()).toEqual(binding);
		expect((await bind(preflight, bob, "kc-alice")).status).toBe(409);
		expect((await bind(preflight, bob, "kc-bob")).status).toBe(200);
		const oldLogin = await preflight.request("/api/kit/auth/login", {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({ username: "alice", password }),
		});
		expect(oldLogin.status).toBe(200);
		const oldToken = (await responseData<{ access_token: string }>(oldLogin)).access_token;
		const catalog = env.services().catalog;
		await catalog.upsert({ slug: "assistant", display_name: "助手", remote_agent_id: "agent_mock" });
		await catalog.setStatus("assistant", "listed");
		const prior = await preflight.request("/api/kit/sessions", {
			method: "POST",
			headers: headers(oldToken),
			body: JSON.stringify({ agent_slug: "assistant" }),
		});
		expect(prior.status).toBe(201);
		const priorId = (await responseData<{ session_id: string }>(prior)).session_id;
		vi.setSystemTime(Date.now() + 2000);
		const app = await env.open("oidc");
		const aliceToken = await env.accessToken("kc-alice");
		const bobToken = await env.accessToken("kc-bob");
		const config = await app.request("/api/config");
		expect(await config.json()).toMatchObject({
			data: { auth: { mode: "oidc", passwordLogin: false, oidc: { issuer, clientId: "kit-web" } } },
		});
		const me = await app.request("/api/kit/auth/me", { headers: headers(aliceToken) });
		expect(me.status).toBe(200);
		expect(await me.json()).toMatchObject({ data: { identity: { subjectId: alice }, member: { member_id: alice } } });
		const limits = await app.request("/api/kit/usage-limits", { headers: headers(aliceToken) });
		expect(limits.status).toBe(200);
		expect(await limits.json()).toMatchObject({ data: { member_id: alice } });
		const sessions = await app.request("/api/kit/sessions", { headers: headers(aliceToken) });
		expect(await responseData(sessions)).toEqual(
			expect.arrayContaining([expect.objectContaining({ session_id: priorId })]),
		);
		const otherSessions = await app.request("/api/kit/sessions", { headers: headers(bobToken) });
		expect(await responseData(otherSessions)).toEqual([]);
		expect((await app.request("/api/kit/auth/me", { headers: headers(oldToken) })).status).toBe(401);
		expect(
			(await app.request("/api/kit/auth/me", { headers: headers(signJwt({ sub: alice }, "test-legacy-secret")) }))
				.status,
		).toBe(401);
		expect((await app.request("/api/admin/members", { headers: headers(aliceToken) })).status).toBe(403);
		expect((await app.request("/api/admin/members", { headers: headers(admin) })).status).toBe(200);
		expect(env.fetchJwks).toHaveBeenCalledTimes(1);
	});

	it("拒绝用途错误的令牌与未绑定用户，退出或解绑立即收回访问和订阅", async () => {
		const env = await fixture();
		const app = await env.open("oidc");
		const rejected = await requestCreateMember(app, "alice", "custom");
		expect(rejected.status).toBe(400);
		expect(await rejected.json()).toMatchObject({ error: { code: "invalid_request" } });
		const newMember = await requestCreateMember(app, "alice", "auto");
		expect(newMember.status).toBe(201);
		const newMemberData = await responseData<{ member: { member_id: string } }>(newMember);
		expect(newMemberData).not.toHaveProperty("initial_password");
		const alice = newMemberData.member.member_id;
		await bind(app, alice, "kc-alice");
		vi.setSystemTime(Date.now() + 2000);
		const me = (token: string) => app.request("/api/kit/auth/me", { headers: headers(token) });
		for (const claims of [
			{ iss: "https://wrong.example.test/realms/kit" },
			{ aud: "another-api" },
			{ azp: "another-client" },
			{ typ: "ID" },
			{ exp: Math.floor(Date.now() / 1000) - 1 },
		]) {
			expect((await me(await env.accessToken("kc-alice", claims))).status).toBe(401);
		}
		const unbound = await me(await env.accessToken("unknown"));
		expect(unbound.status).toBe(403);
		expect(await unbound.json()).toMatchObject({ error: { details: { reason: "member_not_bound" } } });
		const noPassword = await app.request("/api/kit/auth/login", {
			method: "POST",
			headers: headers(),
			body: JSON.stringify({ username: "alice", password }),
		});
		expect(noPassword.status).toBe(403);
		const catalog = env.services().catalog;
		await catalog.upsert({ slug: "assistant", display_name: "助手", remote_agent_id: "agent_mock" });
		await catalog.setStatus("assistant", "listed");
		const token = await env.accessToken("kc-alice");
		const created = await app.request("/api/kit/sessions", {
			method: "POST",
			headers: headers(token),
			body: JSON.stringify({ agent_slug: "assistant" }),
		});
		expect(created.status).toBe(201);
		const id = (await responseData<{ session_id: string }>(created)).session_id;
		const openStream = async (access: string) => {
			const response = await app.request(`/api/kit/sessions/${id}/stream`, { headers: headers(access) });
			expect(response.status).toBe(200);
			const reader = response.body!.getReader();
			expect(await readUntil(reader, "event: ready")).toContain("event: ready");
			return reader;
		};
		const first = await openStream(token);
		expect((await app.request("/api/kit/auth/logout", { method: "POST", headers: headers(token) })).status).toBe(204);
		expect(await readUntil(first)).toContain('"code":"unauthorized"');
		expect((await me(token)).status).toBe(401);
		const fresh = await env.accessToken("kc-alice");
		const second = await openStream(fresh);
		expect((await app.request(bindingPath(alice), { method: "DELETE", headers: headers(admin) })).status).toBe(204);
		expect(await readUntil(second)).toContain('"code":"unauthorized"');
		expect((await me(fresh)).status).toBe(403);
		expect((await bind(app, alice, "kc-alice")).status).toBe(200);
		expect((await me(fresh)).status).toBe(401);
		vi.setSystemTime(Date.now() + 2000);
		expect((await me(await env.accessToken("kc-alice"))).status).toBe(200);
		expect((await env.services().audit.list()).map(({ action, target }) => [action, target])).toEqual([
			["members.oidc.bind", alice],
			["members.oidc.unbind", alice],
			["members.oidc.bind", alice],
		]);
	});
});
