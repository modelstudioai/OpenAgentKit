/** 键必须与 zh-CN 双向对齐（pnpm check:i18n 强制）；语言名按惯例用该语言自称，两种词表中保持一致。 */
export default {
	serverErrors: {
		invalid_request: "The request parameters are invalid",
		unauthorized: "Your session has expired. Sign in again.",
		forbidden: "This identity cannot perform this action",
		not_found: "The requested resource does not exist",
		conflict: "The state changed. Refresh and try again.",
		confirmation_required: "Confirm the action again",
		rate_limited: "Too many requests. Try again later.",
		quota_exceeded: "Insufficient quota",
		request_pending: "A request is already pending",
		provider_error: "The upstream service is temporarily unavailable",
		not_implemented: "This operation is not implemented yet",
		internal: "Internal server error",
	},
	languageSwitcher: {
		label: "Interface language",
		zh: "中文",
		en: "English",
	},
	appTitle: "OpenAgentPack Kit Workspace",
	bootstrapFailed: "Unable to load the service configuration",
	loading: "Loading…",
};
