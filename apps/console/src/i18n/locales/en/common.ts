/** 键必须与 zh-CN 双向对齐（pnpm check:i18n 强制）；语言名按惯例用该语言自称，两种词表中保持一致。 */
export default {
	languageSwitcher: {
		label: "Interface language",
		zh: "中文",
		en: "English",
	},
	metrics: {
		inputTokens: "Input tokens",
		outputTokens: "Output tokens",
		cacheRead: "Cache read tokens",
		cacheWrite: "Cache write tokens",
		activeSeconds: "Execution time (s)",
		durationSeconds: "Session time (s)",
	},
	collection: {
		pending: "Pending",
		complete: "Collected",
		partial: "Partially missing",
		failed: "Collection failed",
		notFound: "Remote session not found",
		partialSuffix: " (partially missing)",
		coverage: "Covers {{covered}} of {{total}} sessions",
		notReturned: "Not returned",
	},
	statPending: "Pending",
	back: "Back",
	runtime: {
		configReadFailed: "Unable to read the service configuration",
		adminNotReady: "Admin service configuration is not initialized",
		invalidBaseUrl: "The admin service URL must be an HTTP(S) URL without credentials, query parameters, or fragments",
		missingRouterContext: "Missing admin router context",
		missingTemplateExitContext: "Missing agent exit confirmation context",
	},
	footnote: {
		agentAssets:
			"Agent assets are used to create, edit, and debug agents; agent management provides listing and unlisting actions.",
	},
	validation: {
		invalidType: "A field is missing or has an invalid data type",
		tooSmall: "The value is empty or too short",
		tooBig: "The value exceeds the length limit",
		invalidValue: "The value is outside the supported range",
		invalidFormat: "Invalid format",
		unrecognizedKeys: "The value contains unsupported fields",
		invalid: "The field format or reference is invalid",
	},
};
