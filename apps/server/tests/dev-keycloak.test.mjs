import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { provisionKeycloak } from "../scripts/keycloak-dev.mjs";
import { prepareKeycloakHome } from "../scripts/keycloak-runtime.mjs";

const config = { base: "http://127.0.0.1:8080", realm: "kit", clientId: "kit-web", audience: "kit-api", webPort: 5183 };
const webOrigins = ["http://localhost:5183", "http://127.0.0.1:5183"];
const redirectUris = webOrigins.map((origin) => `${origin}/`);
const admin = { username: "test-admin", password: "test-only" };
const run = () => provisionKeycloak(config, admin, new AbortController().signal);

function responses(...steps) {
	const fetch = vi.fn().mockResolvedValueOnce(Response.json({ access_token: "test-token" }));
	for (const step of steps) fetch.mockResolvedValueOnce(step);
	vi.stubGlobal("fetch", fetch);
	return fetch;
}

const status = (code) => new Response(null, { status: code });
afterEach(() => vi.unstubAllGlobals());

describe("本地 Keycloak 启动初始化", () => {
	it("新 Realm 一次创建包含 PKCE 与 API audience 的 Kit 客户端", async () => {
		const fetch = responses(status(404), status(201));
		await expect(run()).resolves.toEqual({ createdRealm: true, createdClient: true });
		const [url, request] = fetch.mock.calls[2];
		expect(url).toBe(`${config.base}/admin/realms`);
		expect(request.method).toBe("POST");
		expect(JSON.parse(request.body)).toMatchObject({
			realm: "kit",
			clients: [
				{
					clientId: "kit-web",
					publicClient: true,
					standardFlowEnabled: true,
					directAccessGrantsEnabled: false,
					redirectUris,
					webOrigins,
					attributes: { "pkce.code.challenge.method": "S256" },
					protocolMappers: [
						{
							protocolMapper: "oidc-audience-mapper",
							config: {
								"included.custom.audience": "kit-api",
								"access.token.claim": "true",
								"id.token.claim": "false",
							},
						},
					],
				},
			],
		});
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("已存在 Realm 时只创建缺失客户端", async () => {
		const fetch = responses(status(200), Response.json([]), status(201));
		await expect(run()).resolves.toEqual({ createdRealm: false, createdClient: true });
		const [url, request] = fetch.mock.calls[3];
		expect(url).toBe(`${config.base}/admin/realms/kit/clients`);
		expect(request.method).toBe("POST");
		expect(JSON.parse(request.body)).toMatchObject({ clientId: "kit-web" });
	});

	it("已配置当前端口的 Realm 和客户端直接复用", async () => {
		const fetch = responses(status(200), Response.json([{ clientId: "kit-web", redirectUris, webOrigins }]));
		await expect(run()).resolves.toEqual({ createdRealm: false, createdClient: false });
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(fetch.mock.calls.slice(1).every(([, request]) => !request.method)).toBe(true);
	});

	it("为已有客户端增补当前 Web 端口的精确回跳地址", async () => {
		const id = "local-client-id";
		const customUri = "https://custom.example.test/callback";
		const customOrigin = "https://custom.example.test";
		const fetch = responses(
			status(200),
			Response.json([{ id, clientId: "kit-web", redirectUris: [customUri], webOrigins: [customOrigin] }]),
			status(204),
		);
		await expect(run()).resolves.toEqual({ createdRealm: false, createdClient: false });
		const [url, request] = fetch.mock.calls[3];
		expect(url).toBe(`${config.base}/admin/realms/kit/clients/${id}`);
		expect(request.method).toBe("PUT");
		expect(JSON.parse(request.body)).toEqual({
			redirectUris: [customUri, ...redirectUris],
			webOrigins: [customOrigin, ...webOrigins],
		});
	});

	it("创建冲突后读取现有记录，复用并发启动已创建的配置", async () => {
		const fetch = responses(
			status(404),
			status(409),
			status(200),
			Response.json([]),
			status(409),
			Response.json([{ clientId: "kit-web", redirectUris, webOrigins }]),
		);
		await expect(run()).resolves.toEqual({ createdRealm: false, createdClient: false });
		expect(fetch).toHaveBeenCalledTimes(7);
	});
});

it.skipIf(process.platform === "win32")("发行包校验失败后清理临时下载，留待下次重试", async () => {
	const directory = await mkdtemp(join(tmpdir(), "kit-keycloak-install-"));
	const cache = join(directory, "cache");
	try {
		// 替代网络下载，将内容错误的文件写入相同的缓存安装入口。
		await writeFile(
			join(directory, "curl"),
			`#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output" ]; then
    printf 'bad archive' > "$2"
    exit 0
  fi
  shift
done
exit 2
`,
			{ mode: 0o700 },
		);
		const options = { env: { PATH: directory }, signal: new AbortController().signal };
		await expect(prepareKeycloakHome(undefined, cache, options)).rejects.toThrow("SHA-256 校验失败");
		expect(await readdir(cache)).toEqual([]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
