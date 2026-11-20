import type { UsageGranularity, UsageTrend, UsageTrendPoint } from "@openagentkit/sdk/protocol";
import { ErrorState } from "@openagentpack/kit-chat-ui";
import { Segmented, Tooltip } from "antd";
import { type MouseEvent, useMemo, useRef, useState } from "react";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import styles from "./usage.module.less";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function shortDay(day: string) {
	return day.slice(5).replace("-", "/");
}

/** 粒度 → start_time 键长：hour "YYYY-MM-DDTHH"、day "YYYY-MM-DD"、month "YYYY-MM"。 */
const BUCKET_KEY_LENGTH = { hour: 13, day: 10, month: 7 } as const;

/** 桶键：统一在 UTC+8 墙钟域生成（Provider start_time 为 +08:00 RFC 3339，两种来源 slice 结果一致）。 */
function bucketKey(granularity: UsageGranularity, ms: number) {
	return new Date(ms + 8 * HOUR_MS).toISOString().slice(0, BUCKET_KEY_LENGTH[granularity]);
}

/** 桶起点（毫秒）：hour 按 UTC 整点（+08:00 是整小时偏移），day/month 在 UTC+8 墙钟域对齐。 */
function bucketStart(granularity: UsageGranularity, ms: number) {
	if (granularity === "hour") return Math.floor(ms / HOUR_MS) * HOUR_MS;
	const shifted = ms + 8 * HOUR_MS;
	const date = new Date(shifted);
	if (granularity === "month") return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) - 8 * HOUR_MS;
	return Math.floor(shifted / DAY_MS) * DAY_MS - 8 * HOUR_MS;
}

function nextBucketStart(granularity: UsageGranularity, ms: number) {
	if (granularity === "month") {
		const date = new Date(ms + 8 * HOUR_MS);
		return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 8 * HOUR_MS;
	}
	return ms + (granularity === "hour" ? HOUR_MS : DAY_MS);
}

/** 桶展示文案：hour "11-17 10:00"、day "11/17"、month "2026-11"。 */
function bucketLabel(granularity: UsageGranularity, key: string) {
	if (granularity === "hour") return `${key.slice(5).replace("T", " ")}:00`;
	if (granularity === "month") return key;
	return shortDay(key);
}

/** 柱状图系列：Token 消耗视图为同桶双柱（总 Token + 缓存 Token），其余指标单柱；variant 区分用色。 */
interface TrendChartSeries {
	meta: TrendChartMeta;
	variant: "accent" | "secondary";
	points: TrendBucketPoint[];
}

/** 单桶单系列的取值：协议 null（来源未知）不按 0 绘制，unknown=true 由图表出基线短横并悬停标注。 */
interface TrendBucketPoint {
	key: string;
	value: number;
	unknown: boolean;
}

/** 柱状图元数据：TREND_METRICS 的条目与缓存 Token 系列共用；缓存 Token 仅作 Token 消耗视图的第二根柱，不进指标切换。 */
interface TrendChartMeta {
	label: string;
	/** 悬停文案的数值后缀；Token 系列的标签本身已含 Token，留空避免重复。 */
	unit: string;
	/** 图例中的口径说明；仅双系列图展示图例。 */
	legendHint?: string;
	decimals: number;
	pick: (total: UsageTrendPoint["usage"]["total"]) => number | null;
}

/** 趋势指标视图：Token 消耗 / 调用次数 / 失败次数（模型+工具失败，不含中断）/ 运行时长（runtime_ms 换算成秒展示）。
 * pick 返回 null 表示该桶来源未知（协议未知=null，不按 0 折算），与区间合计共用同一 read 语义。 */
const TREND_METRICS = {
	tokens: {
		label: "Token 消耗",
		unit: "",
		legendHint: "输入+输出",
		decimals: 0,
		pick: (total: UsageTrendPoint["usage"]["total"]) => total.total_tokens.value,
	},
	calls: {
		label: "调用次数",
		unit: " 次",
		decimals: 0,
		pick: (total: UsageTrendPoint["usage"]["total"]) => total.model_call_count.value,
	},
	failures: {
		label: "失败次数",
		unit: " 次",
		decimals: 0,
		pick: (total: UsageTrendPoint["usage"]["total"]) =>
			total.model_failed_count.value === null || total.tool_failed_count.value === null
				? null
				: total.model_failed_count.value + total.tool_failed_count.value,
	},
	runtime: {
		label: "运行时长",
		unit: " 秒",
		decimals: 1,
		pick: (total: UsageTrendPoint["usage"]["total"]) =>
			total.runtime_ms.value === null ? null : total.runtime_ms.value / 1000,
	},
} as const;
type TrendMetric = keyof typeof TREND_METRICS;

