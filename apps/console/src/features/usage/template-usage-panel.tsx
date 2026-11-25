import { ArrowLeftOutlined } from "@ant-design/icons";
import type {
	TemplateSessionUsage,
	TemplateUsageRow,
	UsageModelRow,
	UsageSummary,
	UsageToolRow,
} from "@openagentkit/sdk/protocol";
import type { TableColumnsType } from "antd";
import type { TFunction } from "i18next";
import { Button, DatePicker, Empty, Popover, Result, Select, Table, Tag } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import { StatCard, StatCell } from "../../lib/stat-card.tsx";
import { collectionLabels, UsageMetrics, usageMetrics } from "../members/usage-metrics.tsx";
import { aggregateTemplateRows } from "./template-usage-aggregate.ts";
import { TemplateUsageTrendCard } from "./template-usage-trend.tsx";
import styles from "./usage.module.less";
import { TemplateUsageLimits } from "./usage-limit-panels.tsx";

const PAGE_SIZE = 20;

const { RangePicker } = DatePicker;

/** useAdminQuery 的派生加载态：请求进行中，或尚未拿到数据且没有错误（初次加载与刷新间隙）。 */
function isQueryPending(query: { loading: boolean; data: unknown; error: string | null }) {
	return query.loading || (!query.data && !query.error);
}

function captureTime(value: string | undefined, fallback: string) {
	return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : fallback;
}

/** 「全部」口径部分成功提示：coverage 仅在部分模版绑定智能体查询失败时出现。 */
function CoverageNote({ coverage }: { coverage: UsageSummary["coverage"] }) {
	const { t } = useTranslation("usage");
	if (!coverage || coverage.complete) return null;
	return (
		<p role="status" className={styles.metaText}>
			{t("templatePanel.coverageNote", { agents: coverage.missing_agent_ids.join("、") })}
		</p>
	);
}

function refreshedAt(row: TemplateUsageRow, fallback: string) {
	return row.refreshed_at ? new Date(row.refreshed_at).toLocaleString("zh-CN", { hour12: false }) : fallback;
}

