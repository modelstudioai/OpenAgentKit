import type {
	MemberSessionUsage,
	MemberUsageSummary,
	MemberView,
	ModelUsagePage,
	ToolUsagePage,
} from "@openagentkit/sdk/protocol";
import type { TableColumnsType } from "antd";
import { Button, Empty, Result, Select, Spin, Table } from "antd";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createAdminClient } from "../../lib/admin/index.ts";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { useMemberUsage } from "../../lib/admin/use-member-usage.ts";
import { getAdminClient } from "../../lib/api.ts";
import { adminRequest } from "../../lib/kit.ts";
import { StatCard, StatCell } from "../../lib/stat-card.tsx";
import { InnerLayout } from "../navigation/inner-layout.tsx";
import { MemberUsageLimits } from "../usage/usage-limit-panels.tsx";
import styles from "./members.module.less";
import { collectionLabels, UsageMetrics } from "./usage-metrics.tsx";

function captureTime(value: string | undefined, t: TFunction<"members">) {
	return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : t("capture.never");
}

const SESSION_TELEMETRY_PAGE_SIZE = 20;

function usageTotalText(page?: ModelUsagePage | ToolUsagePage) {
	return page ? page.total_call_count.toLocaleString("zh-CN") : "—";
}

type TelemetryQueryState = { loading: boolean; data?: unknown; error?: string | null };

function telemetryLoading(...queries: TelemetryQueryState[]) {
	return queries.some((query) => query.loading || (!query.data && !query.error));
}

function telemetryHasNext(page: { total: number } | undefined, pageNo: number, pageSize: number) {
	return page ? pageNo * pageSize < page.total : false;
}

type ModelRow = ModelUsagePage["items"][number];

function countText(value: number) {
	return value.toLocaleString("zh-CN");
}

