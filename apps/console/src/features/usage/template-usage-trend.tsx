import { ErrorState } from "@openagentpack/kit-chat-ui";
import type { TemplateUsageTrendPoint } from "@openagentpack/kit-sdk/protocol";
import { Segmented, Select } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import styles from "./usage.module.less";

function shortDay(day: string) {
	return day.slice(5).replace("-", "/");
}

type TrendMetric = "tokens" | "active_seconds";

/** 单个汇总数字：小标签 + 大号数字（与统计卡同款结构，趋势卡内独立声明避免跨文件导出私有组件）。 */
function TrendTotal({ label, value, unit }: { label: string; value: number; unit?: string }) {
	return (
		<div className={styles.totalItem}>
			<dt className={styles.totalLabel}>{label}</dt>
			<dd className={styles.totalValue}>
				{value.toLocaleString("zh-CN", { maximumFractionDigits: unit ? 1 : 0 })}
				{unit ? <span className={styles.totalUnit}>{unit}</span> : null}
			</dd>
		</div>
	);
}

/** 指标切换：Token 消耗 / 运行时长（两者量级悬殊，图内一次展示一个，汇总行始终同时给出两个总数）。 */
function TrendMetricToggle({ value, onChange }: { value: TrendMetric; onChange: (metric: TrendMetric) => void }) {
	const { t } = useTranslation("usage");
	return (
		<Segmented
			aria-label={t("trend.metricAria")}
			value={value}
			onChange={(next) => onChange(next as TrendMetric)}
			options={[
				{ label: t("trend.metricTokens"), value: "tokens" },
				{ label: t("trend.metricSeconds"), value: "active_seconds" },
			]}
		/>
	);
}

/** 每日单指标柱状图：div 柱 + 三档虚线刻度 + 底部日期；今天（to_day）用实色强调，柱高变化走冻结动效 token。 */
function TrendChart({
	points,
	metric,
	toDay,
}: {
	points: TemplateUsageTrendPoint[];
	metric: TrendMetric;
	toDay: string;
}) {
	const { t } = useTranslation("usage");
	const max = Math.max(...points.map((point) => point[metric]), 0);
	const unit = metric === "tokens" ? t("trend.unitToken") : ` ${t("unitSeconds")}`;
	const fmt = (value: number) => value.toLocaleString("zh-CN", { maximumFractionDigits: metric === "tokens" ? 0 : 1 });
	return (
		<div className={styles.chart}>
			{/* pt-3 给 y 轴最上方的 max 刻度留出上溢空间（-translate-y-1/2 会探出容器半行），避免与汇总行重叠。 */}
			<div className={styles.chartAxis}>
				{[0, 1, 2, 3].map((step) => (
					<span key={step} className={styles.axisTick} style={{ bottom: `${(step * 100) / 3}%` }}>
						{fmt((max * step) / 3)}
					</span>
				))}
			</div>
			<div className={styles.chartPlot}>
				<div className={styles.chartArea}>
					{[0, 1, 2, 3].map((step) => (
						<div
							key={step}
							className={step === 0 ? styles.gridLine : `${styles.gridLine} ${styles.gridLineDashed}`}
							style={{ bottom: `${(step * 100) / 3}%` }}
						/>
					))}
					<div className={styles.barsRow}>
						{points.map((point) => (
							<div
								key={point.day}
								className={styles.barSlot}
								title={`${shortDay(point.day)} · ${fmt(point[metric])}${unit}`}
							>
								<div
									className={`${styles.bar} ${point.day === toDay ? styles.barToday : styles.barPast}`}
									style={{ height: `${(point[metric] / max) * 100}%` }}
								/>
							</div>
						))}
					</div>
				</div>
				<div className={styles.chartXAxis}>
					{points.map((point) => (
						<span key={point.day} className={styles.xLabel}>
							{shortDay(point.day)}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}

/** 模版用量逐日趋势卡：柱状图展示每日 Token 消耗与运行时长；数据来自限额账本条目逐日账（启用后开始记录）。
 * templateId 缺省为「全部」视角（全部模版条目求和），由服务端零值补全到今天（UTC 日键）。 */
export function TemplateUsageTrendCard({ templateId }: { templateId?: string }) {
	const { t } = useTranslation("usage");
	const client = useMemo(getAdminClient, []);
	const [days, setDays] = useState<7 | 14 | 28>(7);
	const [metric, setMetric] = useState<TrendMetric>("tokens");
	const query = useAdminQuery(`usage:template-trend:${templateId ?? "all"}:${days}`, (signal) =>
		client.usage.templateTrend({ ...(templateId ? { templateId } : {}), days }, signal),
	);
	const loading = query.loading || (!query.data && !query.error);
	const trend = query.data;
	const points = trend?.data ?? [];
	return (
		<section aria-labelledby="template-usage-trend-heading" className={styles.card}>
			<div className={styles.cardHeader}>
				<h3 id="template-usage-trend-heading" className={styles.cardTitle}>
					{t("trend.title")}
				</h3>
				<div className={styles.headerControls}>
					<TrendMetricToggle value={metric} onChange={setMetric} />
					<Select
						aria-label={t("trend.daysAria")}
						className={styles.daysSelect}
						value={days}
						onChange={(value) => setDays(value as 7 | 14 | 28)}
						options={[
							{ value: 7, label: t("trend.days7") },
							{ value: 14, label: t("trend.days14") },
							{ value: 28, label: t("trend.days28") },
						]}
					/>
				</div>
			</div>
			{loading ? (
				<p role="status" className={styles.loadingText}>
					{t("trend.loading")}
				</p>
			) : null}
			{query.error ? <ErrorState message={query.error} onRetry={() => void query.refresh()} /> : null}
			{!loading && !query.error && trend ? (
				<>
					<dl className={styles.totals}>
						<TrendTotal
							label={t("trend.totalTokens", { days })}
							value={points.reduce((sum, point) => sum + point.tokens, 0)}
						/>
						<TrendTotal
							label={t("trend.totalSeconds", { days })}
							value={points.reduce((sum, point) => sum + point.active_seconds, 0)}
							unit={t("unitSeconds")}
						/>
					</dl>
					{points.some((point) => point[metric] > 0) ? (
						<TrendChart points={points} metric={metric} toDay={trend.to_day} />
					) : (
						<p className={styles.emptyChart}>{t("trend.emptyChart")}</p>
					)}
					<p className={styles.footnote}>
						{t("trend.footnote", {
							from: shortDay(trend.from_day),
							to: shortDay(trend.to_day),
							since: trend.since_day ? t("trend.sinceRecorded", { day: trend.since_day }) : t("trend.sinceNone"),
						})}
					</p>
				</>
			) : null}
		</section>
	);
}
