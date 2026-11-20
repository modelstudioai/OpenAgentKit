import { ArrowLeftOutlined } from "@ant-design/icons";
import type {
	TemplateSessionUsage,
	TemplateUsageRow,
	UsageModelRow,
	UsageSummary,
	UsageToolRow,
} from "@openagentkit/sdk/protocol";
import type { TableColumnsType } from "antd";
import { Button, DatePicker, Empty, Popover, Result, Select, Table, Tag } from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
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

function captureTime(value?: string) {
	return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未采集";
}

/** 「全部」口径部分成功提示：coverage 仅在部分模版绑定智能体查询失败时出现。 */
function CoverageNote({ coverage }: { coverage: UsageSummary["coverage"] }) {
	if (!coverage || coverage.complete) return null;
	return (
		<p role="status" className={styles.metaText}>
			部分智能体用量缺失（{coverage.missing_agent_ids.join("、")}），以下统计为已成功部分的合计。
		</p>
	);
}

function refreshedAt(row: TemplateUsageRow) {
	return row.refreshed_at ? new Date(row.refreshed_at).toLocaleString("zh-CN", { hour12: false }) : "尚未成功采集";
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
	const hintOf = (key: keyof TemplateUsageRow["metrics"]) =>
		`覆盖 ${row.metrics[key].covered_sessions} / ${row.session_count} 个会话`;
	return (
		<div className={styles.cardStack}>
			<div className={styles.identityRow}>
				<div className={styles.identityMeta}>
					<h3 className={styles.sectionTitle}>
						{row.name}
						{row.deleted ? <Tag>已删除</Tag> : null}
					</h3>
					<p className={styles.identitySub}>
						{aggregateCount === undefined ? (
							<>
								智能体 {row.remote_agent_name} ·{" "}
								<span className={row.listing_status === "listed" ? styles.statusOn : undefined}>
									{row.listing_status === "listed" ? "已上架" : "未上架"}
								</span>{" "}
								·{" "}
							</>
						) : (
							`共 ${aggregateCount} 个模版 · `
						)}
						最近成功采集 {refreshedAt(row)}
					</p>
				</div>
				{onSelect && onLimits ? (
					<div className={styles.cardActions}>
						<Button type="link" size="small" onClick={() => onSelect(row)}>
							会话明细
						</Button>
						<Button type="link" size="small" onClick={() => onLimits(row)}>
							设置限额
						</Button>
					</div>
				) : null}
			</div>
			<dl className={styles.statGrid}>
				<StatCard tone="tint" className={styles.statCardSpan2}>
					<StatCell label="会话数" value={row.session_count} unit="个" hint={`含已删除 ${row.deleted_session_count}`} />
				</StatCard>
				<StatCard tone="subtle" className={styles.statCardSpan2}>
					<StatCell
						label="执行时长"
						value={row.metrics.active_seconds.value}
						unit="秒"
						hint={hintOf("active_seconds")}
					/>
				</StatCard>
				<StatCard tone="tint" className={styles.statCardSpan2}>
					<StatCell
						label="会话时长"
						value={row.metrics.duration_seconds.value}
						unit="秒"
						hint={hintOf("duration_seconds")}
					/>
				</StatCard>
				<StatCard tone="subtle" className={styles.statCardSpan2}>
					<StatCell
						label="用户交互轮数"
						value={providerTotal ? providerTotal.turns.value : null}
						unit="轮"
						hint="Provider 侧统计时间内"
						missingText={providerTotal ? "未返回" : "待获取"}
					/>
				</StatCard>
				<StatCard tone="tint" className={styles.statCardSpan2}>
					<StatCell
						label="总执行步骤"
						value={providerTotal ? providerTotal.steps.value : null}
						unit="步"
						hint="Provider 侧统计时间内"
						missingText={providerTotal ? "未返回" : "待获取"}
					/>
				</StatCard>
			</dl>
		</div>
	);
}