function modelColumns(t: TFunction<"members">): TableColumnsType<ModelRow> {
	return [
		{ title: t("columnsModel.modelName"), dataIndex: "model_name" },
		{
			title: t("columnsModel.callCount"),
			dataIndex: "call_count",
			align: "right",
			render: (value: number) => countText(value),
		},
		{
			title: t("columnsModel.failedCount"),
			dataIndex: "failed_count",
			align: "right",
			render: (value: number) => countText(value),
		},
		{
			title: t("columnsModel.input"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{countText(row.tokens.input_tokens)}</span>,
		},
		{
			title: t("columnsModel.output"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{countText(row.tokens.output_tokens)}</span>,
		},
		{
			title: t("columnsModel.cacheRead"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{countText(row.tokens.cache_read_tokens)}</span>,
		},
		{
			title: t("columnsModel.cacheCreation"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{countText(row.tokens.cache_creation_tokens)}</span>,
		},
	];
}

function SessionModelTable({ rows, loading }: { rows: ModelUsagePage["items"]; loading?: boolean }) {
	const { t } = useTranslation("members");
	return (
		<Table
			rowKey="model_name"
			size="small"
			loading={loading}
			columns={modelColumns(t)}
			dataSource={rows}
			pagination={false}
			scroll={{ x: "max-content" }}
			locale={{ emptyText: t("telemetry.noModelCalls") }}
		/>
	);
}

type ToolRow = ToolUsagePage["items"][number];

function toolColumns(t: TFunction<"members">): TableColumnsType<ToolRow> {
	return [
		{ title: t("columnsTool.toolName"), dataIndex: "tool_name" },
		{ title: t("columnsTool.source"), dataIndex: "source" },
		{
			title: t("columnsModel.callCount"),
			dataIndex: "call_count",
			align: "right",
			render: (value: number) => countText(value),
		},
		{
			title: t("columnsModel.failedCount"),
			dataIndex: "failed_count",
			align: "right",
			render: (value: number) => countText(value),
		},
	];
}

function SessionToolTable({ rows, loading }: { rows: ToolUsagePage["items"]; loading?: boolean }) {
	const { t } = useTranslation("members");
	return (
		<Table
			rowKey={(row) => `${row.source}/${row.tool_name}`}
			size="small"
			loading={loading}
			columns={toolColumns(t)}
			dataSource={rows}
			pagination={false}
			scroll={{ x: "max-content" }}
			locale={{ emptyText: t("telemetry.noToolCalls") }}
		/>
	);
}

/** 已就绪明细的展示：模型/工具两块 + 分页；加载提示悬浮右上角，不参与布局，避免切换时高度抖动。 */
function SessionTelemetryView({
	shown,
	loading,
	pageNo,
	hasNext,
	onPage,
}: {
	shown: { models: ModelUsagePage; tools: ToolUsagePage };
	loading: boolean;
	pageNo: number;
	hasNext: boolean;
	onPage: (pageNo: number) => void;
}) {
	const { t } = useTranslation("members");
	return (
		<>
			{loading ? (
				<p role="status" className={styles.telemetryLoading}>
					{t("telemetry.loadingShort")}
				</p>
			) : null}
			<div>
				<p className={styles.telemetryTitle}>{t("telemetry.modelsTitle", { total: usageTotalText(shown.models) })}</p>
				<SessionModelTable rows={shown.models.items} />
			</div>
			<div>
				<p className={styles.telemetryTitle}>{t("telemetry.toolsTitle", { total: usageTotalText(shown.tools) })}</p>
				<SessionToolTable rows={shown.tools.items} />
			</div>
			{hasNext || pageNo > 1 ? (
				<nav aria-label={t("telemetry.pagerAria")} className={styles.telemetryPager}>
					<Button size="small" disabled={pageNo === 1} onClick={() => onPage(pageNo - 1)}>
						{t("list.prev")}
					</Button>
					<span>{t("list.pageOf", { page: pageNo })}</span>
					<Button size="small" disabled={!hasNext} onClick={() => onPage(pageNo + 1)}>
						{t("list.next")}
					</Button>
				</nav>
			) : null}
		</>
	);
}

/** 单会话的 Provider 侧模型/工具用量（session 口径：按会话自身窗口统计，无时间筛选）。
 *  切换会话/页码期间保留上一次已就绪的内容直到新数据到位（或确认出错），明细区不塌缩，避免整页闪动。 */
function SessionUsageTelemetry({ sessionId }: { sessionId: string }) {
	const { t } = useTranslation("members");
	const client = useMemo(getAdminClient, []);
	/** 页码随会话自动归位：会话变了视同第 1 页。组件跨会话保持挂载（重挂会丢掉上次内容导致闪动）。 */
	const [page, setPage] = useState({ sessionId, pageNo: 1 });
	const pageNo = page.sessionId === sessionId ? page.pageNo : 1;
	const models = useAdminQuery(`member-session-model:${sessionId}:${pageNo}`, (signal) =>
		client.usage.modelUsage({ session_id: sessionId, page_no: pageNo, page_size: SESSION_TELEMETRY_PAGE_SIZE }, signal),
	);
	const tools = useAdminQuery(`member-session-tool:${sessionId}:${pageNo}`, (signal) =>
		client.usage.toolUsage({ session_id: sessionId, page_no: pageNo, page_size: SESSION_TELEMETRY_PAGE_SIZE }, signal),
	);
	/** 最近一次双接口都就绪的内容；加载期间继续展示它，就绪后原子替换。 */
	const [shown, setShown] = useState<{ key: string; models: ModelUsagePage; tools: ToolUsagePage } | null>(null);
	const queryKey = `${sessionId}:${pageNo}`;
	useEffect(() => {
		if (models.data && tools.data) setShown({ key: queryKey, models: models.data, tools: tools.data });
	}, [models.data, tools.data, queryKey]);
	const loading = telemetryLoading(models, tools);
	const error = models.error ?? tools.error;
	// 加载中沿用上次内容的分页状态，避免分页栏闪现闪没。
	const hasNext =
		telemetryHasNext(models.data ?? shown?.models, pageNo, SESSION_TELEMETRY_PAGE_SIZE) ||
		telemetryHasNext(tools.data ?? shown?.tools, pageNo, SESSION_TELEMETRY_PAGE_SIZE);
	return (
		<div className={styles.telemetryRoot}>
			{error ? (
				<Result
					status="error"
					title={error}
					extra={
						<Button
							size="small"
							onClick={() => {
								void Promise.all([models.refresh(), tools.refresh()]);
							}}
						>
							{t("telemetry.retry")}
						</Button>
					}
				/>
			) : null}
			{!error && shown ? (
				<SessionTelemetryView
					shown={shown}
					loading={loading}
					pageNo={pageNo}
					hasNext={hasNext}
					onPage={(next) => setPage({ sessionId, pageNo: next })}
				/>
			) : null}
			{!error && !shown ? (
				<p role="status" className={styles.telemetryEmpty}>
					{loading ? t("telemetry.loading") : t("telemetry.empty")}
				</p>
			) : null}
		</div>
	);
}

/** 选中会话的身份行 + 用量统计卡：与模版用量卡片同款式（蓝/灰交替浅色卡，缺失不按 0 计算）。 */
function SessionOverviewCards({ session }: { session: MemberSessionUsage }) {
	const { t } = useTranslation(["members", "common"]);
	const metrics = { ...session.usage, ...session.stats };
	/** 已采集但 Provider 未返回的指标用「未返回」，未采集的用「待获取」。 */
	const missingText = session.captured_at ? t("common:collection.notReturned") : t("common:collection.pending");
	return (
		<div className={styles.cardsStack}>
			<div className={styles.sessionHead}>
				<h4 className={styles.sessionTitle}>{session.title || session.session_id}</h4>
				<p className={styles.sessionMeta}>
					{session.session_id} · {session.agent_slug} · {session.deleted_at ? t("deletedKept") : session.status || "—"}{" "}
					· {t("capture.created", { time: captureTime(session.created_at, t) })} ·{" "}
					{t(collectionLabels[session.collection_status], { ns: "common" })} ·{" "}
					{t("capture.capturedAt", { time: captureTime(session.captured_at, t) })}
				</p>
			</div>
			<dl className={styles.cardGrid}>
				<StatCard tone="tint" className={styles.statCardSpan3}>
					<div className={styles.statPair}>
						<StatCell
							label={t("common:metrics.inputTokens")}
							value={metrics.input_tokens ?? null}
							missingText={missingText}
						/>
						<StatCell
							label={t("common:metrics.outputTokens")}
							value={metrics.output_tokens ?? null}
							missingText={missingText}
						/>
					</div>
				</StatCard>
				<StatCard tone="subtle" className={styles.statCardSpan3}>
					<div className={styles.statPair}>
						<StatCell
							label={t("common:metrics.cacheRead")}
							value={metrics.cache_read_input_tokens ?? null}
							missingText={missingText}
						/>
						<StatCell
							label={t("common:metrics.cacheWrite")}
							value={metrics.cache_creation_input_tokens ?? null}
							missingText={missingText}
						/>
					</div>
				</StatCard>
				<StatCard tone="tint" className={styles.statCardSpan3}>
					<StatCell
						label={t("usagePage.statActiveTime")}
						unit={t("usagePage.unitSeconds")}
						value={metrics.active_seconds ?? null}
						missingText={missingText}
					/>
				</StatCard>
				<StatCard tone="subtle" className={styles.statCardSpan3}>
					<StatCell
						label={t("usagePage.statSessionTime")}
						unit={t("usagePage.unitSeconds")}
						value={metrics.duration_seconds ?? null}
						missingText={missingText}
					/>
				</StatCard>
			</dl>
		</div>
	);
}

/** 单会话用量明细区：「选择会话」下拉置顶，选中会话后展示其用量统计卡与模型/工具调用明细。 */
function SessionUsageDetail({
	rows,
	selectedId,
	onSelect,
	pagination,
}: {
	rows: MemberSessionUsage[];
	selectedId: string | null;
	onSelect: (sessionId: string) => void;
	pagination: { page: number; hasNext: boolean; loading: boolean; onPrevious: () => void; onNext: () => void };
}) {
	const { t } = useTranslation("members");
	/** 仅当所选会话仍在当前筛选/分页结果里时才展示明细，避免明细与列表范围脱节。 */
	const selected = rows.find((row) => row.session_id === selectedId) ?? null;
	return (
		<section aria-labelledby="session-usage-detail-heading" className={styles.detailStack}>
			<div className={styles.detailHeader}>
				<h3 id="session-usage-detail-heading" className={styles.detailTitle}>
					{t("session.detailTitle")}
				</h3>
				<div className={styles.detailControls}>
					<div className={styles.sessionPicker}>
						{t("session.selectLabel")}
						<Select
							aria-label={t("session.selectLabel")}
							className={styles.sessionSelect}
							value={selected?.session_id ?? ""}
							onChange={onSelect}
							options={rows.map((session) => ({
								value: session.session_id,
								label: t("session.option", {
									title: session.title || session.session_id,
									id: session.session_id,
								}),
							}))}
						/>
					</div>
					{(pagination.page > 1 || pagination.hasNext) && (
						<nav aria-label={t("session.pagerAria")} className={styles.sessionPager}>
							<Button
								size="small"
								disabled={pagination.loading || pagination.page === 1}
								onClick={pagination.onPrevious}
							>
								{t("list.prev")}
							</Button>
							<span>{t("list.pageOf", { page: pagination.page })}</span>
							<Button size="small" disabled={pagination.loading || !pagination.hasNext} onClick={pagination.onNext}>
								{t("list.next")}
							</Button>
						</nav>
					)}
				</div>
			</div>
			{selected ? (
				<div className={styles.detailStack}>
					<SessionOverviewCards session={selected} />
					<SessionUsageTelemetry sessionId={selected.session_id} />
				</div>
			) : null}
		</section>
	);
}

function MemberSummary({ summary }: { summary: MemberUsageSummary }) {
	const { t } = useTranslation("members");
	const refreshing = summary.refresh_status === "refreshing";
	return (
		<>
			<div className={styles.summaryRow} role="status">
				<span>
					{t("usagePage.summarySessions", {
						count: summary.session_count,
						deleted: summary.deleted_session_count,
					})}
				</span>
				<span>
					{refreshing
						? t("usagePage.progressRefreshing", {
								completed: summary.completed_sessions,
								total: summary.session_count,
							})
						: t("usagePage.progressDone", {
								completed: summary.completed_sessions,
								total: summary.session_count,
							})}
				</span>
				<span>{t("usagePage.lastCollected", { time: captureTime(summary.refreshed_at, t) })}</span>
			</div>
			{["failed", "partial"].includes(summary.refresh_status) && (
				<p role="status" className={styles.summaryNote}>
					{t("usagePage.incomplete")}
				</p>
			)}
			<UsageMetrics summary={summary} />
			<p className={styles.metricsNote}>{t("usagePage.metricsNote")}</p>
		</>
	);
}

export function MemberUsagePage({
	member,
	onBack,
	backLabel,
	editLimits = false,
}: {
	member: MemberView;
	onBack: () => void;
	backLabel?: string;
	editLimits?: boolean;
}) {
	const { t } = useTranslation("members");
	const client = useMemo(() => createAdminClient({ request: adminRequest() }), []);
	const usage = useMemberUsage(client, member.member_id);
	const summary = usage.summary;
	const refreshing = summary?.refresh_status === "refreshing";
	/** 明细区当前展示的会话；由「选择会话」下拉驱动。 */
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
	/** 有会话数据时默认选中一个会话（优先选已采集有数据的），打开页面即可看到明细。 */
	useEffect(() => {
		if (!usage.sessions.length) return;
		if (selectedSessionId && usage.sessions.some((session) => session.session_id === selectedSessionId)) return;
		const fallback = usage.sessions.find((session) => session.captured_at) ?? usage.sessions[0];
		if (!fallback) return;
		setSelectedSessionId(fallback.session_id);
	}, [usage.sessions, selectedSessionId]);
	return (
		<section aria-labelledby="member-usage-heading" className={styles.pageRoot}>
			<InnerLayout
				titleId="member-usage-heading"
				title={t("usagePage.title", { name: member.display_name })}
				description={t("usagePage.description", { username: member.username })}
				onBack={onBack}
				backLabel={backLabel ?? t("route.backToMembers")}
				right={
					<Button loading={usage.loading || refreshing} onClick={() => void usage.refresh()}>
						{refreshing ? t("usagePage.refreshing") : t("usagePage.refresh")}
					</Button>
				}
			/>
			<MemberUsageLimits memberId={member.member_id} initiallyEditing={editLimits} />
			<label htmlFor="member-usage-agent" className={styles.agentFilterLabel}>
				{t("usagePage.agentFilter")}
				<Select
					id="member-usage-agent"
					value={usage.agentSlug}
					onChange={usage.setAgent}
					className={styles.agentFilterSelect}
					options={[
						{ value: "", label: t("usagePage.allAgents") },
						...usage.agents.map((agent) => ({ value: agent, label: agent })),
					]}
				/>
			</label>
			{usage.error && (
				<Result
					status="error"
					title={usage.error}
					extra={<Button onClick={usage.retry}>{t("usagePage.retry")}</Button>}
				/>
			)}
			{summary ? (
				<MemberSummary summary={summary} />
			) : (
				usage.loading && (
					<div className={styles.loadingRow}>
						<Spin />
					</div>
				)
			)}
			{usage.sessions.length > 0 ? (
				<SessionUsageDetail
					rows={usage.sessions}
					selectedId={selectedSessionId}
					onSelect={setSelectedSessionId}
					pagination={{
						page: usage.page,
						hasNext: usage.hasNext,
						loading: usage.loading,
						onPrevious: usage.previous,
						onNext: usage.next,
					}}
				/>
			) : (
				!usage.loading &&
				!usage.error && (
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={usage.agentSlug ? t("usagePage.emptyAgent") : t("usagePage.emptyDefault")}
					/>
				)
			)}
		</section>
	);
}
