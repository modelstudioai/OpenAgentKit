import type { MemberOidcSession, StoredMemberSession } from "@openagentkit/sdk/auth";
import { KitError, type OidcClientConfig } from "@openagentkit/sdk/protocol";
import Keycloak from "keycloak-js";

function returnKey() {
	return `kit:oidc:return:${window.location.pathname}`;
}

function isCallback() {
	const params = new URLSearchParams(window.location.hash.slice(1));
	return params.has("state") && (params.has("code") || params.has("error"));
}

/** 在第一次读取 /api/config 之前恢复后端地址和应用深链，然后由适配器校验回调。 */
export function restoreOidcReturnLocation() {
	if (!isCallback()) return;
	const search = window.sessionStorage.getItem(returnKey());
	window.sessionStorage.removeItem(returnKey());
	if (search?.startsWith("?")) {
		const url = new URL(window.location.href);
		url.search = search;
		window.history.replaceState(window.history.state, "", url);
	}
}

export function createKeycloakSession(config: OidcClientConfig, apiBaseUrl: string): MemberOidcSession {
	const issuer = new URL(config.issuer);
	const realmPath = issuer.pathname.match(/^(.*)\/realms\/([A-Za-z0-9._-]+)$/);
	const prefix = realmPath?.[1] ?? "";
	const realm = realmPath?.[2] ?? "";
	if (!realm) throw new Error("企业登录地址缺少 Keycloak Realm");
	const markerKey = `kit:oidc:session:${JSON.stringify([apiBaseUrl, config.issuer, config.clientId])}`;
	const redirectUri = `${window.location.origin}${window.location.pathname}`;
	let client: Keycloak | undefined;
	let initialized: Promise<Keycloak> | undefined;
	let generation = 0;

	function saveReturnLocation() {
		window.sessionStorage.setItem(returnKey(), window.location.search);
	}

	function initialize(restore: boolean) {
		if (initialized) return initialized;
		const checkSso = restore && !isCallback() && window.sessionStorage.getItem(markerKey) === "1";
		if (checkSso) {
			// 在跳转前消费恢复标记，避免 Keycloak 无会话时重复导航。
			window.sessionStorage.removeItem(markerKey);
			saveReturnLocation();
		}
		const instance = new Keycloak({ url: `${issuer.origin}${prefix}`, realm, clientId: config.clientId });
		client = instance;
		initialized = instance
			.init({
				flow: "standard",
				pkceMethod: "S256",
				responseMode: "fragment",
				checkLoginIframe: false,
				redirectUri,
				...(checkSso ? { onLoad: "check-sso" as const } : {}),
			})
			.then(() => instance)
			.catch(() => {
				initialized = undefined;
				window.sessionStorage.removeItem(returnKey());
				throw new Error("无法完成企业登录，请检查 Keycloak 连接后重试");
			});
		return initialized;
	}

	function accessToken(instance: Keycloak): StoredMemberSession | null {
		const seconds = instance.tokenParsed?.exp;
		return instance.token && typeof seconds === "number"
			? { access_token: instance.token, expires_at: new Date(seconds * 1000).toISOString() }
			: null;
	}

	return {
		async restore() {
			const epoch = generation;
			const instance = await initialize(true);
			if (epoch !== generation) {
				instance.clearToken();
				return null;
			}
			const token = accessToken(instance);
			if (token) window.sessionStorage.setItem(markerKey, "1");
			else window.sessionStorage.removeItem(markerKey);
			return token;
		},
		async login() {
			const instance = await initialize(false);
			saveReturnLocation();
			try {
				await instance.login({ redirectUri });
			} catch {
				window.sessionStorage.removeItem(returnKey());
				throw new Error("无法打开企业登录，请重试");
			}
		},
		async refresh() {
			const epoch = generation;
			const instance = await initialize(false);
			try {
				await instance.updateToken(-1);
			} catch (error) {
				const response = error instanceof Error && "response" in error ? error.response : undefined;
				if (response instanceof Response && (response.status === 429 || response.status >= 500))
					throw new KitError("provider_error", "暂时无法续期企业登录，请稍后重试", { retryable: true });
				throw error;
			}
			if (epoch !== generation) {
				instance.clearToken();
				throw new Error("企业登录已结束");
			}
			const token = accessToken(instance);
			if (!token) throw new Error("企业登录已失效，请重新登录");
			return token;
		},
		clear() {
			generation++;
			client?.clearToken();
			window.sessionStorage.removeItem(markerKey);
			window.sessionStorage.removeItem(returnKey());
		},
	};
}