/** 缓存 Token = 缓存读取 + 缓存写入；与总 Token 构成 Token 消耗视图的同桶双柱。任一来源未知则该桶未知。 */
const CACHE_TOKEN_META: TrendChartMeta = {
	label: "缓存 Token",
	unit: "",
	legendHint: "缓存读取+缓存写入",
	decimals: 0,
	pick: (total) =>
		total.cache_read_tokens.value === null || total.cache_creation_tokens.value === null
			? null
			: total.cache_read_tokens.value + total.cache_creation_tokens.value,
};

/** 系列 → 柱色：accent 为主系列（主题蓝），secondary 为次系列（--kit-success 绿）。 */
const BAR_CLASSES = {
	accent: { today: styles.barAccentToday, past: styles.barAccentPast },
	secondary: { today: styles.barSecondaryToday, past: styles.barSecondaryPast },
} as const;

/** 任意时间窗的隐含分桶粒度：≤24h 按小时、≤120 天按天、更长按月（对齐原时间窗预设的口径）。 */
function granularityOf(spanMs: number): UsageGranularity {
	if (spanMs <= 24 * HOUR_MS) return "hour";
	if (spanMs <= 120 * DAY_MS) return "day";
	return "month";
}

/** Provider 省略无数据的桶；按响应粒度逐桶补齐得到稳定柱位（仅展示口径）。
 * 协议 null 表示来源未知：不按 0 补值，标记 unknown 供图表绘制与悬停区分。 */
function filledBuckets(
	trend: UsageTrend,
	pick: (total: UsageTrendPoint["usage"]["total"]) => number | null,
): TrendBucketPoint[] {
	const length = BUCKET_KEY_LENGTH[trend.granularity];
	const byKey = new Map(
		trend.points.map((point): [string, { value: number; unknown: boolean }] => {
			const metric = pick(point.usage.total);
			return [
				point.start_time.slice(0, length),
				metric === null ? { value: 0, unknown: true } : { value: metric, unknown: false },
			];
		}),
	);
	const end = Date.parse(trend.query_range.end_time) - 1;
	const buckets: TrendBucketPoint[] = [];
	for (
		let ms = bucketStart(trend.granularity, Date.parse(trend.query_range.start_time));
		ms <= end;
		ms = nextBucketStart(trend.granularity, ms)
	) {
		const key = bucketKey(trend.granularity, ms);
		const known = byKey.get(key) ?? { value: 0, unknown: false };
		buckets.push({ key, value: known.value, unknown: known.unknown });
	}
	return buckets;
}

/** 单个汇总数字：小标签 + 大号数字（与统计卡同款结构，趋势卡内独立声明避免跨文件导出私有组件）。
 * unknown 标记该指标在区间内存在未知来源：协议规定未知为 null，不按 0 计入合计，悬停出说明。 */
function TrendTotal({
	label,
	value,
	unit,
	unknown,
}: {
	label: string;
	value: number;
	unit?: string;
	unknown?: boolean;
}) {
	return (
		<div className={styles.totalItem}>
			<dt className={styles.totalLabel}>
				{label}
				{unknown ? (
					<Tooltip title="统计区间内部分来源未返回该指标，未计入合计">
						<sup className={styles.unknownMark}>含未知</sup>
					</Tooltip>
				) : null}
			</dt>
			<dd className={styles.totalValue}>
				{value.toLocaleString("zh-CN", { maximumFractionDigits: unit ? 1 : 0 })}
				{unit ? <span className={styles.totalUnit}>{unit}</span> : null}
			</dd>
		</div>
	);
}