/** 单模版或「全部模版」聚合的用量卡片：身份行 + 统计卡栅格；聚合形态隐藏模版级操作按钮。 */
function TemplateUsageCards({
	row,
	onSelect,
	onLimits,
	aggregateCount,
	providerTotal,
}: {
	row: TemplateUsageRow;
	onSelect?: (row: TemplateUsageRow) => void;
	onLimits?: (row: TemplateUsageRow) => void;
	/** 「全部」视角传入模版总数；此时身份行不展示智能体与上架状态。 */
	aggregateCount?: number;
	/** Provider 侧轮数/步骤汇总（统计时间内，按选中模版智能体过滤或全部模版口径求和）；缺省表示尚未加载。 */
	providerTotal?: UsageSummary["usage"]["total"];
}) {
	const { t } = useTranslation("usage");
	const { t: tc } = useTranslation();
	const hintOf = (key: keyof TemplateUsageRow["metrics"]) =>
		tc("collection.coverage", {
			covered: row.metrics[key].covered_sessions,
			total: row.session_count,
		});
	return (
		<div className={styles.cardStack}>
			<div className={styles.identityRow}>
				<div className={styles.identityMeta}>
					<h3 className={styles.sectionTitle}>
						{row.name}
						{row.deleted ? <Tag>{t("templatePanel.deletedTag")}</Tag> : null}
					</h3>
					<p className={styles.identitySub}>
						{aggregateCount === undefined ? (
							<>
								{t("templatePanel.agent", { name: row.remote_agent_name })} ·{" "}
								<span className={row.listing_status === "listed" ? styles.statusOn : undefined}>
									{row.listing_status === "listed" ? t("templatePanel.listed") : t("templatePanel.unlisted")}
								</span>{" "}
								·{" "}
							</>
						) : (
							t("templatePanel.aggregateCount", { count: aggregateCount })
						)}
						{t("templatePanel.lastCollected", { time: refreshedAt(row, t("templatePanel.neverCollected")) })}
					</p>
				</div>
				{onSelect && onLimits ? (
					<div className={styles.cardActions}>
						<Button type="link" size="small" onClick={() => onSelect(row)}>
							{t("sessionPage.sessionDetail")}
						</Button>
						<Button type="link" size="small" onClick={() => onLimits(row)}>
							{t("panels.setLimit")}
						</Button>
					</div>
				) : null}
			</div>
			<dl className={styles.statGrid}>
				<StatCard tone="tint" className={styles.statCardSpan2}>
					<StatCell
						label={t("templatePanel.statSessions")}
						value={row.session_count}
						unit={t("templatePanel.unitCount")}
						hint={t("templatePanel.deletedHint", { count: row.deleted_session_count })}
					/>
				</StatCard>
				<StatCard tone="subtle" className={styles.statCardSpan2}>
					<StatCell
						label={t("templatePanel.statActive")}
						value={row.metrics.active_seconds.value}
						unit={t("unitSeconds")}
						hint={hintOf("active_seconds")}
					/>
				</StatCard>
				<StatCard tone="tint" className={styles.statCardSpan2}>
					<StatCell
						label={t("templatePanel.statSession")}
						value={row.metrics.duration_seconds.value}
						unit={t("unitSeconds")}
						hint={hintOf("duration_seconds")}
					/>
				</StatCard>
				<StatCard tone="subtle" className={styles.statCardSpan2}>
					<StatCell
						label={t("templatePanel.statTurns")}
						value={providerTotal ? providerTotal.turns.value : null}
						unit={t("templatePanel.unitTurns")}
						hint={t("templatePanel.providerHint")}
						missingText={providerTotal ? tc("collection.notReturned") : tc("collection.pending")}
					/>
				</StatCard>
				<StatCard tone="tint" className={styles.statCardSpan2}>
					<StatCell
						label={t("templatePanel.statSteps")}
						value={providerTotal ? providerTotal.steps.value : null}
						unit={t("templatePanel.unitSteps")}
						hint={t("templatePanel.providerHint")}
						missingText={providerTotal ? tc("collection.notReturned") : tc("collection.pending")}
					/>
				</StatCard>
			</dl>
		</div>
	);
}

function metricText(session: TemplateSessionUsage, key: (typeof usageMetrics)[number][0], tc: TFunction<"common">) {
	const metrics = { ...session.usage, ...session.stats };
	return (
		metrics[key]?.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) ??
		(session.captured_at ? tc("collection.notReturned") : tc("collection.pending"))
	);
}

function sessionDetailColumns(
	t: TFunction<["usage", "common"]>,
	tc: TFunction<"common">,
): TableColumnsType<TemplateSessionUsage> {
	return [
		{
			title: t("templatePanel.cols.session"),
			dataIndex: "session_id",
			render: (_, row) => (
				<div>
					<span className={styles.sessionTitle}>{row.title || row.session_id}</span>{" "}
					<span className={styles.metaText}>{row.session_id}</span>
				</div>
			),
		},
		{
			title: t("templatePanel.cols.member"),
			render: (_, row) => (
				<div>
					<span>{row.member_display_name}</span> <span className={styles.metaText}>{row.member_username}</span>
				</div>
			),
		},
		{
			title: t("templatePanel.cols.status"),
			render: (_, row) => (row.deleted_at ? t("templatePanel.deletedKept") : row.status || "—"),
		},
		{
			title: t("templatePanel.cols.created"),
			dataIndex: "created_at",
			render: (value: string | undefined) => captureTime(value, t("templatePanel.notCaptured")),
		},
		...usageMetrics.map(([key, labelKey]) => ({
			title: tc(labelKey),
			align: "right" as const,
			render: (_: unknown, row: TemplateSessionUsage) => (
				<span className={styles.tabularNum}>{metricText(row, key, tc)}</span>
			),
		})),
		{
			title: t("templatePanel.cols.collectionStatus"),
			dataIndex: "collection_status",
			render: (status: TemplateSessionUsage["collection_status"]) => tc(collectionLabels[status]),
		},
		{
			title: t("templatePanel.cols.captured"),
			dataIndex: "captured_at",
			render: (value: string | undefined) => captureTime(value, t("templatePanel.notCaptured")),
		},
	];
}

