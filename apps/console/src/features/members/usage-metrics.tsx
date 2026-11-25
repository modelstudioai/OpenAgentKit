import { InfoCircleOutlined } from "@ant-design/icons";
import type { MemberSessionUsage, MemberUsageSummary } from "@openagentkit/sdk/protocol";
import type { TFunction } from "i18next";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { StatCard, StatCell } from "../../lib/stat-card.tsx";

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

/** 指标口径说明 → common 词典键（字面量联合保证 t() 类型检查）。 */
const metricNotes: Record<
	(typeof usageMetrics)[number][0],
	| "metrics.notes.inputTokens"
	| "metrics.notes.outputTokens"
	| "metrics.notes.cacheRead"
	| "metrics.notes.cacheWrite"
	| "metrics.notes.activeSeconds"
	| "metrics.notes.durationSeconds"
> = {
	input_tokens: "metrics.notes.inputTokens",
	output_tokens: "metrics.notes.outputTokens",
	cache_read_input_tokens: "metrics.notes.cacheRead",
	cache_creation_input_tokens: "metrics.notes.cacheWrite",
	active_seconds: "metrics.notes.activeSeconds",
	duration_seconds: "metrics.notes.durationSeconds",
};

/** 成员/模版共用的用量汇总卡：蓝/灰交替浅色卡 + 覆盖数 hint，部分覆盖时警示提示。 */
export function UsageMetrics({ summary }: { summary: Pick<MemberUsageSummary, "metrics" | "session_count"> }) {
	const { t } = useTranslation();
	return (
		<dl className={styles.metricsGrid}>
			{usageMetrics.map(([key, labelKey], index) => {
				const metric = summary.metrics[key];
				const coverage = t("collection.coverage", {
					covered: metric.covered_sessions,
					total: summary.session_count,
				});
				return (
					<div key={key} data-testid={`usage-${key}`}>
						<StatCard tone={index % 2 === 0 ? "tint" : "subtle"}>
							<StatCell
								label={
									<>
										{t(labelKey)}
										<Tooltip title={t(metricNotes[key])}>
											{/* 装饰性提示图标：悬停出口径说明，完整口径文本在下方「口径说明」弹层（含读屏路径）。 */}
											<span aria-hidden="true" className={styles.metricInfo}>
												<InfoCircleOutlined />
											</span>
										</Tooltip>
									</>
								}
								value={metric.value}
								hint={
									metric.covered_sessions < summary.session_count ? (
										<span className={styles.partialHint}>{coverage} · {t("collection.partial")}</span>
									) : (
										coverage
									)
								}
							/>
						</StatCard>
					</div>
				);
			})}
		</dl>
	);
}