function metricText(session: TemplateSessionUsage, key: (typeof usageMetrics)[number][0]) {
	const metrics = { ...session.usage, ...session.stats };
	return (
		metrics[key]?.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) ?? (session.captured_at ? "未返回" : "待获取")
	);
}

const sessionDetailColumns: TableColumnsType<TemplateSessionUsage> = [
	{
		title: "会话",
		dataIndex: "session_id",
		render: (_, row) => (
			<div>
				<span className={styles.sessionTitle}>{row.title || row.session_id}</span>{" "}
				<span className={styles.metaText}>{row.session_id}</span>
			</div>
		),
	},
	{
		title: "成员",
		render: (_, row) => (
			<div>
				<span>{row.member_display_name}</span> <span className={styles.metaText}>{row.member_username}</span>
			</div>
		),
	},
	{ title: "状态", render: (_, row) => (row.deleted_at ? "已删除（用量保留）" : row.status || "—") },
	{ title: "创建时间", dataIndex: "created_at", render: (value: string | undefined) => captureTime(value) },
	...usageMetrics.map(([key, label]) => ({
		title: label,
		align: "right" as const,
		render: (_: unknown, row: TemplateSessionUsage) => (
			<span className={styles.tabularNum}>{metricText(row, key)}</span>
		),
	})),
	{
		title: "采集状态",
		dataIndex: "collection_status",
		render: (status: TemplateSessionUsage["collection_status"]) => collectionLabels[status],
	},
	{ title: "采集时间", dataIndex: "captured_at", render: (value: string | undefined) => captureTime(value) },
];