function TemplateSessionsTable({ rows, loading }: { rows: TemplateSessionUsage[]; loading: boolean }) {
	const { t } = useTranslation(["usage", "common"]);
	const { t: tc } = useTranslation();
	return (
		<Table
			rowKey="session_id"
			size="middle"
			loading={loading}
			columns={sessionDetailColumns(t, tc)}
			dataSource={rows}
			pagination={false}
			scroll={{ x: "max-content" }}
			locale={{
				emptyText: (
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={
							<span>
								{t("templatePanel.sessionsEmpty")}
								<br />
								<span className={styles.metaText}>{t("templatePanel.sessionsEmptyHint")}</span>
							</span>
						}
					/>
				),
			}}
		/>
	);
}

export function TemplateUsageDetail({
	template,
	onBack,
	editLimits,
	onRefresh,
}: {
	template: TemplateUsageRow;
	onBack: () => void;
	editLimits: boolean;
	/** 刷新汇总行（服务端顺带触发新会话登记与后台补采）。 */
	onRefresh: () => Promise<void>;
}) {
	const { t } = useTranslation("usage");
	const client = useMemo(getAdminClient, []);
	const [query, setQuery] = useState({ cursors: [""], revision: 0 });
	const list = useAdminQuery(`usage:templates:${template.template_id}:sessions:${JSON.stringify(query)}`, (signal) =>
		client.usage.templateSessions(
			template.template_id,
			{ cursor: query.cursors.at(-1) || undefined, limit: PAGE_SIZE },
			signal,
		),
	);
	const loading = isQueryPending(list);
	const rows = list.data?.data ?? [];
	const hasNext = Boolean(list.data?.next_cursor);
	return (
		<section aria-labelledby="template-usage-detail-heading" className={styles.detailStack}>
			<Button icon={<ArrowLeftOutlined />} onClick={onBack}>
				{t("templatePanel.back")}
			</Button>
			<header className={styles.detailHeader}>
				<div>
					<h2 id="template-usage-detail-heading" className={styles.detailTitle}>
						{t("templatePanel.title", { name: template.name })}
						{template.deleted ? <Tag>{t("templatePanel.deletedTag")}</Tag> : null}
					</h2>
					<p className={styles.detailSub}>{t("templatePanel.detailSub")}</p>
				</div>
				<Button
					loading={loading}
					onClick={() => {
						void Promise.all([list.refresh(), onRefresh()]);
					}}
				>
					{t("templatePanel.refresh")}
				</Button>
			</header>
			<TemplateUsageLimits templateId={template.template_id} initiallyEditing={editLimits} />
			<div className={styles.collectStatus} role="status">
				<span>
					{t("templatePanel.summarySessions", {
						count: template.session_count,
						deleted: template.deleted_session_count,
					})}
				</span>
				<span>{t("templatePanel.lastCollectedAt", { time: captureTime(template.refreshed_at, t("templatePanel.notCaptured")) })}</span>
			</div>
			<UsageMetrics summary={template} />
			<p className={styles.metaText}>{t("templatePanel.metricsNote")}</p>
			{list.error ? (
				<Result
					status="error"
					title={list.error}
					extra={
						<Button
							size="small"
							onClick={() => {
								void list.refresh();
							}}
						>
							{t("templatePanel.retry")}
						</Button>
					}
				/>
			) : (
				<TemplateSessionsTable rows={rows} loading={loading} />
			)}
			{(query.cursors.length > 1 || hasNext) && (
				<nav aria-label={t("templatePanel.pagerAria")} className={styles.pager}>
					<Button
						size="small"
						disabled={loading || query.cursors.length === 1}
						onClick={() => setQuery((current) => ({ ...current, cursors: current.cursors.slice(0, -1) }))}
					>
						{t("templatePanel.pagerPrev")}
					</Button>
					<span>{t("templatePanel.pagerPage", { page: query.cursors.length })}</span>
					<Button
						size="small"
						disabled={loading || !hasNext}
						onClick={() =>
							setQuery((current) => ({
								...current,
								cursors: [...current.cursors, list.data?.next_cursor ?? ""],
							}))
						}
					>
						{t("templatePanel.pagerNext")}
					</Button>
				</nav>
			)}
		</section>
	);
}

