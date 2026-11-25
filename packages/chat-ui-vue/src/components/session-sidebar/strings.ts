import type { KitStringTable } from "../kit-i18n/index.ts";

/** SessionSidebar 文案键；title/name 插值位仅承载分组展示名（数据），不带句式假设。 */
export interface SessionSidebarStrings {
	searchPlaceholder: string;
	closeError: string;
	agents: string;
	recent: string;
	recentSessions: string;
	allSessions: string;
	sessionsTitle: string;
	listAria: string;
	searchResultsAria: string;
	loadMore: string;
	loadingMore: string;
	loadingSessions: string;
	loadingTitle: string;
	emptyTitle: string;
	noMatchLoaded: string;
	noMatch: string;
	noMatchShort: string;
	firstUse: string;
	firstUseHint: string;
	loadedCount: string;
	newInGroup: string;
}

const sessionSidebarStrings: KitStringTable<SessionSidebarStrings> = {
	"zh-CN": {
		searchPlaceholder: "搜索会话",
		closeError: "关闭错误提示",
		agents: "智能体",
		recent: "最近",
		recentSessions: "最近会话",
		allSessions: "全部会话",
		sessionsTitle: "会话",
		listAria: "会话列表：{{name}}",
		searchResultsAria: "搜索结果：{{name}}",
		loadMore: "加载更多会话",
		loadingMore: "正在加载更多会话…",
		loadingSessions: "正在加载会话…",
		loadingTitle: "正在加载{{title}}…",
		emptyTitle: "暂无{{title}}",
		noMatchLoaded: "已加载会话中无匹配项",
		noMatch: "没有匹配的会话",
		noMatchShort: "无匹配会话",
		firstUse: "还没有会话记录",
		firstUseHint: "发送第一条消息后，会话会显示在这里。",
		loadedCount: "已加载 {{count}} 条会话",
		newInGroup: "在{{name}}中新建会话",
	},
	en: {
		searchPlaceholder: "Search sessions",
		closeError: "Dismiss error notice",
		agents: "Agents",
		recent: "Recent",
		recentSessions: "Recent sessions",
		allSessions: "All sessions",
		sessionsTitle: "Sessions",
		listAria: "Session list: {{name}}",
		searchResultsAria: "Search results: {{name}}",
		loadMore: "Load more sessions",
		loadingMore: "Loading more sessions…",
		loadingSessions: "Loading sessions…",
		loadingTitle: "Loading {{title}}…",
		emptyTitle: "No {{title}} yet",
		noMatchLoaded: "No matches among loaded sessions",
		noMatch: "No matching sessions",
		noMatchShort: "No matching sessions",
		firstUse: "No sessions yet",
		firstUseHint: "Sessions will show up here after you send the first message.",
		loadedCount: "{{count}} sessions loaded",
		newInGroup: "New session in {{name}}",
	},
};

export default sessionSidebarStrings;
export { sessionSidebarStrings };
