import type { MemberSessionUsage, MemberUsageSummary } from "@openagentpack/kit-sdk/protocol";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import styles from "./members.module.less";

/** 采集状态 → common 词典键；成员与用量页面共用。 */
export const collectionLabels: Record<
	MemberSessionUsage["collection_status"],
	"collection.pending" | "collection.complete" | "collection.partial" | "collection.failed" | "collection.notFound"
> = {
	pending: "collection.pending",
	complete: "collection.complete",
	partial: "collection.partial",
	failed: "collection.failed",
	not_found: "collection.notFound",
};

/** 指标键 → common 词典键（跨成员/用量页面共用）。 */
export const usageMetrics = [
	["input_tokens", "metrics.inputTokens"],
	["output_tokens", "metrics.outputTokens"],
	["cache_read_input_tokens", "metrics.cacheRead"],
	["cache_creation_input_tokens", "metrics.cacheWrite"],
	["active_seconds", "metrics.activeSeconds"],
	["duration_seconds", "metrics.durationSeconds"],
] as const;

export function usageValue(
	summary: Pick<MemberUsageSummary, "metrics" | "session_count"> | undefined,
	key: (typeof usageMetrics)[number][0],
	t: TFunction<"common">,
) {
	const metric = summary?.metrics[key];
	if (!metric || metric.value === null) return t("collection.pending");
	const value = metric.value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
	return metric.covered_sessions < (summary?.session_count ?? 0) ? `${value}${t("collection.partialSuffix")}` : value;
}

export function UsageMetrics({ summary }: { summary: Pick<MemberUsageSummary, "metrics" | "session_count"> }) {
	const { t } = useTranslation();
	return (
		<dl className={styles.metricsGrid}>
			{usageMetrics.map(([key, labelKey]) => (
				<div key={key} className={styles.metricCard} data-testid={`usage-${key}`}>
					<dt className={styles.metricLabel}>{t(labelKey)}</dt>
					<dd className={styles.metricValue}>{usageValue(summary, key, t)}</dd>
					<dd className={styles.metricHint}>
						{t("collection.coverage", {
							covered: summary.metrics[key].covered_sessions,
							total: summary.session_count,
						})}
					</dd>
				</div>
			))}
		</dl>
	);
}