/** 面板顶部统计时间选择器：分钟精度本地时间区间，选定完整区间后才提交变更。 */
function StatRangePicker({
	value,
	onChange,
}: {
	value: { start: string; end: string };
	onChange: (next: { start: string; end: string }) => void;
}) {
	const { t } = useTranslation("usage");
	return (
		<RangePicker
			aria-label={t("templatePanel.statRangeAria")}
			showTime={{ format: "HH:mm" }}
			format="YYYY-MM-DD HH:mm"
			allowClear={false}
			value={[dayjs(value.start), dayjs(value.end)]}
			onChange={(values) => {
				const [start, end] = values ?? [];
				if (start && end) onChange({ start: start.format("YYYY-MM-DDTHH:mm"), end: end.format("YYYY-MM-DDTHH:mm") });
			}}
		/>
	);
}

/** 模版用量主面板：rows 为单个选中模版时逐模版展示，为全量模版行（「全部」视角）时聚合求和；查询状态与明细导航均由用量页持有。 */
export function TemplateUsagePanel({
	rows,
	allTemplates,
	loading,
	error,
	onRetry,
	onSelect,
	onLimits,
}: {
	rows: TemplateUsageRow[];
	allTemplates: boolean;
	loading: boolean;
	error: string | null;
	onRetry: () => void;
	onSelect: (row: TemplateUsageRow) => void;
	onLimits: (row: TemplateUsageRow) => void;
}) {
	const { t } = useTranslation("usage");
	const client = useMemo(getAdminClient, []);
	const aggregate = rows.length > 1 ? aggregateTemplateRows(rows) : null;
	const selected = aggregate ? null : (rows[0] ?? null);
	const agentId = allTemplates ? undefined : selected?.remote_agent_id;
	/** 面板顶部统计时间（分钟精度）：统一驱动轮数/步骤卡、趋势卡与模型/工具明细。 */
	const [statRange, setStatRange] = useState(() => ({
		start: toLocalMinuteInput(Date.now() - 7 * 24 * 60 * 60 * 1000),
		end: toLocalMinuteInput(Date.now()),
	}));
	const telemetry = useAdminQuery(
		`usage:telemetry:${scopeKeyOf(selected?.template_id, agentId)}:${statRange.start}:${statRange.end}`,
		(signal) => client.usage.summary(telemetryQuery(statRange, agentId), signal),
	);
	const summary = telemetry.data;
	const telemetryLoading = isQueryPending(telemetry);
	return (
		<div className={styles.panelStack}>
			<div className={styles.rangeRow}>
				<Popover
					content={<span className={styles.preLine}>{t("templatePanel.panelScopeNote")}</span>}
					title={t("templatePanel.scopeNoteTitle")}
					trigger="click"
				>
					<button type="button" className={styles.popLink}>
						{t("templatePanel.scopeNoteTitle")}
					</button>
				</Popover>
				<div className={styles.pickerInline}>
					<span className={styles.inlineLabel}>{t("templatePanel.statRangeAria")}</span>
					<StatRangePicker value={statRange} onChange={setStatRange} />
				</div>
			</div>
			<CoverageNote coverage={summary?.coverage} />
			{loading ? (
				<p role="status" className={styles.loadingNote}>
					{t("templatePanel.loadingRows")}
				</p>
			) : null}
			{error ? (
				<Result
					status="error"
					title={error}
					extra={
						<Button size="small" onClick={onRetry}>
							{t("templatePanel.retry")}
						</Button>
					}
				/>
			) : null}
			{!loading && !error && !rows.length ? (
				<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("templatePanel.emptyTemplates")} />
			) : null}
			{!loading && !error && aggregate ? (
				<TemplateUsageCards row={aggregate} aggregateCount={rows.length} providerTotal={summary?.usage.total} />
			) : null}
			{!loading && !error && selected ? (
				<TemplateUsageCards
					row={selected}
					onSelect={onSelect}
					onLimits={onLimits}
					providerTotal={summary?.usage.total}
				/>
			) : null}
			{!loading && !error && (aggregate || selected) ? (
				<TemplateUsageTrendCard
					agentId={agentId}
					range={{ start: minuteInputMs(statRange.start), end: minuteInputMs(statRange.end) }}
				/>
			) : null}
			<ModelUsageSection
				templateId={selected?.template_id}
				agentId={agentId}
				templateName={selected?.name}
				summary={summary}
				loading={telemetryLoading}
				error={telemetry.error}
			/>
			<ToolUsageSection
				templateId={selected?.template_id}
				agentId={agentId}
				templateName={selected?.name}
				summary={summary}
				loading={telemetryLoading}
				error={telemetry.error}
			/>
		</div>
	);
}