function TemplateSessionsTable({ rows, loading }: { rows: TemplateSessionUsage[]; loading: boolean }) {
	return (
		<Table
			rowKey="session_id"
			size="middle"
			loading={loading}
			columns={sessionDetailColumns}
			dataSource={rows}
			pagination={false}
			scroll={{ x: "max-content" }}
			locale={{
				emptyText: (
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={
							<span>
								暂无会话
								<br />
								<span className={styles.metaText}>成员从体验页进入该模版后会话将在这里统计。</span>
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
				返回模版用量
			</Button>
			<header className={styles.detailHeader}>
				<div>
					<h2 id="template-usage-detail-heading" className={styles.detailTitle}>
						{template.name}的会话用量
						{template.deleted ? <Tag>已删除</Tag> : null}
					</h2>
					<p className={styles.detailSub}>全部成员从该模版上架条目发起的会话，包含已删除会话保存的用量。</p>
				</div>
				<Button
					loading={loading}
					onClick={() => {
						void Promise.all([list.refresh(), onRefresh()]);
					}}
				>
					刷新用量
				</Button>
			</header>
			<TemplateUsageLimits templateId={template.template_id} initiallyEditing={editLimits} />
			<div className={styles.collectStatus} role="status">
				<span>
					会话数：{template.session_count}（已删除 {template.deleted_session_count}）
				</span>
				<span>最近采集：{captureTime(template.refreshed_at)}</span>
			</div>
			<UsageMetrics summary={template} />
			<p className={styles.metaText}>各指标独立统计，未知字段不按 0 计算。统计范围与明细一致，合计不受分页影响。</p>
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
							重试
						</Button>
					}
				/>
			) : (
				<TemplateSessionsTable rows={rows} loading={loading} />
			)}
			{(query.cursors.length > 1 || hasNext) && (
				<nav aria-label="模版会话分页" className={styles.pager}>
					<Button
						size="small"
						disabled={loading || query.cursors.length === 1}
						onClick={() => setQuery((current) => ({ ...current, cursors: current.cursors.slice(0, -1) }))}
					>
						上一页
					</Button>
					<span>第 {query.cursors.length} 页</span>
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
						下一页
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
	return (
		<RangePicker
			aria-label="统计时间"
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
					content={
						<span className={styles.preLine}>
							用量按模版绑定的智能体汇总，包含该智能体的全部调用（体验会话、调试与 Kit 外调用都计入）；
							下方明细仅列体验会话，保留已删除会话的用量记录。「全部」为所有模版绑定智能体的去重汇总，
							单个智能体查询失败时仅标注缺失来源，不影响其余数据。 各项 Token 独立展示，未知值不按 0 计算。
						</span>
					}
					title="口径说明"
					trigger="click"
				>
					<button type="button" className={styles.popLink}>
						口径说明
					</button>
				</Popover>
				<div className={styles.pickerInline}>
					<span className={styles.inlineLabel}>统计时间</span>
					<StatRangePicker value={statRange} onChange={setStatRange} />
				</div>
			</div>
			<CoverageNote coverage={summary?.coverage} />
			{loading ? (
				<p role="status" className={styles.loadingNote}>
					正在加载模版用量…
				</p>
			) : null}
			{error ? (
				<Result
					status="error"
					title={error}
					extra={
						<Button size="small" onClick={onRetry}>
							重试
						</Button>
					}
				/>
			) : null}
			{!loading && !error && !rows.length ? (
				<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="在模版管理中保存模版后，即可在此查看各模版的用量。" />
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
	return (
		<p className={styles.metaText}>
			{templateName
				? `已按选中模版「${templateName}」绑定的智能体（agent_id）过滤 Provider 侧调用。`
				: "统计全部模版绑定智能体（含已删除模版）的 Provider 侧调用，未绑定模版的智能体不计入。"}
		</p>
	);
}

/** 「暂不支持」占位卡：与 ErrorState 同量级的边框盒，中性信息色、无重试入口（上游接入后自动恢复）。 */
function TelemetryUnavailable() {
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
				<strong className={styles.unavailableTitle}>暂不支持，待接入</strong>
				<p className={styles.unavailableDesc}>Provider 侧用量明细尚未接入，接入后此处自动展示。</p>
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
	return (
		<nav aria-label="用量明细分页" className={styles.pager}>
			<Button size="small" disabled={loading || pageNo === 1} onClick={() => onChange(pageNo - 1)}>
				上一页
			</Button>
			<span>第 {pageNo} 页</span>
			<Button size="small" disabled={loading || !hasNext} onClick={() => onChange(pageNo + 1)}>
				下一页
			</Button>
		</nav>
	);
}

const modelTelemetryColumns: TableColumnsType<UsageModelRow> = [
	{
		title: "模型名",
		dataIndex: "model_name",
		render: (value: string | null) => <span className={styles.workspaceText}>{value ?? "未归因"}</span>,
	},
	{ title: "调用次数", align: "right", render: (_, row) => usageNumber(row.usage.call_count.value) },
	{ title: "失败次数", align: "right", render: (_, row) => usageNumber(row.usage.failed_count.value) },
	{
		title: "输入",
		align: "right",
		render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.usage.input_tokens.value)}</span>,
	},
	{
		title: "输出",
		align: "right",
		render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.usage.output_tokens.value)}</span>,
	},
	{
		title: "缓存读取",
		align: "right",
		render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.usage.cache_read_tokens.value)}</span>,
	},
	{
		title: "缓存创建",
		align: "right",
		render: (_, row) => <span className={styles.tabularNum}>{usageNumber(row.usage.cache_creation_tokens.value)}</span>,
	},
	{
		title: "缓存命中率",
		align: "right",
		render: (_, row) => <span className={styles.tabularNum}>{hitRatioText(row.usage.cache_hit_ratio.value)}</span>,
	},
];

const toolTelemetryColumns: TableColumnsType<UsageToolRow> = [
	{ title: "工具名", dataIndex: "tool_name", render: (value: string | null) => value ?? "未知" },
	{
		title: "来源",
		dataIndex: "source",
		render: (value: string | null) => (value ? (sourceLabels[value] ?? value) : "未知"),
	},
	{ title: "调用次数", align: "right", render: (_, row) => usageNumber(row.usage.call_count.value) },
	{ title: "失败次数", align: "right", render: (_, row) => usageNumber(row.usage.failed_count.value) },
];

const sourceLabels: Record<string, string> = { builtin: "内置", mcp: "MCP", custom: "自定义" };

/** 明细区头部行内失败数字：0 次时整段省略。 */
function failedSuffix(failed: number | null) {
	return failed ? ` · 失败 ${usageNumber(failed)} 次` : "";
}

/** 工具分源行内数字（调用数口径，与来源列一致）：0 值的源省略，全为 0 时整段省略。 */
function toolSourceSuffix(total: UsageSummary["usage"]["total"]) {
	const parts = (["builtin", "mcp", "custom"] as const)
		.map((source) => ({ label: sourceLabels[source], count: total[`${source}_tool_call_count`].value ?? 0 }))
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
					模型用量
				</h3>
				{summary ? (
					<span className={styles.metaText}>
						全部模型调用 {usageNumber(summary.usage.total.model_call_count.value)} 次
						{failedSuffix(summary.usage.total.model_failed_count.value)} · 共 {usageNumber(filtered.length)} 行
					</span>
				) : null}
			</div>
			<TelemetryScopeNote templateName={templateName} />
			<div className={styles.filterRow}>
				<Select
					aria-label="模型名筛选"
					className={styles.selectName}
					value={filters.model_name}
					onChange={(value) => setFilters({ ...filters, model_name: value, page_no: 1 })}
					options={[{ value: "", label: "全部模型" }, ...modelOptions.map((name) => ({ value: name, label: name }))]}
				/>
			</div>
			{error ? (
				<TelemetryUnavailable />
			) : (
				<Table
					rowKey={(row) => row.model_name ?? "unknown"}
					size="small"
					loading={loading}
					columns={modelTelemetryColumns}
					dataSource={rows}
					pagination={false}
					scroll={{ x: "max-content" }}
					locale={{
						emptyText: telemetryEmpty("统计区间内无模型调用", "调整时间区间、模型筛选或切换选中模版后重试。"),
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
					工具调用
				</h3>
				{summary ? (
					<span className={styles.metaText}>
						全部工具调用 {usageNumber(summary.usage.total.tool_call_count.value)} 次
						{toolSourceSuffix(summary.usage.total)}
						{failedSuffix(summary.usage.total.tool_failed_count.value)} · 共 {usageNumber(filtered.length)} 行
					</span>
				) : null}
			</div>
			<TelemetryScopeNote templateName={templateName} />
			<div className={styles.filterRow}>
				<Select
					aria-label="工具来源筛选"
					className={styles.selectSource}
					value={filters.source}
					onChange={(value) => setFilters({ ...filters, source: value, page_no: 1 })}
					options={[
						{ value: "", label: "全部来源" },
						{ value: "builtin", label: "内置" },
						{ value: "mcp", label: "MCP" },
						{ value: "custom", label: "自定义" },
					]}
				/>
				<Select
					aria-label="工具名筛选"
					className={styles.selectName}
					value={filters.tool_name}
					onChange={(value) => setFilters({ ...filters, tool_name: value, page_no: 1 })}
					options={[{ value: "", label: "全部工具" }, ...toolOptions.map((name) => ({ value: name, label: name }))]}
				/>
			</div>
			{error ? (
				<TelemetryUnavailable />
			) : (
				<Table
					rowKey={(row) => `${row.source ?? "unknown"}/${row.tool_name ?? "unknown"}`}
					size="small"
					loading={loading}
					columns={toolTelemetryColumns}
					dataSource={rows}
					pagination={false}
					scroll={{ x: "max-content" }}
					locale={{
						emptyText: telemetryEmpty("统计区间内无工具调用", "调整时间区间、来源/工具筛选或切换选中模版后重试。"),
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
