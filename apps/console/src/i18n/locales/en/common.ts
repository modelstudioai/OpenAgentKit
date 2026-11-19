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
};