const TELEMETRY_PAGE_SIZE = 20;

function usageNumber(value: number | null) {
	return value === null ? "—" : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function hitRatioText(value: number | null) {
	return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

/** datetime-local 值（YYYY-MM-DDTHH:mm，本地时区）↔ 毫秒时间戳。 */
function minuteInputMs(value: string) {
	return new Date(value).getTime();
}
function toLocalMinuteInput(ms: number) {
	const local = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
	return local.toISOString().slice(0, 16);
}

/** Provider 侧用量明细的公共查询参数：agent_id 来自选中模版，时间来自筛选区（分钟精度输入 → 毫秒）。 */
function telemetryQuery(filters: { start: string; end: string }, agentId: string | undefined) {
	return {
		start_time: minuteInputMs(filters.start),
		end_time: minuteInputMs(filters.end),
		...(agentId ? { agent_id: agentId } : {}),
	};
}

/** 明细区作用域说明：选中模版时按其绑定智能体过滤；「全部」视角为各模版绑定智能体求和（模版口径）。 */
function TelemetryScopeNote({ templateName }: { templateName?: string }) {
	const { t } = useTranslation("usage");
	return (
		<p className={styles.metaText}>
			{templateName
				? t("templatePanel.scopeSelected", { name: templateName })
				: t("templatePanel.scopeAll")}
		</p>
	);
}

/** 「暂不支持」占位卡：与 ErrorState 同量级的边框盒，中性信息色、无重试入口（上游接入后自动恢复）。 */
function TelemetryUnavailable() {
	const { t } = useTranslation("usage");
	return (
		<div className={styles.unavailable}>
			<svg
				aria-hidden="true"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				className={styles.unavailableIcon}
			>
				<circle cx="12" cy="12" r="9" />
				<path d="M12 11v5" />
				<path d="M12 8h.01" />
			</svg>
			<div className={styles.unavailableBody}>
				<strong className={styles.unavailableTitle}>{t("templatePanel.unavailableTitle")}</strong>
				<p className={styles.unavailableDesc}>{t("templatePanel.unavailableDesc")}</p>
			</div>
		</div>
	);
}

/** 查询缓存 key 的作用域段：模版 id + 绑定智能体；任一变化都重发明细查询，两个模版绑同一智能体时也会重发。 */
function scopeKeyOf(templateId: string | undefined, agentId: string | undefined) {
	return `${templateId ?? ""}:${agentId ?? ""}`;
}

function telemetryEmpty(title: string, hint: string) {
	return (
		<Empty
			image={Empty.PRESENTED_IMAGE_SIMPLE}
			description={
				<span>
					{title}
					<br />
					<span className={styles.metaText}>{hint}</span>
				</span>
			}
		/>
	);
}

function TelemetryPagination({
	pageNo,
	hasNext,
	loading,
	onChange,
}: {
	pageNo: number;
	hasNext: boolean;
	loading: boolean;
	onChange: (pageNo: number) => void;
}) {
	const { t } = useTranslation("usage");
	return (
		<nav aria-label={t("templatePanel.pagerDetailAria")} className={styles.pager}>
			<Button size="small" disabled={loading || pageNo === 1} onClick={() => onChange(pageNo - 1)}>
				{t("templatePanel.pagerPrev")}
			</Button>
			<span>{t("templatePanel.pagerPage", { page: pageNo })}</span>
			<Button size="small" disabled={loading || !hasNext} onClick={() => onChange(pageNo + 1)}>
				{t("templatePanel.pagerNext")}
			</Button>
		</nav>
	);
}

function modelTelemetryColumns(t: TFunction<"usage">): TableColumnsType<UsageModelRow> {
	return [
		{
			title: t("templatePanel.cols.modelName"),
			dataIndex: "model_name",
			render: (value: string | null) => <span className={styles.workspaceText}>{value ?? t("templatePanel.unattributed")}</span>,
		},
		{ title: t("templatePanel.cols.calls"), align: "right", render: (_, row) => usageNumber(row.usage.call_count.value) },
		{ title: t("templatePanel.cols.failures"), align: "right", render: (_, row) => usageNumber(row.usage.failed_count.value) },
		{
			title: t("templatePanel.cols.input"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.usage.input_tokens.value)}</span>,
		},
		{
			title: t("templatePanel.cols.output"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.usage.output_tokens.value)}</span>,
		},
		{
			title: t("templatePanel.cols.cacheRead"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.usage.cache_read_tokens.value)}</span>,
		},
		{
			title: t("templatePanel.cols.cacheCreation"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.usage.cache_creation_tokens.value)}</span>,
		},
		{
			title: t("templatePanel.cols.hitRatio"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{hitRatioText(row.usage.cache_hit_ratio.value)}</span>,
		},
	];
}

