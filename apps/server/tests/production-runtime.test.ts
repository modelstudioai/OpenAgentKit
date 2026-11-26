import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import type { KitServices } from "../src/app-env.ts";
import { loadConfig } from "../src/config.ts";
import { BrandingService } from "../src/service/shared/branding.ts";
import { OperationService } from "../src/service/shared/operations.ts";
import { SessionIndexService } from "../src/service/shared/session/session-index.ts";
import { SessionService } from "../src/service/shared/session/sessions.ts";
import { KIT_SERVICES } from "../src/utils/injection-tokens.ts";
import { connectSessionStream, verifySse } from "./helpers/session-http.ts";

it("生产装配在真实端口提供所有接口，支持 SSE 续传和分块上传限额", async () => {
	const directory = await mkdtemp(join(tmpdir(), "kit-nest-runtime-"));
	try {
		const config = loadConfig({
			KIT_GATEWAY: "mock",
			KIT_AUTH_MODE: "member",
			KIT_DB_DRIVER: "sqlite",
			KIT_DATA_DIR: directory,
			KIT_UPLOAD_MAX_BYTES: "8",
			KIT_RATE_LIMIT_RPS: "0",
		});
		const app = await createApp(config);
		let stopping: Promise<void> | undefined;
		try {
			await app.listen(0, "127.0.0.1");
			const address = (app.getHttpServer() as Server).address();
			if (!address || typeof address === "string") throw new Error("NestJS 未监听 TCP 端口");
			const origin = `http://127.0.0.1:${address.port}`;
			const services = app.get<KitServices>(KIT_SERVICES);
			expect(app.get(SessionService)).toBe(services.sessions);
			expect(app.get(SessionIndexService)).toBe(services.sessionIndex);
			expect(app.get(OperationService)).toBe(services.operations);
			expect(services.runner).toBe(services.operations);
			expect(app.get(BrandingService).records).toBe(services.branding);

			const health = await fetch(`${origin}/healthz`);
			expect(health.status).toBe(200);
			expect(await health.json()).toMatchObject({ ok: true, gateway: "mock" });

			const baseline = JSON.parse(await readFile("openapi.json", "utf8")) as {
				paths: Record<string, Record<string, unknown>>;
			};
			const document = await fetch(`${origin}/openapi.json`);
			expect(document.status).toBe(200);
			expect(await document.json()).toEqual(baseline);
			const router = app.getHttpAdapter().getInstance().router as {
				stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
			};
			const active = new Set(
				router.stack.flatMap(({ route }) =>
					route ? Object.keys(route.methods).map((method) => `${method} ${route.path}`) : [],
				),
			);
			const expected = Object.entries(baseline.paths).flatMap(([path, methods]) =>
				Object.keys(methods).map((method) => `${method} ${path.replaceAll(/\{([^}]+)\}/g, ":$1")}`),
			);
			expect(Object.keys(baseline.paths)).toHaveLength(130);
			expect(expected).toHaveLength(162);
			expect(expected.filter((operation) => !active.has(operation))).toEqual([]);

			const credentials = { username: "nest-runtime", password: `Kit1!${randomBytes(18).toString("base64url")}` };
			await services.members.create(
				{ ...credentials, display_name: "Nest runtime", auth_type: "local", password_mode: "custom" },
				"test",
			);
			const primary = await services.memberAuth.login(credentials);
			const observer = await services.memberAuth.login(credentials);
			const session = await services.sessions.create({
				subjectId: primary.member.member_id,
				agentSlug: "assistant",
				remoteAgentId: "agent_mock_assistant",
			});
			await verifySse(services, origin, session.session_id, primary.access_token, observer.access_token);

			const form = new FormData();
			form.set("file", new File([new Uint8Array(8192)], "test.dat"));
			const payload = new Response(form);
			const result = await fetch(`${origin}/api/kit/files`, {
				method: "POST",
				body: payload.body,
				duplex: "half",
				headers: {
					authorization: `Bearer ${observer.access_token}`,
					"content-type": payload.headers.get("content-type")!,
				},
			});
			expect(result.status).toBe(413);
			expect(await result.json()).toMatchObject({ error: { code: "invalid_request" } });

			const stream = await connectSessionStream(
				new URL(`/api/kit/sessions/${session.session_id}/stream`, origin),
				observer.access_token,
			);
			try {
				expect((await stream.next())?.event).toBe("ready");
				const started = performance.now();
				stopping = app.close();
				await stopping;
				expect(performance.now() - started).toBeLessThan(4_000);
				expect(await stream.next().catch(() => undefined)).toBeUndefined();
			} finally {
				await stream.close();
			}
		} finally {
			await (stopping ?? app.close());
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}, 15_000);
