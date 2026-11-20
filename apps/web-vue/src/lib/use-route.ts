import { type ComputedRef, computed, onScopeDispose, ref } from "vue";

/**
 * 查询参数视图路由（静态托管，不引入 path router）。
 *
 * 与 React 版保持同一深链语义：`?agent=` 直达会话，`?view=usage` 直达用量页；
 * 其余地址回落广场首页。后续新增视图时在此扩展 ViewId 与 parseRoute。
 */
export type ViewId = "plaza" | "chat" | "usage";

export interface RouteTarget {
	view?: ViewId;
	/** chat 深链的 agent slug；留在 chat 时缺省沿用当前值，传 null 显式清除。 */
	agent?: string | null;
	/** chat 深链的会话 id；留在 chat 时缺省沿用当前值，传 null 显式清除。 */
	session?: string | null;
}

export interface RouteState {
	view: ViewId;
	agentSlug: string | null;
	sessionId: string | null;
}

export type NavigateFn = (next: RouteTarget, options?: { replace?: boolean }) => void;

export interface UseRouteResult {
	view: ComputedRef<ViewId>;
	agentSlug: ComputedRef<string | null>;
	sessionId: ComputedRef<string | null>;
	navigate: NavigateFn;
}

const ROUTE_EVENT = "kit:route-change";

export function parseRoute(search: string): RouteState {
	const params = new URLSearchParams(search);
	const agent = params.get("agent");
	if (agent) return { view: "chat", agentSlug: agent, sessionId: params.get("session") };
	if (params.get("view") === "usage") return { view: "usage", agentSlug: null, sessionId: null };
	return { view: "plaza", agentSlug: null, sessionId: null };
}

/**
 * 生成目标 search：只接管 `agent` / `session`，其余参数（如宿主联调用的 `api=`）原样保留。
 * `view: "chat"` 未显式给 agent/session 时沿用当前值，避免产出没有 agent 的聊天地址。
 */
export function routeSearch(next: RouteTarget, base: string = window.location.search): string {
	const params = new URLSearchParams(base);
	const current = params.get("agent");
	const currentSession = params.get("session");
	params.delete("agent");
	params.delete("view");
	params.delete("session");
	const agent = next.agent !== undefined ? next.agent : next.view === "chat" ? current : null;
	if (agent) params.set("agent", agent);
	else if (next.view === "usage") params.set("view", "usage");
	const session = next.session !== undefined ? next.session : next.view === "chat" ? currentSession : null;
	if (session) params.set("session", session);
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}

/** 给 `<a href>` 用的真实 URL：与 navigate 目标一致，保留中键/新标签打开能力。 */
export function routeHref(next: RouteTarget): string {
	return `${window.location.pathname}${routeSearch(next)}`;
}

/** Vue 版路由状态：pushState 不触发 popstate，因此导航后广播自定义事件同步所有实例。 */
export function useRoute(): UseRouteResult {
	const route = ref<RouteState>(parseRoute(window.location.search));

	const sync = () => {
		route.value = parseRoute(window.location.search);
	};
	window.addEventListener("popstate", sync);
	window.addEventListener(ROUTE_EVENT, sync);
	onScopeDispose(() => {
		window.removeEventListener("popstate", sync);
		window.removeEventListener(ROUTE_EVENT, sync);
	});

	const navigate: NavigateFn = (next, options) => {
		const url = `${window.location.pathname}${routeSearch(next)}`;
		if (options?.replace) window.history.replaceState(null, "", url);
		else window.history.pushState(null, "", url);
		window.dispatchEvent(new Event(ROUTE_EVENT));
	};

	return {
		view: computed(() => route.value.view),
		agentSlug: computed(() => route.value.agentSlug),
		sessionId: computed(() => route.value.sessionId),
		navigate,
	};
}