function toolTelemetryColumns(t: TFunction<"usage">): TableColumnsType<UsageToolRow> {
	return [
		{
			title: t("templatePanel.cols.toolName"),
			dataIndex: "tool_name",
			render: (value: string | null) => value ?? t("templatePanel.unknown"),
		},
		{
			title: t("templatePanel.cols.source"),
			dataIndex: "source",
			render: (value: string | null) => sourceText(value, t),
		},
		{ title: t("templatePanel.cols.calls"), align: "right", render: (_, row) => usageNumber(row.usage.call_count.value) },
		{ title: t("templatePanel.cols.failures"), align: "right", render: (_, row) => usageNumber(row.usage.failed_count.value) },
	];
}

/** 来源列与分源行内数字共用的来源文案：已知来源走字典，未知来源原样展示。 */
function sourceText(value: string | null | undefined, t: TFunction<"usage">) {
	if (value === "builtin") return t("templatePanel.tool.builtin");
	if (value === "mcp") return t("templatePanel.tool.mcp");
	if (value === "custom") return t("templatePanel.tool.custom");
	return value ?? t("templatePanel.unknown");
}

/** 明细区头部行内失败数字：0 次时整段省略。 */
function failedSuffix(failed: number | null, t: TFunction<"usage">) {
	return failed ? t("templatePanel.failedSuffix", { count: usageNumber(failed) }) : "";
}

/** 工具分源行内数字（调用数口径，与来源列一致）：0 值的源省略，全为 0 时整段省略。 */
function toolSourceSuffix(total: UsageSummary["usage"]["total"], t: TFunction<"usage">) {
	const parts = (["builtin", "mcp", "custom"] as const)
		.map((source) => ({ label: sourceText(source, t), count: total[`${source}_tool_call_count`].value ?? 0 }))
		.filter((part) => part.count > 0)
		.map((part) => `${part.label} ${usageNumber(part.count)}`);
	return parts.length ? `（${parts.join(" · ")}）` : "";
}

