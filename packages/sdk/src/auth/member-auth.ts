import { AbortScope } from "../internal/abort-scope.ts";
import { abortableResponse } from "../internal/body.ts";
import {
	errorFromResponse,
	KitError,
	type MemberAuthView,
	type MemberLoginRequest,
	type MemberView,
} from "../protocol/index.ts";
import type { ChatProvider } from "../providers/contract.ts";
import { createKitClient, type KitClient } from "../providers/kit/client.ts";
import { createRequest, type RequestClient } from "../request/index.ts";

export interface StoredMemberSession {
	access_token: string;
	expires_at: string;
}

/** 存储由宿主按完整 apiBaseUrl 隔离；core 不访问浏览器存储。 */
export interface MemberSessionStorage {
	load(): StoredMemberSession | null;
	save(session: StoredMemberSession | null): void;
}

/** 宿主持有 OIDC 协议和内存凭据；SDK 持有 Kit 身份及请求生命周期。 */
export interface MemberOidcSession {
	restore(): Promise<StoredMemberSession | null>;
	login(): Promise<void>;
	refresh(): Promise<StoredMemberSession>;
	clear(): void;
}

interface MemberAuthConnection {
	baseUrl: string;
	fetchImpl?: typeof fetch;
	/** 使用与自建后端相同的公开 Request/Provider 接入；每次身份绑定只创建一次。 */
	createChatProvider?: (request: RequestClient) => ChatProvider;
	/** Public data Client factory; the Request is bound to the same immutable identity as ChatProvider. */
	createClient?: (request: RequestClient) => KitClient;
}

export type MemberAuthOptions = MemberAuthConnection &
	(
		| { mode: "member" | "anonymous"; storage: MemberSessionStorage }
		/** 提供 storage 时同时支持 Kit 密码登录，OIDC 凭据仍由宿主保存在内存中。 */
		| { mode: "oidc"; oidc: MemberOidcSession; storage?: MemberSessionStorage }
	);

export interface MemberAuthSnapshot {
	status: "checking" | "signed-out" | "signed-in" | "anonymous" | "error";
	member: MemberView | null;
	client: KitClient | null;
	chatProvider: ChatProvider | null;
	generation: number;
	error: string | null;
	errorDetail: KitError | null;
	pending: boolean;
}

interface OidcEpoch {
	current: StoredMemberSession;
	candidate?: StoredMemberSession;
	memberId?: string;
	refreshAt: number;
	retryDelay: number;
	refresh?: Promise<void>;
	streams: AbortController;
	tokens: Map<string, string>;
}

interface Epoch {
	abort: AbortController;
	client: KitClient;
	chatProvider: ChatProvider | null;
	oidc?: OidcEpoch;
}

const initialOidcRetryDelay = 1_000;

function retryableOidcRefresh(error: unknown): boolean {
	if (error instanceof KitError) {
		return error.status === 429 || (error.status !== 401 && error.status !== 403 && error.retryable);
	}
	return error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError");
}

function streamEpoch(owner: Epoch, options: Parameters<ChatProvider["stream"]>[1]) {
	const requestSignal = options?.signal;
	const rotation = owner.oidc?.streams.signal;
	return {
		options: rotation
			? { ...options, signal: AbortSignal.any([owner.abort.signal, rotation, requestSignal ?? owner.abort.signal]) }
			: options,
		assertNotRotated() {
			if (rotation?.aborted && !owner.abort.signal.aborted && !requestSignal?.aborted) throw rotation.reason;
		},
	};
}

function loginFailureState(error: unknown, pendingLogout: boolean): Pick<MemberAuthSnapshot, "error" | "errorDetail"> {
	if (pendingLogout) return { error: "服务端退出未完成，本地已锁定，请检查连接后重试。", errorDetail: null };
	return {
		error: error instanceof Error ? error.message : "登录失败，请重试",
		errorDetail: error instanceof KitError ? error : null,
	};
}