/** 指标切换：Token 消耗 / 调用次数 / 失败次数 / 运行时长（量级悬殊，图内一次展示一个，汇总行始终同时给出五个总数）。 */
function TrendMetricToggle({ value, onChange }: { value: TrendMetric; onChange: (metric: TrendMetric) => void }) {
	return (
		<Segmented
			aria-label="趋势指标"
			value={value}
			onChange={(next) => onChange(next as TrendMetric)}
			options={(Object.keys(TREND_METRICS) as TrendMetric[]).map((value) => ({
				value,
				label: TREND_METRICS[value].label,
			}))}
		/>
	);
}

/** 柱状图：div 柱 + 三档虚线刻度 + 底部时间；同桶可并排多系列柱，当前桶（小时/日/月）实色强调，柱高变化走冻结动效 token。
 * 悬停显示跟随鼠标的列级 tooltip（日期 + 各系列数值，未知桶标「未知」）并高亮当前列；未知桶在基线出短横标记，
 * 小时粒度每 4 桶出一个 x 刻度（占位保留柱位对齐），日/月逐桶出刻度。 */
function TrendChart({
	series,
	granularity,
	currentKey,
}: {
	series: TrendChartSeries[];
	granularity: UsageGranularity;
	currentKey: string;
}) {
	const [primary] = series;
	const areaRef = useRef<HTMLDivElement>(null);
	const [hover, setHover] = useState<{ index: number; x: number; y: number; flip: boolean } | null>(null);
	if (!primary) return null;
	const max = Math.max(...series.flatMap((s) => s.points.map((point) => point.value)), 0) || 1;
	const fmtFor = (meta: TrendChartMeta) => (value: number) =>
		value.toLocaleString("zh-CN", { maximumFractionDigits: meta.decimals });
	const axisFmt = fmtFor(primary.meta);
	const buckets = primary.points.map((point) => ({
		key: point.key,
		current: point.key === currentKey,
		label: bucketLabel(granularity, point.key),
		bars: series.map((s) => {
			const bucketPoint = s.points.find((candidate) => candidate.key === point.key);
			return {
				meta: s.meta,
				variant: s.variant,
				value: bucketPoint?.value ?? 0,
				unknown: bucketPoint?.unknown ?? false,
			};
		}),
	}));
	/** barSlot 以 flex 1 严格均分绘图区宽度，x 坐标按等分即可定位悬停列；半宽翻转让 tooltip 不溢出绘图区。 */
	const onTrack = (event: MouseEvent<HTMLDivElement>) => {
		const rect = areaRef.current?.getBoundingClientRect();
		if (!rect || rect.width === 0) return;
		const x = event.clientX - rect.left;
		const index = Math.min(buckets.length - 1, Math.max(0, Math.floor((x / rect.width) * buckets.length)));
		setHover({ index, x, y: event.clientY - rect.top, flip: x > rect.width / 2 });
	};
	const hoveredBucket = hover === null ? undefined : buckets[hover.index];
	return (
		<>
			<div className={styles.chart}>
				{/* pt-3 给 y 轴最上方的 max 刻度留出上溢空间（-translate-y-1/2 会探出容器半行），避免与汇总行重叠。 */}
				<div className={styles.chartAxis}>
					{[0, 1, 2, 3].map((step) => (
						<span key={step} className={styles.axisTick} style={{ bottom: `${(step * 100) / 3}%` }}>
							{axisFmt((max * step) / 3)}
						</span>
					))}
				</div>
				<div className={styles.chartPlot}>
					<div
						ref={areaRef}
						role="img"
						aria-label="用量趋势柱状图"
						className={styles.chartArea}
						onMouseMove={onTrack}
						onMouseLeave={() => setHover(null)}
					>
						{[0, 1, 2, 3].map((step) => (
							<div
								key={step}
								className={step === 0 ? styles.gridLine : `${styles.gridLine} ${styles.gridLineDashed}`}
								style={{ bottom: `${(step * 100) / 3}%` }}
							/>
						))}
						<div className={styles.barsRow}>
							{buckets.map((bucket, index) => (
								<div
									key={bucket.key}
									className={hover?.index === index ? `${styles.barSlot} ${styles.slotHover}` : styles.barSlot}
								>
									{bucket.bars.map((bar) => (
										<div
											key={bar.meta.label}
											className={
												bar.unknown
													? `${styles.bar} ${styles.barUnknown}`
													: `${styles.bar} ${BAR_CLASSES[bar.variant][bucket.current ? "today" : "past"]}`
											}
											style={bar.unknown ? undefined : { height: `${(bar.value / max) * 100}%` }}
										/>
									))}
								</div>
							))}
						</div>
						{hover && hoveredBucket ? (
							<div
								className={styles.chartTip}
								data-flip={hover.flip ? "left" : "right"}
								style={{ left: hover.x, top: hover.y }}
							>
								<p className={styles.chartTipTitle}>{hoveredBucket.label}</p>
								{hoveredBucket.bars.map((bar) => (
									<p key={bar.meta.label} className={styles.chartTipRow}>
										<i
											aria-hidden="true"
											className={`${styles.chartTipDot} ${bar.variant === "accent" ? styles.legendAccent : styles.legendSecondary}`}
										/>
										<span className={styles.chartTipLabel}>{bar.meta.label}</span>
										<span className={styles.chartTipValue}>
											{bar.unknown ? "未知" : `${fmtFor(bar.meta)(bar.value)}${bar.meta.unit}`}
										</span>
									</p>
								))}
							</div>
						) : null}
					</div>
					<div className={styles.chartXAxis}>
						{primary.points.map((point) => (
							<span key={point.key} className={styles.xLabel}>
								{granularity === "hour" && Number(point.key.slice(11, 13)) % 4 !== 0
									? ""
									: bucketLabel(granularity, point.key)}
							</span>
						))}
					</div>
				</div>
			</div>
			{series.length > 1 ? (
				<div className={styles.chartLegend}>
					{series.map((s) => (
						<span key={s.meta.label} className={styles.legendItem}>
							<i aria-hidden="true" className={s.variant === "accent" ? styles.legendAccent : styles.legendSecondary} />
							{s.meta.label}
							{s.meta.legendHint ? `（${s.meta.legendHint}）` : ""}
						</span>
					))}
				</div>
			) : null}
		</>
	);
}