function ModelUsageSection({
	summary,
	loading,
	error,
	templateId,
	agentId,
	templateName,
}: {
	/** 面板顶部统计时间内的 Provider 汇总（total + 模型/工具明细），由面板统一查询。 */
	summary?: UsageSummary;
	loading: boolean;
	error: string | null;
	templateId?: string;
	agentId?: string;
	templateName?: string;
}) {
	const { t } = useTranslation("usage");
	/** 模型与分页为本地筛选；切换选中模版（含进入/离开「全部」）即归位，统计时间由面板统一控制。 */
	const [filters, setFilters] = useState(() => ({
		scope: scopeKeyOf(templateId, agentId),
		model_name: "",
		page_no: 1,
	}));
	/** 切换选中模版（含进入/离开「全部」）即归位分页与模型筛选。 */
	useEffect(() => {
		const scope = scopeKeyOf(templateId, agentId);
		setFilters((current) =>
			current.scope === scope && current.page_no === 1 && current.model_name === ""
				? current
				: { ...current, scope, page_no: 1, model_name: "" },
		);
	}, [templateId, agentId]);
	const allModels = summary?.usage.models ?? [];
	const modelOptions = [
		...new Set(allModels.map((row) => row.model_name).filter((name): name is string => Boolean(name))),
	];
	const filtered = filters.model_name ? allModels.filter((row) => row.model_name === filters.model_name) : allModels;
	const rows = filtered.slice((filters.page_no - 1) * TELEMETRY_PAGE_SIZE, filters.page_no * TELEMETRY_PAGE_SIZE);
	const hasNext = filters.page_no * TELEMETRY_PAGE_SIZE < filtered.length;
	return (
		<section aria-labelledby="model-usage-heading" className={styles.telemetrySection}>
			<div className={styles.sectionHeader}>
				<h3 id="model-usage-heading" className={styles.sectionTitle}>
					{t("templatePanel.model.title")}
				</h3>
				{summary ? (
					<span className={styles.metaText}>
						{t("templatePanel.model.totalCalls", { calls: usageNumber(summary.usage.total.model_call_count.value) })}
						{failedSuffix(summary.usage.total.model_failed_count.value, t)}
						{t("templatePanel.model.totalRows", { rows: usageNumber(filtered.length) })}
					</span>
				) : null}
			</div>
			<TelemetryScopeNote templateName={templateName} />
			<div className={styles.filterRow}>
				<Select
					aria-label={t("templatePanel.model.filterAria")}
					className={styles.selectName}
					value={filters.model_name}
					onChange={(value) => setFilters({ ...filters, model_name: value, page_no: 1 })}
					options={[{ value: "", label: t("templatePanel.model.allModels") }, ...modelOptions.map((name) => ({ value: name, label: name }))]}
				/>
			</div>
			{error ? (
				<TelemetryUnavailable />
			) : (
				<Table
					rowKey={(row) => row.model_name ?? "unknown"}
					size="small"
					loading={loading}
					columns={modelTelemetryColumns(t)}
					dataSource={rows}
					pagination={false}
					scroll={{ x: "max-content" }}
					locale={{
						emptyText: telemetryEmpty(t("templatePanel.emptyModel"), t("templatePanel.emptyModelHint")),
					}}
				/>
			)}
			{filtered.length > TELEMETRY_PAGE_SIZE || filters.page_no > 1 ? (
				<TelemetryPagination
					pageNo={filters.page_no}
					hasNext={hasNext}
					loading={loading}
					onChange={(pageNo) => setFilters({ ...filters, page_no: pageNo })}
				/>
			) : null}
		</section>
	);
}

