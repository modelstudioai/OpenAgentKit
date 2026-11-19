import { ArrowLeftOutlined } from "@ant-design/icons";
import type {
	ModelUsageItem,
	ModelUsagePage,
	TemplateSessionUsage,
	TemplateUsageRow,
	ToolUsageItem,
	ToolUsagePage,
} from "@openagentpack/kit-sdk/protocol";
import type { TableColumnsType } from "antd";
import { Button, DatePicker, Empty, Result, Select, Table } from "antd";
import dayjs from "dayjs";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ToolUsageQuery } from "../../lib/admin/index.ts";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import { StatCard, StatCell } from "../../lib/stat-card.tsx";
import { collectionLabels, UsageMetrics, usageMetrics } from "../members/usage-metrics.tsx";
import { aggregateTemplateRows } from "./template-usage-aggregate.ts";
import { TemplateUsageTrendCard } from "./template-usage-trend.tsx";
import styles from "./usage.module.less";
import { TemplateUsageLimits } from "./usage-limit-panels.tsx";

const PAGE_SIZE = 20;

function captureTime(value: string | undefined, fallback: string) {
	return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : fallback;
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
}: {
	row: TemplateUsageRow;
	onSelect?: (row: TemplateUsageRow) => void;
	onLimits?: (row: TemplateUsageRow) => void;
	/** 「全部」视角传入模版总数；此时身份行不展示智能体与上架状态。 */
	aggregateCount?: number;
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
					<h3 className={styles.sectionTitle}>{row.name}</h3>
					<p className={styles.identitySub}>
						{aggregateCount === undefined ? (
							<>
								{t("templatePanel.agent", { name: row.remote_agent_name ?? "" })} ·{" "}
								<span className={row.listing_status === "listed" ? styles.statusOn : undefined}>
									{row.listing_status === "listed" ? t("templatePanel.listed") : t("templatePanel.unlisted")}
								</span>{" "}
								·{" "}
							</>
						) : (
							t("templatePanel.aggregateCount", { count: aggregateCount })
						)}
						{t("templatePanel.lastCollected", {
							time: refreshedAt(row, t("templatePanel.neverCollected")),
						})}
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
					<div className={styles.statPair}>
						<StatCell
							label={tc("metrics.inputTokens")}
							value={row.metrics.input_tokens.value}
							hint={hintOf("input_tokens")}
						/>
						<StatCell
							label={tc("metrics.outputTokens")}
							value={row.metrics.output_tokens.value}
							hint={hintOf("output_tokens")}
						/>
					</div>
				</StatCard>
				<StatCard tone="tint" className={styles.statCardSpan2}>
					<div className={styles.statPair}>
						<StatCell
							label={tc("metrics.cacheRead")}
							value={row.metrics.cache_read_input_tokens.value}
							hint={hintOf("cache_read_input_tokens")}
						/>
						<StatCell
							label={tc("metrics.cacheWrite")}
							value={row.metrics.cache_creation_input_tokens.value}
							hint={hintOf("cache_creation_input_tokens")}
						/>
					</div>
				</StatCard>
				<StatCard tone="subtle" className={styles.statCardSpan3}>
					<StatCell
						label={t("templatePanel.statActive")}
						value={row.metrics.active_seconds.value}
						unit={t("unitSeconds")}
						hint={hintOf("active_seconds")}
					/>
				</StatCard>
				<StatCard tone="tint" className={styles.statCardSpan3}>
					<StatCell
						label={t("templatePanel.statSession")}
						value={row.metrics.duration_seconds.value}
						unit={t("unitSeconds")}
						hint={hintOf("duration_seconds")}
					/>
				</StatCard>
			</dl>
		</div>
	);
}

