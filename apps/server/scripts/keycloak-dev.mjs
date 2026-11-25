import { randomBytes, randomUUID } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readKeycloakAdmin(file) {
	try {
		const { username, password } = JSON.parse(readFileSync(file, "utf8"));
		if (typeof username !== "string" || !username.trim() || typeof password !== "string" || !password) {
			throw new Error("Invalid admin file");
		}
		return { username, password };
	} catch (error) {
		if (error.code === "ENOENT") return undefined;
		throw new Error("无法读取 Keycloak 管理员文件。请使用包含 username 和 password 的 JSON");
	}
}

export function createKeycloakAdmin(file) {
	const credentials = { username: "kit-bootstrap-admin", password: randomBytes(32).toString("base64url") };
	mkdirSync(dirname(file), { mode: 0o700, recursive: true });
	const temporary = `${file}.${randomUUID()}.tmp`;
	writeFileSync(temporary, JSON.stringify(credentials), { flag: "wx", mode: 0o600 });
	try {
		// 对其他启动进程原子发布完整凭据，保留已存在的管理员。
		linkSync(temporary, file);
		return credentials;
	} catch (error) {
		if (error.code !== "EEXIST") throw error;
		const existing = readKeycloakAdmin(file);
		if (existing) return existing;
		throw new Error("Keycloak 管理员文件在启动期间被移除");
	} finally {
		unlinkSync(temporary);
	}
}

function newOidcClient({ clientId, audience, webPort }) {
	const origins = [...new Set([webPort, 5175])].flatMap((port) => [
		`http://localhost:${port}`,
		`http://127.0.0.1:${port}`,
	]);
	return {
		clientId,
		protocol: "openid-connect",
		enabled: true,
		publicClient: true,
		standardFlowEnabled: true,
		implicitFlowEnabled: false,
		directAccessGrantsEnabled: false,
		redirectUris: origins.map((origin) => `${origin}/`),
		webOrigins: origins,
		attributes: { "pkce.code.challenge.method": "S256" },
		protocolMappers: [
			{
				name: audience,
				protocol: "openid-connect",
				protocolMapper: "oidc-audience-mapper",
				config: {
					"included.custom.audience": audience,
					"access.token.claim": "true",
					"id.token.claim": "false",
				},
			},
		],
	};
}

function expectStatus(response, status, action) {
	if (response.status !== status) throw new Error(`${action}失败（HTTP ${response.status}）`);
}

function request(base, path, signal, init) {
	return fetch(`${base}${path}`, {
		...init,
		signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
		redirect: "error",
	});
}

export async function provisionKeycloak(config, admin, signal) {
	const { base, realm } = config;
	const tokenResponse = await request(base, "/realms/master/protocol/openid-connect/token", signal, {
		method: "POST",
		body: new URLSearchParams({ ...admin, client_id: "admin-cli", grant_type: "password" }),
	});
	if (tokenResponse.status !== 200) {
		throw new Error(`本地 Keycloak 管理员认证失败（HTTP ${tokenResponse.status}）。请检查管理员文件`);
	}
	const { access_token: token } = await tokenResponse.json();
	if (typeof token !== "string" || !token) throw new Error("Keycloak 管理员令牌缺失");
	const headers = { Authorization: `Bearer ${token}` };
	const get = (path) => request(base, path, signal, { headers });
	const write = (method, path, body) =>
		request(base, path, signal, {
			method,
			headers: { ...headers, "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

	const realmPath = `/admin/realms/${encodeURIComponent(realm)}`;
	const client = newOidcClient(config);
	const existingRealm = await get(realmPath);
	await existingRealm.body?.cancel();
	if (existingRealm.status === 404) {
		const created = await write("POST", "/admin/realms", {
			realm,
			enabled: true,
			sslRequired: "external",
			registrationAllowed: false,
			clients: [client],
		});
		await created.body?.cancel();
		if (created.status === 201) return { createdRealm: true, createdClient: true };
		if (created.status !== 409) expectStatus(created, 201, "创建 Keycloak Realm");
		const reread = await get(realmPath);
		await reread.body?.cancel();
		expectStatus(reread, 200, "读取并发创建的 Keycloak Realm");
	} else {
		expectStatus(existingRealm, 200, "读取 Keycloak Realm");
	}

	return await ensureClient(`${realmPath}/clients`, client, get, write);
}

async function ensureClient(clientsPath, client, get, write) {
	const { clientId } = client;
	const findClient = async () => {
		const response = await get(`${clientsPath}?${new URLSearchParams({ clientId })}`);
		expectStatus(response, 200, "查询 Keycloak 客户端");
		return (await response.json()).find((item) => item.clientId === clientId);
	};
	let existing = await findClient();
	if (!existing) {
		const created = await write("POST", clientsPath, client);
		await created.body?.cancel();
		if (created.status === 201) return { createdRealm: false, createdClient: true };
		if (created.status === 409) existing = await findClient();
		if (!existing) expectStatus(created, 201, "创建 Keycloak 客户端");
	}

	const existingRedirects = existing.redirectUris ?? [];
	const existingOrigins = existing.webOrigins ?? [];
	if (
		client.redirectUris.some((uri) => !existingRedirects.includes(uri)) ||
		client.webOrigins.some((origin) => !existingOrigins.includes(origin))
	) {
		const updated = await write("PUT", `${clientsPath}/${encodeURIComponent(existing.id)}`, {
			redirectUris: [...new Set([...existingRedirects, ...client.redirectUris])],
			webOrigins: [...new Set([...existingOrigins, ...client.webOrigins])],
		});
		await updated.body?.cancel();
		expectStatus(updated, 204, "更新本地 Keycloak 回跳地址");
	}
	return { createdRealm: false, createdClient: false };
}