/**
 * Kit 成员身份生命周期。每次登录创建独立 client；旧 client 永久失效，
 * 因此延迟读取的附件、建会话重试与旧 SSE 都不能借新成员的身份继续执行。
 */
export function createMemberAuthController(options: MemberAuthOptions) {
	const oidc = options.mode === "oidc" ? options.oidc : undefined;
	const storage = options.storage;
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const publicConnection = {
		baseUrl: options.baseUrl,
		fetchImpl: ((url, init) => fetchImpl(url, { ...init, credentials: "omit" })) as typeof fetch,
	};
	const makeClient = (connection: Parameters<typeof createRequest>[0]) =>
		options.createClient
			? options.createClient(createRequest({ ...connection, mapHttpError: errorFromResponse }))
			: createKitClient(connection as Parameters<typeof createKitClient>[0]);
	const publicClient = makeClient(publicConnection);
	const clientForToken = (token: string) =>
		makeClient({ ...publicConnection, headers: () => ({ Authorization: `Bearer ${token}` }) });
	const listeners = new Set<() => void>();
	let snapshot: MemberAuthSnapshot = {
		status: "checking",
		member: null,
		client: null,
		chatProvider: null,
		generation: 0,
		error: null,
		errorDetail: null,
		pending: false,
	};
	let epoch: Epoch | null = null;
	let expiryTimer: ReturnType<typeof setTimeout> | undefined;
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;
	let session: StoredMemberSession | null = null;
	const pendingLogout = new Set<string>();
	let started: Promise<void> | null = null;
	let disposed = false;
	let busy = false;

	function publish(patch: Partial<MemberAuthSnapshot>) {
		if (disposed) return;
		snapshot = { ...snapshot, ...patch };
		for (const listener of listeners) listener();
	}
	function detach(status: MemberAuthSnapshot["status"], pending = false) {
		epoch?.abort.abort();
		epoch = null;
		clearTimeout(expiryTimer);
		clearTimeout(refreshTimer);
		publish({
			status,
			pending,
			client: null,
			chatProvider: null,
			member: null,
			generation: snapshot.generation + 1,
			error: null,
			errorDetail: null,
		});
	}
	function clearPasswordStorage() {
		try {
			storage?.save(null);
		} catch {
			/* 当前内存身份仍必须清除。 */
		}
	}
	function clearStorage() {
		clearPasswordStorage();
		try {
			oidc?.clear();
		} catch {
			/* 仍继续撤销已经记录的凭据。 */
		}
	}
	function invalidate(owner: Epoch) {
		if (disposed || epoch !== owner) return;
		session = null;
		clearStorage();
		detach("signed-out");
		publish({ error: "登录已失效，请重新登录" });
	}
	function scheduleRefresh(owner: Epoch, retryDelay?: number) {
		const state = owner.oidc;
		if (!state) return;
		const expiresAt = Date.parse(state.current.expires_at);
		const now = Date.now();
		const refreshAt =
			retryDelay === undefined ? expiresAt - Math.min(30_000, Math.floor((expiresAt - now) / 2)) : now + retryDelay;
		if (retryDelay === undefined) {
			clearTimeout(expiryTimer);
			state.retryDelay = initialOidcRetryDelay;
			// 独立到期计时，续期请求挂起时也能及时回收旧身份。
			function expire() {
				const remaining = expiresAt - Date.now();
				if (remaining > 0) expiryTimer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
				else invalidate(owner);
			}
			expire();
		}
		clearTimeout(refreshTimer);
		state.refreshAt = refreshAt;
		if (refreshAt >= expiresAt) return;
		function refreshWhenDue() {
			const delay = refreshAt - Date.now();
			if (delay > 0) refreshTimer = setTimeout(refreshWhenDue, Math.min(delay, 2_147_483_647));
			else void refreshOidc(owner)?.catch(() => undefined);
		}
		refreshWhenDue();
	}
	function rotateOidcToken(owner: Epoch, state: OidcEpoch, next: StoredMemberSession, verified: MemberAuthView) {
		const expiresAt = verified.expires_at;
		if (
			verified.member?.member_id !== state.memberId ||
			!expiresAt ||
			!(Date.parse(expiresAt) > Date.now()) ||
			next.access_token === state.current.access_token
		) {
			throw new KitError("unauthorized", "企业登录身份已变更，请重新登录");
		}
		state.current = { ...next, expires_at: expiresAt };
		state.candidate = undefined;
		for (const [token, expiry] of state.tokens) {
			if (Date.parse(expiry) <= Date.now()) state.tokens.delete(token);
		}
		state.tokens.set(next.access_token, expiresAt);
		const previousStreams = state.streams;
		state.streams = new AbortController();
		scheduleRefresh(owner);
		previousStreams.abort(new KitError("provider_error", "访问令牌已续期，正在恢复会话订阅", { retryable: true }));
	}
	function refreshOidc(owner: Epoch): Promise<void> | undefined {
		const state = owner.oidc;
		const source = oidc;
		if (!source || !state?.memberId || epoch !== owner || disposed || Date.now() < state.refreshAt) return;
		state.refresh ??= (async () => {
			const signal = AbortSignal.any([owner.abort.signal, AbortSignal.timeout(10_000)]);
			const scope = new AbortScope(signal);
			try {
				const candidate = state.candidate;
				const next =
					candidate && Date.parse(candidate.expires_at) > Date.now() ? candidate : await scope.wait(source.refresh());
				state.candidate = next;
				const verified = await scope.wait(clientForToken(next.access_token).auth.me(signal));
				scope.check();
				rotateOidcToken(owner, state, next, verified);
			} catch (error) {
				if (epoch === owner && Date.parse(state.current.expires_at) > Date.now() && retryableOidcRefresh(error)) {
					scheduleRefresh(owner, state.retryDelay);
					state.retryDelay = Math.min(state.retryDelay * 2, 5_000);
					return;
				}
				invalidate(owner);
				throw error;
			} finally {
				scope.dispose();
			}
		})().finally(() => {
			state.refresh = undefined;
		});
		return state.refresh;
	}
	function wrapStream(owner: Epoch, stream: ChatProvider["stream"]): ChatProvider["stream"] {
		return async (sessionId, options) => {
			await refreshOidc(owner);
			owner.abort.signal.throwIfAborted();
			const subscription = streamEpoch(owner, options);
			try {
				await stream(sessionId, subscription.options);
			} catch (error) {
				subscription.assertNotRotated();
				if (error instanceof KitError && error.code === "unauthorized") invalidate(owner);
				throw error;
			}
			subscription.assertNotRotated();
		};
	}
	function bind(token?: string, oidcToken?: StoredMemberSession): Epoch {
		const abort = new AbortController();
		const owner = { abort } as Epoch;
		if (oidcToken)
			owner.oidc = {
				current: oidcToken,
				refreshAt: Infinity,
				retryDelay: initialOidcRetryDelay,
				streams: new AbortController(),
				tokens: new Map(),
			};
		const connection = {
			baseUrl: options.baseUrl,
			headers: async (): Promise<Record<string, string>> => {
				abort.signal.throwIfAborted();
				await refreshOidc(owner);
				abort.signal.throwIfAborted();
				const current = owner.oidc?.current.access_token ?? token;
				return current ? { Authorization: `Bearer ${current}` } : {};
			},
			fetchImpl: async (url: RequestInfo | URL, init?: RequestInit) => {
				abort.signal.throwIfAborted();
				const signal = init?.signal ? AbortSignal.any([abort.signal, init.signal]) : abort.signal;
				const scope = new AbortScope(signal);
				let response: Response | undefined;
				try {
					// 外层 Request 看不到身份 signal；等待响应头也必须在本次登录的取消边界内。
					response = await scope.wait(
						fetchImpl(url, { ...init, signal, credentials: token || owner.oidc ? "omit" : "include" }),
						async (late) => {
							await late.body?.cancel().catch(() => undefined);
						},
					);
					scope.check();
					if (response.status === 401) invalidateIfCurrent(owner, init?.headers);
					// 响应返回后仍使用身份 signal；释放临时 scope 不得中断正常正文读取。
					return abortableResponse(response, signal);
				} catch (error) {
					await response?.body?.cancel().catch(() => undefined);
					throw error;
				} finally {
					scope.dispose();
				}
			},
		};
		const client = makeClient(connection);
		const provider = options.createChatProvider?.(createRequest({ ...connection, mapHttpError: errorFromResponse }));
		owner.chatProvider = provider
			? {
					transformMessage: provider.transformMessage?.bind(provider),
					...(provider.listEvents ? { listEvents: provider.listEvents.bind(provider) } : {}),
					...(provider.listThreads ? { listThreads: provider.listThreads.bind(provider) } : {}),
					...(provider.listThreadEvents ? { listThreadEvents: provider.listThreadEvents.bind(provider) } : {}),
					sendMessage: provider.sendMessage.bind(provider),
					interrupt: provider.interrupt.bind(provider),
					toolApprovals: provider.toolApprovals.bind(provider),
					submitToolApproval: provider.submitToolApproval.bind(provider),
					stream: wrapStream(owner, provider.stream.bind(provider)),
				}
			: null;
		owner.client = {
			...client,
			stream: wrapStream(owner, client.stream.bind(client)),
		};
		epoch = owner;
		return owner;
	}
	function invalidateIfCurrent(owner: Epoch, headers: HeadersInit | undefined) {
		const current = owner.oidc?.current.access_token;
		if (!current || new Headers(headers).get("authorization") === `Bearer ${current}`) invalidate(owner);
	}
	function activate(owner: Epoch, member: MemberView, value: StoredMemberSession) {
		if (epoch !== owner || disposed) return;
		const remaining = Date.parse(value.expires_at) - Date.now();
		if (!(remaining > 0)) throw new KitError("unauthorized", "登录已失效，请重新登录");
		session = value;
		if (owner.oidc) {
			clearPasswordStorage();
			owner.oidc.current = value;
			owner.oidc.memberId = member.member_id;
			owner.oidc.tokens.set(value.access_token, value.expires_at);
			scheduleRefresh(owner);
		} else expiryTimer = setTimeout(() => invalidate(owner), Math.min(remaining, 2_147_483_647));
		publish({
			status: "signed-in",
			pending: false,
			client: owner.client,
			chatProvider: owner.chatProvider,
			member,
			error: null,
		});
	}
	function signedOut() {
		if (options.mode === "anonymous") {
			const owner = bind();
			publish({
				status: "anonymous",
				client: owner.client,
				chatProvider: owner.chatProvider,
				member: null,
				pending: false,
			});
		} else publish({ status: "signed-out", client: null, member: null, pending: false });
	}
	async function revokePending() {
		for (const token of pendingLogout) {
			await clientForToken(token).auth.logout();
			pendingLogout.delete(token);
		}
	}
	function loadSession() {
		let stored: StoredMemberSession | null;
		try {
			stored = storage?.load() ?? null;
		} catch {
			throw new Error("无法读取登录状态，请检查浏览器存储后重试");
		}
		if (
			stored &&
			((!options.createClient && !stored.access_token.startsWith("kit_member_")) ||
				!(Date.parse(stored.expires_at) > Date.now()))
		) {
			clearPasswordStorage();
			return null;
		}
		return stored;
	}
	function restoreFailed(error: unknown, owner: Epoch | null) {
		if (disposed || (owner && epoch !== owner)) return;
		if ((owner ? owner.oidc : oidc) && error instanceof KitError && error.status === 403) {
			clearStorage();
			detach("signed-out");
			publish({ error: error.message, errorDetail: error });
			return;
		}
		if (owner && error instanceof KitError && error.code === "unauthorized") {
			invalidate(owner);
			return;
		}
		detach("error");
		publish({ error: "无法恢复登录状态，请检查服务连接后重试" });
	}
	async function restoreMember(owner: Epoch, issued: StoredMemberSession) {
		const current = await owner.client.auth.me();
		if (disposed || epoch !== owner) return;
		if (!current.member || !current.expires_at) throw new KitError("unauthorized", "请使用已绑定的成员账号登录");
		activate(owner, current.member, { ...issued, expires_at: current.expires_at });
	}
	async function restore() {
		if (disposed || busy) return;
		busy = true;
		detach("checking");
		let owner: Epoch | null = null;
		try {
			const oidcSession = oidc ? await oidc.restore() : null;
			if (disposed) return;
			session = oidcSession ?? loadSession();
			if (!session) {
				signedOut();
				return;
			}
			owner = oidcSession ? bind(undefined, oidcSession) : bind(session.access_token);
			await restoreMember(owner, session);
		} catch (error) {
			restoreFailed(error, owner);
		} finally {
			busy = false;
		}
	}
	function queueLogout() {
		const state = epoch?.oidc;
		if (!state) {
			if (session) pendingLogout.add(session.access_token);
			return;
		}
		pendingLogout.add(state.current.access_token);
		for (const [token, expiresAt] of state.tokens) {
			if (Date.parse(expiresAt) > Date.now()) pendingLogout.add(token);
		}
	}
	async function logout() {
		if (disposed || busy) return;
		busy = true;
		queueLogout();
		session = null;
		clearStorage();
		detach("signed-out", true);
		try {
			await revokePending();
			if (!disposed) signedOut();
		} catch {
			publish({ status: "error", error: "服务端退出未完成，本地已锁定。请检查连接后重试退出。", pending: false });
		} finally {
			busy = false;
		}
	}
	async function acceptLogin(issued: StoredMemberSession, member: MemberView) {
		if (disposed) {
			pendingLogout.add(issued.access_token);
			await revokePending();
			return;
		}
		try {
			storage?.save(issued);
		} catch {
			throw new Error("无法保存登录状态，请允许浏览器会话存储后重试");
		}
		activate(bind(issued.access_token), member, issued);
	}
	async function loginFailed(error: unknown, issued: StoredMemberSession | null) {
		if (issued) {
			pendingLogout.add(issued.access_token);
			clearStorage();
			try {
				await revokePending();
			} catch {
				/* 保留 token 供显式重试撤销。 */
			}
		}
		if (disposed) return;
		detach(pendingLogout.size ? "error" : "signed-out");
		publish(loginFailureState(error, pendingLogout.size > 0));
		throw error;
	}
	async function login(input: MemberLoginRequest) {
		if (!storage) throw new KitError("forbidden", "请使用企业登录");
		if (disposed || busy) return;
		busy = true;
		if (session) pendingLogout.add(session.access_token);
		session = null;
		clearStorage();
		detach("signed-out", true);
		let issued: StoredMemberSession | null = null;
		try {
			await revokePending();
			const result = await publicClient.auth.login(input);
			issued = { access_token: result.access_token, expires_at: result.expires_at };
			await acceptLogin(issued, result.member);
		} catch (error) {
			await loginFailed(error, issued);
		} finally {
			busy = false;
			publish({ pending: false });
		}
	}
	async function loginWithOidc() {
		if (!oidc || disposed || busy || snapshot.status === "signed-in") return;
		busy = true;
		publish({ pending: true, error: null, errorDetail: null });
		try {
			await revokePending();
			if (!disposed) await oidc.login();
		} catch (error) {
			await loginFailed(error, null);
		} finally {
			busy = false;
			publish({ pending: false });
		}
	}
	return {
		mode: options.mode,
		passwordLogin: Boolean(storage),
		getSnapshot: () => snapshot,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		start: () => {
			started ??= restore();
			return started;
		},
		login,
		loginWithOidc,
		logout,
		retry: () => (pendingLogout.size ? logout() : restore()),
		dispose: () => {
			disposed = true;
			epoch?.abort.abort();
			epoch = null;
			clearTimeout(expiryTimer);
			clearTimeout(refreshTimer);
			listeners.clear();
		},
	};
}

export type MemberAuthController = ReturnType<typeof createMemberAuthController>;