function metricText(session: TemplateSessionUsage, key: (typeof usageMetrics)[number][0], t: TFunction<"common">) {
	const metrics = { ...session.usage, ...session.stats };
	return (
		metrics[key]?.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) ??
		(session.captured_at ? t("collection.notReturned") : t("collection.pending"))
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
	const loading = list.loading || (!list.data && !list.error);
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
				<span>
					{t("templatePanel.lastCollectedAt", {
						time: captureTime(template.refreshed_at, t("templatePanel.notCaptured")),
					})}
				</span>
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

/** 模版用量主面板：rows 为单个选中模版时逐模版展示，为全量模版行（「全部」视角）时聚合求和；查询状态与明细导航均由用量页持有。 */
export function TemplateUsagePanel({
	rows,
	loading,
	error,
	onRetry,
	onSelect,
	onLimits,
}: {
	rows: TemplateUsageRow[];
	loading: boolean;
	error: string | null;
	onRetry: () => void;
	onSelect: (row: TemplateUsageRow) => void;
	onLimits: (row: TemplateUsageRow) => void;
}) {
	const { t } = useTranslation("usage");
	const aggregate = rows.length > 1 ? aggregateTemplateRows(rows, t("templatePanel.allTemplates")) : null;
	const selected = aggregate ? null : (rows[0] ?? null);
	return (
		<div className={styles.panelStack}>
			<p className={styles.metaText} style={{ marginTop: "10px" }}>
				{t("templatePanel.panelNote")}
			</p>
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
			{!loading && !error && aggregate ? <TemplateUsageCards row={aggregate} aggregateCount={rows.length} /> : null}
			{!loading && !error && selected ? (
				<TemplateUsageCards row={selected} onSelect={onSelect} onLimits={onLimits} />
			) : null}
			{!loading && !error && (aggregate || selected) ? (
				<TemplateUsageTrendCard templateId={selected?.template_id} />
			) : null}
			<ModelUsageSection
				templateId={selected?.template_id}
				agentId={selected?.remote_agent_id}
				templateName={selected?.name}
			/>
			<ToolUsageSection
				templateId={selected?.template_id}
				agentId={selected?.remote_agent_id}
				templateName={selected?.name}
			/>
		</div>
	);
}

const TELEMETRY_PAGE_SIZE = 20;

function usageNumber(value: number) {
	return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function hitRatioText(value: number) {
	return `${(value * 100).toFixed(1)}%`;
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

/** 明细区作用域说明：选中模版时按其绑定智能体过滤；「全部」视角不过滤，展示工作空间全量调用。 */
function TelemetryScopeNote({ templateName }: { templateName?: string }) {
	const { t } = useTranslation("usage");
	return (
		<p className={styles.metaText}>
			{templateName ? t("templatePanel.scopeSelected", { name: templateName }) : t("templatePanel.scopeAll")}
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

function modelTelemetryColumns(t: TFunction<"usage">): TableColumnsType<ModelUsageItem> {
	return [
		{ title: t("templatePanel.cols.modelName"), dataIndex: "model_name" },
		{
			title: t("templatePanel.cols.workspace"),
			dataIndex: "workspace_id",
			render: (value: string) => <span className={styles.workspaceText}>{value}</span>,
		},
		{
			title: t("templatePanel.cols.calls"),
			dataIndex: "call_count",
			align: "right",
			render: (value: number) => usageNumber(value),
		},
		{
			title: t("templatePanel.cols.failures"),
			dataIndex: "failed_count",
			align: "right",
			render: (value: number) => usageNumber(value),
		},
		{
			title: t("templatePanel.cols.input"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.tokens.input_tokens)}</span>,
		},
		{
			title: t("templatePanel.cols.output"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.tokens.output_tokens)}</span>,
		},
		{
			title: t("templatePanel.cols.cacheRead"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.tokens.cache_read_tokens)}</span>,
		},
		{
			title: t("templatePanel.cols.cacheCreation"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.tokens.cache_creation_tokens)}</span>,
		},
		{
			title: t("templatePanel.cols.hitRatio"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{hitRatioText(row.tokens.cache_hit_ratio)}</span>,
		},
	];
}

function toolTelemetryColumns(t: TFunction<"usage">): TableColumnsType<ToolUsageItem> {
	return [
		{ title: t("templatePanel.cols.toolName"), dataIndex: "tool_name" },
		{
			title: t("templatePanel.cols.source"),
			dataIndex: "source",
			render: (value: string) => (sourceLabels[value] ? t(sourceLabels[value]!) : value),
		},
		{
			title: t("templatePanel.cols.workspace"),
			dataIndex: "workspace_id",
			render: (value: string) => <span className={styles.workspaceText}>{value}</span>,
		},
		{
			title: t("templatePanel.cols.calls"),
			dataIndex: "call_count",
			align: "right",
			render: (value: number) => usageNumber(value),
		},
		{
			title: t("templatePanel.cols.failures"),
			dataIndex: "failed_count",
			align: "right",
			render: (value: number) => usageNumber(value),
		},
	];
}

const sourceLabels: Record<
	string,
	"templatePanel.tool.builtin" | "templatePanel.tool.mcp" | "templatePanel.tool.custom"
> = {
	builtin: "templatePanel.tool.builtin",
	mcp: "templatePanel.tool.mcp",
	custom: "templatePanel.tool.custom",
};

function ModelUsageSection({
	templateId,
	agentId,
	templateName,
}: {
	templateId?: string;
	agentId?: string;
	templateName?: string;
}) {
	const { t } = useTranslation("usage");
	const client = useMemo(getAdminClient, []);
	/** 日期与模型变更即触发查询（page_no 归 1）；scope 记录所属模版作用域，跨模版切换时由下方 effect 归位。 */
	const [filters, setFilters] = useState(() => ({
		scope: scopeKeyOf(templateId, agentId),
		start: toLocalMinuteInput(Date.now() - 7 * 24 * 60 * 60 * 1000),
		end: toLocalMinuteInput(Date.now()),
		model_name: "",
		page_no: 1,
	}));
	/** 切换选中模版（含进入/离开「全部」）即归位分页与模型筛选，保留时间区间。 */
	useEffect(() => {
		const scope = scopeKeyOf(templateId, agentId);
		setFilters((current) =>
			current.scope === scope && current.page_no === 1 && current.model_name === ""
				? current
				: { ...current, scope, page_no: 1, model_name: "" },
		);
	}, [templateId, agentId]);
	/** 模型名下拉选项：按当前模版绑定智能体与时间区间拉一页全量（不带模型筛选）去重聚合；模型种类超过 100 时选项可能不全。 */
	const optionsQuery = useAdminQuery(
		`usage:model-options:${scopeKeyOf(templateId, agentId)}:${filters.start}:${filters.end}`,
		(signal) => client.usage.modelUsage({ ...telemetryQuery(filters, agentId), page_no: 1, page_size: 100 }, signal),
	);
	const modelOptions = [...new Set((optionsQuery.data?.items ?? []).map((row) => row.model_name))];
	const list = useAdminQuery(
		`usage:model-usage:${scopeKeyOf(templateId, agentId)}:${JSON.stringify(filters)}`,
		(signal) =>
			client.usage.modelUsage(
				{
					...telemetryQuery(filters, agentId),
					...(filters.model_name ? { model_name: filters.model_name } : {}),
					page_no: filters.page_no,
					page_size: TELEMETRY_PAGE_SIZE,
				},
				signal,
			),
	);
	const page: ModelUsagePage | undefined = list.data;
	const rows: ModelUsageItem[] = page?.items ?? [];
	const hasNext = page ? filters.page_no * TELEMETRY_PAGE_SIZE < page.total : false;
	const loading = list.loading || (!list.data && !list.error);
	return (
		<section aria-labelledby="model-usage-heading" className={styles.telemetrySection}>
			<div className={styles.sectionHeader}>
				<h3 id="model-usage-heading" className={styles.sectionTitle}>
					{t("templatePanel.model.title")}
				</h3>
				{page ? (
					<span className={styles.metaText}>
						{t("templatePanel.model.totalCalls", {
							calls: usageNumber(page.total_call_count),
							rows: usageNumber(page.total),
						})}
					</span>
				) : null}
			</div>
			<TelemetryScopeNote templateName={templateName} />
			<div className={styles.filterRow}>
				<DatePicker
					aria-label={t("templatePanel.filterStartAria")}
					showTime={{ format: "HH:mm" }}
					format="YYYY-MM-DD HH:mm"
					className={styles.datePicker}
					value={dayjs(filters.start)}
					onChange={(value) => {
						if (value) setFilters({ ...filters, start: value.format("YYYY-MM-DDTHH:mm"), page_no: 1 });
					}}
				/>
				<span className={styles.metaText}>{t("templatePanel.to")}</span>
				<DatePicker
					aria-label={t("templatePanel.filterEndAria")}
					showTime={{ format: "HH:mm" }}
					format="YYYY-MM-DD HH:mm"
					className={styles.datePicker}
					value={dayjs(filters.end)}
					onChange={(value) => {
						if (value) setFilters({ ...filters, end: value.format("YYYY-MM-DDTHH:mm"), page_no: 1 });
					}}
				/>
				<Select
					aria-label={t("templatePanel.model.filterAria")}
					className={styles.selectName}
					value={filters.model_name}
					onChange={(value) => setFilters({ ...filters, model_name: value, page_no: 1 })}
					options={[
						{ value: "", label: t("templatePanel.model.allModels") },
						...modelOptions.map((name) => ({ value: name, label: name })),
					]}
				/>
			</div>
			{list.error ? (
				<TelemetryUnavailable />
			) : (
				<Table
					rowKey={(row) => `${row.workspace_id}/${row.model_name}`}
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
			{page && (page.total > TELEMETRY_PAGE_SIZE || filters.page_no > 1) ? (
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
	templateId,
	agentId,
	templateName,
}: {
	templateId?: string;
	agentId?: string;
	templateName?: string;
}) {
	const { t } = useTranslation("usage");
	const client = useMemo(getAdminClient, []);
	/** 日期、来源与工具变更即触发查询（page_no 归 1）；scope 记录所属模版作用域，跨模版切换时由下方 effect 归位。 */
	const [filters, setFilters] = useState(() => ({
		scope: scopeKeyOf(templateId, agentId),
		start: toLocalMinuteInput(Date.now() - 7 * 24 * 60 * 60 * 1000),
		end: toLocalMinuteInput(Date.now()),
		source: "",
		tool_name: "",
		page_no: 1,
	}));
	/** 切换选中模版（含进入/离开「全部」）即归位分页与来源/工具筛选，保留时间区间。 */
	useEffect(() => {
		const scope = scopeKeyOf(templateId, agentId);
		setFilters((current) =>
			current.scope === scope && current.page_no === 1 && current.source === "" && current.tool_name === ""
				? current
				: { ...current, scope, page_no: 1, source: "", tool_name: "" },
		);
	}, [templateId, agentId]);
	/** 工具名下拉选项：按当前模版绑定智能体、时间区间与来源拉一页全量去重聚合；工具种类超过 100 时选项可能不全。 */
	const optionsQuery = useAdminQuery(
		`usage:tool-options:${scopeKeyOf(templateId, agentId)}:${filters.start}:${filters.end}:${filters.source}`,
		(signal) =>
			client.usage.toolUsage(
				{
					...telemetryQuery(filters, agentId),
					...(filters.source ? { source: filters.source as ToolUsageQuery["source"] } : {}),
					page_no: 1,
					page_size: 100,
				},
				signal,
			),
	);
	const toolOptions = [...new Set((optionsQuery.data?.items ?? []).map((row) => row.tool_name))];
	const list = useAdminQuery(
		`usage:tool-usage:${scopeKeyOf(templateId, agentId)}:${JSON.stringify(filters)}`,
		(signal) =>
			client.usage.toolUsage(
				{
					...telemetryQuery(filters, agentId),
					...(filters.source ? { source: filters.source as ToolUsageQuery["source"] } : {}),
					...(filters.tool_name ? { tool_name: filters.tool_name } : {}),
					page_no: filters.page_no,
					page_size: TELEMETRY_PAGE_SIZE,
				},
				signal,
			),
	);
	const page: ToolUsagePage | undefined = list.data;
	const rows: ToolUsageItem[] = page?.items ?? [];
	const hasNext = page ? filters.page_no * TELEMETRY_PAGE_SIZE < page.total : false;
	const loading = list.loading || (!list.data && !list.error);
	return (
		<section aria-labelledby="tool-usage-heading" className={styles.telemetrySection}>
			<div className={styles.sectionHeader}>
				<h3 id="tool-usage-heading" className={styles.sectionTitle}>
					{t("templatePanel.tool.title")}
				</h3>
				{page ? (
					<span className={styles.metaText}>
						{t("templatePanel.tool.totalCalls", {
							calls: usageNumber(page.total_call_count),
							rows: usageNumber(page.total),
						})}
					</span>
				) : null}
			</div>
			<TelemetryScopeNote templateName={templateName} />
			<div className={styles.filterRow}>
				<DatePicker
					aria-label={t("templatePanel.filterStartAria")}
					showTime={{ format: "HH:mm" }}
					format="YYYY-MM-DD HH:mm"
					className={styles.datePicker}
					value={dayjs(filters.start)}
					onChange={(value) => {
						if (value) setFilters({ ...filters, start: value.format("YYYY-MM-DDTHH:mm"), page_no: 1 });
					}}
				/>
				<span className={styles.metaText}>{t("templatePanel.to")}</span>
				<DatePicker
					aria-label={t("templatePanel.filterEndAria")}
					showTime={{ format: "HH:mm" }}
					format="YYYY-MM-DD HH:mm"
					className={styles.datePicker}
					value={dayjs(filters.end)}
					onChange={(value) => {
						if (value) setFilters({ ...filters, end: value.format("YYYY-MM-DDTHH:mm"), page_no: 1 });
					}}
				/>
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
					options={[
						{ value: "", label: t("templatePanel.tool.allTools") },
						...toolOptions.map((name) => ({ value: name, label: name })),
					]}
				/>
			</div>
			{list.error ? (
				<TelemetryUnavailable />
			) : (
				<Table
					rowKey={(row) => `${row.workspace_id}/${row.source}/${row.tool_name}`}
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
			{page && (page.total > TELEMETRY_PAGE_SIZE || filters.page_no > 1) ? (
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