/** 图表区：Token 消耗视图为总 Token + 缓存 Token 同桶双柱，其余指标单柱。 */
function TrendChartArea({ metric, trend, currentKey }: { metric: TrendMetric; trend: UsageTrend; currentKey: string }) {
	if (metric !== "tokens") {
		return (
			<TrendChart
				series={[
					{
						meta: TREND_METRICS[metric],
						variant: "accent",
						points: filledBuckets(trend, TREND_METRICS[metric].pick),
					},
				]}
				granularity={trend.granularity}
				currentKey={currentKey}
			/>
		);
	}
	return (
		<TrendChart
			series={[
				{
					meta: TREND_METRICS.tokens,
					variant: "accent",
					points: filledBuckets(trend, TREND_METRICS.tokens.pick),
				},
				{
					meta: CACHE_TOKEN_META,
					variant: "secondary",
					points: filledBuckets(trend, CACHE_TOKEN_META.pick),
				},
			]}
			granularity={trend.granularity}
			currentKey={currentKey}
		/>
	);
}

/** 区间合计：未知指标（null）不按 0 计入，单独标 unknown 供「含未知」标记（P2-7）。 */
function sumTotals(
	points: UsageTrendPoint[],
	read: (total: UsageTrendPoint["usage"]["total"]) => number | null,
): { value: number; unknown: boolean } {
	let value = 0;
	let unknown = false;
	for (const point of points) {
		const metric = read(point.usage.total);
		if (metric === null) unknown = true;
		else value += metric;
	}
	return { value, unknown };
}

/** 区间五项合计：未知来源不按 0 计入并单独标记（P2-7）；read 语义与图表 pick 共用，避免图表与合计口径漂移。 */
function trendTotals(trend: UsageTrend) {
	return {
		tokens: sumTotals(trend.points, TREND_METRICS.tokens.pick),
		cache: sumTotals(trend.points, CACHE_TOKEN_META.pick),
		calls: sumTotals(trend.points, TREND_METRICS.calls.pick),
		failures: sumTotals(trend.points, TREND_METRICS.failures.pick),
		runtime: sumTotals(trend.points, TREND_METRICS.runtime.pick),
	};
}