function ToolUsageSection({
	summary,
	loading,
	error,
	templateId,
	agentId,
	templateName,
}: {
	summary?: UsageSummary;
	loading: boolean;
	error: string | null;
	templateId?: string;
	agentId?: string;
	templateName?: string;
}) {
	const { t } = useTranslation("usage");
	/** 来源/工具与分页为本地筛选；切换选中模版（含进入/离开「全部」）即归位，统计时间由面板统一控制。 */
	const [filters, setFilters] = useState(() => ({
		scope: scopeKeyOf(templateId, agentId),
		source: "",
		tool_name: "",
		page_no: 1,
	}));
	/** 切换选中模版（含进入/离开「全部」）即归位分页与来源/工具筛选。 */
	useEffect(() => {
		const scope = scopeKeyOf(templateId, agentId);
		setFilters((current) =>
			current.scope === scope && current.page_no === 1 && current.source === "" && current.tool_name === ""
				? current
				: { ...current, scope, page_no: 1, source: "", tool_name: "" },
		);
	}, [templateId, agentId]);
	const allTools = summary?.usage.tools ?? [];
	const bySource = filters.source ? allTools.filter((row) => row.source === filters.source) : allTools;
	const toolOptions = [
		...new Set(bySource.map((row) => row.tool_name).filter((name): name is string => Boolean(name))),
	];
	const filtered = filters.tool_name ? bySource.filter((row) => row.tool_name === filters.tool_name) : bySource;
	const rows = filtered.slice((filters.page_no - 1) * TELEMETRY_PAGE_SIZE, filters.page_no * TELEMETRY_PAGE_SIZE);
	const hasNext = filters.page_no * TELEMETRY_PAGE_SIZE < filtered.length;
	return (
		<section aria-labelledby="tool-usage-heading" className={styles.telemetrySection}>
			<div className={styles.sectionHeader}>
				<h3 id="tool-usage-heading" className={styles.sectionTitle}>
					{t("templatePanel.tool.title")}
				</h3>
				{summary ? (
					<span className={styles.metaText}>
						{t("templatePanel.tool.totalCalls", { calls: usageNumber(summary.usage.total.tool_call_count.value) })}
						{toolSourceSuffix(summary.usage.total, t)}
						{failedSuffix(summary.usage.total.tool_failed_count.value, t)}
						{t("templatePanel.tool.totalRows", { rows: usageNumber(filtered.length) })}
					</span>
				) : null}
			</div>
			<TelemetryScopeNote templateName={templateName} />
			<div className={styles.filterRow}>
				<Select
					aria-label={t("templatePanel.tool.sourceAria")}
					className={styles.selectSource}
					value={filters.source}
					onChange={(value) => setFilters({ ...filters, source: value, page_no: 1 })}
					options={[
						{ value: "", label: t("templatePanel.tool.allSources") },
						{ value: "builtin", label: t("templatePanel.tool.builtin") },
						{ value: "mcp", label: t("templatePanel.tool.mcp") },
						{ value: "custom", label: t("templatePanel.tool.custom") },
					]}
				/>
				<Select
					aria-label={t("templatePanel.tool.nameAria")}
					className={styles.selectName}
					value={filters.tool_name}
					onChange={(value) => setFilters({ ...filters, tool_name: value, page_no: 1 })}
					options={[{ value: "", label: t("templatePanel.tool.allTools") }, ...toolOptions.map((name) => ({ value: name, label: name }))]}
				/>
			</div>
			{error ? (
				<TelemetryUnavailable />
			) : (
				<Table
					rowKey={(row) => `${row.source ?? "unknown"}/${row.tool_name ?? "unknown"}`}
					size="small"
					loading={loading}
					columns={toolTelemetryColumns(t)}
					dataSource={rows}
					pagination={false}
					scroll={{ x: "max-content" }}
					locale={{
						emptyText: telemetryEmpty(t("templatePanel.emptyTool"), t("templatePanel.emptyToolHint")),
					}}
				/>
			)}
			{filtered.length > TELEMETRY_PAGE_SIZE || filters.page_no > 1 ? (
				<TelemetryPagination
					pageNo={filters.page_no}
					hasNext={hasNext}
					loading={loading}
					onChange={(pageNo) => setFilters({ ...filters, page_no: pageNo })}
				/>
			) : null}
		</section>
	);
}