/** 「全部」口径部分成功提示：coverage 仅在部分模版绑定智能体查询失败时出现。 */
function TrendCoverageNote({ trend }: { trend: UsageTrend }) {
	if (!trend.coverage || trend.coverage.complete) return null;
	return (
		<p role="status" className={styles.loadingText}>
			部分智能体数据缺失（{trend.coverage.missing_agent_ids.join("、")}），以下合计不含其用量。
		</p>
	);
}

/** 趋势卡内容：coverage 提示 + 五项合计（未知来源标「含未知」）+ 图表 + 统计周期脚注。 */
function TrendContent({ trend, metric, currentKey }: { trend: UsageTrend; metric: TrendMetric; currentKey: string }) {
	const totals = trendTotals(trend);
	const hasUsage =
		totals.tokens.value || totals.cache.value || totals.calls.value || totals.failures.value || totals.runtime.value;
	return (
		<>
			<TrendCoverageNote trend={trend} />
			<dl className={styles.totals}>
				<TrendTotal label={TREND_METRICS.tokens.label} value={totals.tokens.value} unknown={totals.tokens.unknown} />
				<TrendTotal label={CACHE_TOKEN_META.label} value={totals.cache.value} unknown={totals.cache.unknown} />
				<TrendTotal label={TREND_METRICS.calls.label} value={totals.calls.value} unknown={totals.calls.unknown} />
				<TrendTotal
					label={TREND_METRICS.failures.label}
					value={totals.failures.value}
					unknown={totals.failures.unknown}
				/>
				<TrendTotal
					label={TREND_METRICS.runtime.label}
					value={totals.runtime.value}
					unit="秒"
					unknown={totals.runtime.unknown}
				/>
			</dl>
			{hasUsage ? (
				<TrendChartArea metric={metric} trend={trend} currentKey={currentKey} />
			) : (
				<p className={styles.emptyChart}>统计区间内暂无用量记录</p>
			)}
			<p className={styles.footnote}>
				统计周期：
				{bucketLabel(trend.granularity, bucketKey(trend.granularity, Date.parse(trend.query_range.start_time)))}
				{" – "}
				{bucketLabel(trend.granularity, bucketKey(trend.granularity, Date.parse(trend.query_range.end_time) - 1))}
				{trend.data_updated_at
					? ` · 数据更新于 ${new Date(trend.data_updated_at).toLocaleString("zh-CN", { hour12: false })}`
					: " · 暂无用量数据"}
			</p>
		</>
	);
}

/** 模版用量趋势卡：数据来自 Provider 用量趋势（usage.trend，服务端聚合全部分页，UTC+8 对齐分桶）。
 * 统计时间来自面板顶部选择器（range 毫秒）；粒度按区间跨度隐含（≤24h 小时桶、≤120 天天桶、更长月桶）。
 * agentId 缺省为「全部」视角：服务端逐模版绑定智能体（含已删模版）以 agent 维度查询并求和，非模版智能体不计入。 */
export function TemplateUsageTrendCard({
	agentId,
	range,
}: {
	agentId?: string;
	range: { start: number; end: number };
}) {
	const client = useMemo(getAdminClient, []);
	const [metric, setMetric] = useState<TrendMetric>("tokens");
	const granularity = granularityOf(range.end - range.start);
	const query = useAdminQuery(`usage:trend:${agentId ?? "templates"}:${range.start}:${range.end}`, (signal) =>
		client.usage.trend(
			{ ...(agentId ? { agentId } : {}), startTime: range.start, endTime: range.end, granularity },
			signal,
		),
	);
	const loading = query.loading || (!query.data && !query.error);
	const trend = query.data;
	return (
		<section aria-labelledby="template-usage-trend-heading" className={styles.card}>
			<div className={styles.cardHeader}>
				<h3 id="template-usage-trend-heading" className={styles.cardTitle}>
					使用趋势
				</h3>
				<div className={styles.headerControls}>
					<TrendMetricToggle value={metric} onChange={setMetric} />
				</div>
			</div>
			{loading ? (
				<p role="status" className={styles.loadingText}>
					正在加载使用趋势…
				</p>
			) : null}
			{query.error ? <ErrorState message={query.error} onRetry={() => void query.refresh()} /> : null}
			{!loading && !query.error && trend ? (
				<TrendContent trend={trend} metric={metric} currentKey={bucketKey(trend.granularity, Date.now())} />
			) : null}
		</section>
	);
}
