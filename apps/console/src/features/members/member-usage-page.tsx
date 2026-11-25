import type {
	MemberSessionUsage,
	MemberUsageSummary,
	MemberView,
	UsageModelRow,
	UsageSummary,
	UsageToolRow,
} from "@openagentkit/sdk/protocol";
import type { TableColumnsType } from "antd";
import type { TFunction } from "i18next";
import { Button, Empty, Popover, Result, Spin, Table, Tabs, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createAdminClient } from "../../lib/admin/index.ts";
import { memberUsageAgentKey } from "../../lib/admin/member-usage.ts";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { useMemberUsage } from "../../lib/admin/use-member-usage.ts";
import { getAdminClient } from "../../lib/api.ts";
import { adminRequest } from "../../lib/kit.ts";
import { StatCard, StatCell } from "../../lib/stat-card.tsx";
import { RemoteResourcePicker } from "../catalog/remote-resource-picker.tsx";
import { InnerLayout } from "../navigation/inner-layout.tsx";
import usageStyles from "../usage/usage.module.less";
import { MemberUsageLimits } from "../usage/usage-limit-panels.tsx";
import styles from "./members.module.less";
import { collectionLabels, UsageMetrics } from "./usage-metrics.tsx";

function captureTime(value: string | undefined, t: TFunction<"members">) {
	return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : t("capture.never");
}

/** 会话列表行的短时间（月/日 时:分）。 */
function listTime(value?: string) {
	return value
		? new Date(value).toLocaleString("zh-CN", {
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			})
		: "—";
}

/** 详情元信息里的会话 ID：过长时截中段展示，完整 ID 在 title 与列表数据中保留。 */
function shortId(id: string) {
	return id.length <= 40 ? id : `${id.slice(0, 20)}…${id.slice(-12)}`;
}

const SESSION_TELEMETRY_PAGE_SIZE = 20;

/** 指标值可能为 null（上游未知指标），统一显示破折号而不是 0。 */
function countText(value: number | null) {
	return value === null ? "—" : value.toLocaleString("zh-CN");
}

/** 会话行/卡的指标可能缺失（未采集或上游未返回），与 null 同样按缺失展示。 */
function sessionNum(value: number | null | undefined) {
	return value == null ? "—" : value.toLocaleString("zh-CN");
}

/** 本地分页：上游一次返回全量明细，分页只在展示层切片。 */
function slicePage<T>(rows: T[], pageNo: number) {
	return rows.slice((pageNo - 1) * SESSION_TELEMETRY_PAGE_SIZE, pageNo * SESSION_TELEMETRY_PAGE_SIZE);
}

/** 任一明细长度超过单页即仍有下一页。 */
function telemetryHasNext(summary: UsageSummary | undefined, pageNo: number) {
	const longest = Math.max(summary?.usage.models.length ?? 0, summary?.usage.tools.length ?? 0);
	return pageNo * SESSION_TELEMETRY_PAGE_SIZE < longest;
}

function modelColumns(t: TFunction<"members">): TableColumnsType<UsageModelRow> {
	return [
		{
			title: t("columnsModel.modelName"),
			dataIndex: "model_name",
			render: (value: string | null) => value ?? t("columnsModel.unattributed"),
		},
		{ title: t("columnsModel.callCount"), align: "right", render: (_, row) => countText(row.usage.call_count.value) },
		{ title: t("columnsModel.failedCount"), align: "right", render: (_, row) => countText(row.usage.failed_count.value) },
		{
			title: t("columnsModel.input"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{countText(row.usage.input_tokens.value)}</span>,
		},
		{
			title: t("columnsModel.output"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{countText(row.usage.output_tokens.value)}</span>,
		},
		{
			title: t("columnsModel.cacheRead"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{countText(row.usage.cache_read_tokens.value)}</span>,
		},
		{
			title: t("columnsModel.cacheCreation"),
			align: "right",
			render: (_, row) => <span className={styles.tabularNum}>{countText(row.usage.cache_creation_tokens.value)}</span>,
		},
	];
}

function SessionModelTable({ rows, loading }: { rows: UsageModelRow[]; loading?: boolean }) {
	const { t } = useTranslation("members");
	return (
		<Table
			rowKey={(row) => row.model_name ?? "unknown"}
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

function toolColumns(t: TFunction<"members">): TableColumnsType<UsageToolRow> {
	return [
		{
			title: t("columnsTool.toolName"),
			dataIndex: "tool_name",
			render: (value: string | null) => value ?? t("columnsTool.unknown"),
		},
		{
			title: t("columnsTool.source"),
			dataIndex: "source",
			render: (value: string | null) => value ?? t("columnsTool.unknown"),
		},
		{ title: t("columnsModel.callCount"), align: "right", render: (_, row) => countText(row.usage.call_count.value) },
		{ title: t("columnsModel.failedCount"), align: "right", render: (_, row) => countText(row.usage.failed_count.value) },
	];
}

function SessionToolTable({ rows, loading }: { rows: UsageToolRow[]; loading?: boolean }) {
	const { t } = useTranslation("members");
	return (
		<Table
			rowKey={(row) => `${row.source ?? "unknown"}/${row.tool_name ?? "unknown"}`}
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

/** 已就绪明细的展示：模型/工具两个 Tab 共享本地分页；加载提示悬浮右上角，不参与布局，避免切换时高度抖动。 */
function SessionTelemetryView({
	shown,
	loading,
	pageNo,
	hasNext,
	onPage,
}: {
	shown: UsageSummary;
	loading: boolean;
	pageNo: number;
	hasNext: boolean;
	onPage: (pageNo: number) => void;
}) {
	const { t } = useTranslation("members");
	const [tab, setTab] = useState<"models" | "tools">("models");
	return (
		<>
			{loading ? (
				<p role="status" className={styles.telemetryLoading}>
					{t("telemetry.loadingShort")}
				</p>
			) : null}
			<Tabs
				activeKey={tab}
				onChange={(key) => setTab(key === "tools" ? "tools" : "models")}
				items={[
					{
						key: "models",
						label: (
							<>
								{t("telemetry.modelsTab")}
								<span className={styles.tabCount}>
									{t("telemetry.callTimes", { count: countText(shown.usage.total.model_call_count.value) })}
								</span>
							</>
						),
						children: <SessionModelTable rows={slicePage(shown.usage.models, pageNo)} />,
					},
					{
						key: "tools",
						label: (
							<>
								{t("telemetry.toolsTab")}
								<span className={styles.tabCount}>
									{t("telemetry.callTimes", { count: countText(shown.usage.total.tool_call_count.value) })}
								</span>
							</>
						),
						children: <SessionToolTable rows={slicePage(shown.usage.tools, pageNo)} />,
					},
				]}
			/>
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

/** 单会话的 Provider 侧模型/工具用量（session 维度：按会话自身窗口统计，无时间筛选）。
 *  切换会话/页码期间保留上一次已就绪的内容直到新数据到位（或确认出错），明细区不塌缩，避免整页闪动。
 *  已删除会话在 Provider 侧明细不可得：不发请求，直接展示专属空态。 */
function SessionUsageTelemetry({ sessionId, deleted }: { sessionId: string; deleted?: boolean }) {
	const { t } = useTranslation("members");
	const client = useMemo(getAdminClient, []);
	/** 页码随会话自动归位：会话变了视同第 1 页。组件跨会话保持挂载（重挂会丢掉上次内容导致闪动）。 */
	const [page, setPage] = useState({ sessionId, pageNo: 1 });
	const pageNo = page.sessionId === sessionId ? page.pageNo : 1;
	const query = useAdminQuery(
		`member-session-usage:${sessionId}`,
		(signal) => client.usage.summary({ session_id: sessionId }, signal),
		{ enabled: !deleted },
	);
	/** 最近一次就绪的内容；加载期间继续展示它，避免明细区塌缩。 */
	const [shown, setShown] = useState<UsageSummary | null>(null);
	useEffect(() => {
		if (query.data) setShown(query.data);
	}, [query.data]);
	const loading = query.loading || (!query.data && !query.error);
	// 已删除会话查询停用（query 恒 pending）且 shown 仍是上一个会话的数据：提前返回专属空态，不显示旧表格。
	if (deleted) {
		return (
			<div className={styles.telemetryRoot}>
				<p role="status" className={styles.telemetryEmpty}>
					{t("telemetry.deletedEmpty")}
				</p>
			</div>
		);
	}
	const error = query.error;
	const hasNext = telemetryHasNext(query.data ?? shown ?? undefined, pageNo);
	return (
		<div className={styles.telemetryRoot}>
			{error ? (
				<Result
					status="error"
					title={error}
					extra={
						<Button size="small" onClick={() => void query.refresh()}>
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

/** 选中会话的用量统计卡：六张独立蓝/灰交替浅色卡，缺失不按 0 计算。 */
function SessionStatCards({ session }: { session: MemberSessionUsage }) {
	const { t } = useTranslation(["members", "common"]);
	const metrics = { ...session.usage, ...session.stats };
	/** 已采集但 Provider 未返回的指标用「未返回」，未采集的用「待获取」。 */
	const missingText = session.captured_at ? t("common:collection.notReturned") : t("common:collection.pending");
	const items: Array<{ label: string; value: number | null; unit?: string }> = [
		{ label: t("common:metrics.inputTokens"), value: metrics.input_tokens ?? null },
		{ label: t("common:metrics.outputTokens"), value: metrics.output_tokens ?? null },
		{ label: t("common:metrics.cacheRead"), value: metrics.cache_read_input_tokens ?? null },
		{ label: t("common:metrics.cacheWrite"), value: metrics.cache_creation_input_tokens ?? null },
		{ label: t("usagePage.statActiveTime"), value: metrics.active_seconds ?? null, unit: t("usagePage.unitSeconds") },
		{ label: t("usagePage.statSessionTime"), value: metrics.duration_seconds ?? null, unit: t("usagePage.unitSeconds") },
	];
	return (
		<dl className={styles.metricsGrid}>
			{items.map((item, index) => (
				<StatCard key={item.label} tone={index % 2 === 0 ? "tint" : "subtle"}>
					<StatCell label={item.label} value={item.value} unit={item.unit} missingText={missingText} />
				</StatCard>
			))}
		</dl>
	);
}

// styles 取值为 string | undefined（noUncheckedIndexedAccess），故不加 Record 注解；
// 键与 collection_status 一一对应，值必然存在。
const dotClass = {
	pending: styles.dotNeutral,
	complete: styles.dotOk,
	partial: styles.dotPartial,
	failed: styles.dotFailed,
	not_found: styles.dotNeutral,
};

/** 左侧会话列表行：采集状态点 + 标题/已删除 + agent·时间 + 输入/输出数字；整行点击切换右侧明细。 */
function SessionListRow({
	session,
	selected,
	onSelect,
}: {
	session: MemberSessionUsage;
	selected: boolean;
	onSelect: (sessionId: string) => void;
}) {
	const { t } = useTranslation("members");
	return (
		<button
			type="button"
			className={styles.sessionRowBtn}
			aria-current={selected || undefined}
			onClick={() => onSelect(session.session_id)}
		>
			<span aria-hidden="true" className={`${styles.sDot} ${dotClass[session.collection_status]}`} />
			<span className={styles.sMain}>
				<span className={styles.sTitleLine}>
					<span className={styles.sTitle}>{session.title || session.session_id}</span>
					{session.deleted_at ? <Tag>{t("deletedTag")}</Tag> : null}
				</span>
				<span className={styles.sSub}>
					{session.agent_slug} · {t("capture.created", { time: listTime(session.created_at) })}
				</span>
			</span>
			<span className={styles.sNums}>
				<span>
					{t("session.rowInput")} <b>{sessionNum(session.usage?.input_tokens)}</b>
				</span>
				<span>
					{t("session.rowOutput")} <b>{sessionNum(session.usage?.output_tokens)}</b>
				</span>
			</span>
		</button>
	);
}

/** 单会话用量明细区：会话主从分栏，左侧列表即导航（当前筛选与分页的候选），右侧为选中会话详情。 */
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
		<section aria-labelledby="member-session-detail-heading" className={styles.sectionBlock}>
			<div className={styles.blockHead}>
				<h2 id="member-session-detail-heading" className={styles.blockTitle}>
					{t("session.detailTitle")}
				</h2>
				<span className={styles.headMeta}>{t("session.detailHint")}</span>
			</div>
			<div className={styles.splitGrid}>
				<div className={styles.listCol}>
					<div className={styles.listScroll}>
						<ul className={styles.sessionList}>
							{rows.map((session) => (
								<li key={session.session_id}>
									<SessionListRow session={session} selected={session.session_id === selectedId} onSelect={onSelect} />
								</li>
							))}
						</ul>
					</div>
					{(pagination.page > 1 || pagination.hasNext) && (
						<nav aria-label={t("session.pagerAria")} className={styles.listPager}>
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
				{selected ? (
					<div className={styles.detailStack}>
						<div className={styles.sdHead}>
							<h3 className={styles.sdTitle}>{selected.title || selected.session_id}</h3>
							{selected.deleted_at ? <Tag>{t("deletedKept")}</Tag> : null}
							<Tag>{t(collectionLabels[selected.collection_status], { ns: "common" })}</Tag>
						</div>
						<p className={styles.sessionMeta}>
							<code className={styles.sdCode} title={selected.session_id}>
								{shortId(selected.session_id)}
							</code>{" "}
							· {selected.agent_slug} · {selected.status || "—"} · {t("capture.created", { time: captureTime(selected.created_at, t) })} · {t("capture.capturedAt", { time: captureTime(selected.captured_at, t) })}
						</p>
						<SessionStatCards session={selected} />
						<SessionUsageTelemetry sessionId={selected.session_id} deleted={Boolean(selected.deleted_at)} />
					</div>
				) : null}
			</div>
		</section>
	);
}

function MemberSummary({ summary }: { summary: MemberUsageSummary }) {
	const { t } = useTranslation("members");
	return (
		<>
			{["failed", "partial"].includes(summary.refresh_status) && (
				<p role="status" className={styles.summaryNote}>
					{t("usagePage.incomplete")}
				</p>
			)}
			<UsageMetrics summary={summary} />
			<p className={styles.metricsFoot}>
				<Popover
					content={<span className={usageStyles.preLine}>{t("usagePage.metricsNote")}</span>}
					title={t("usagePage.metricsNoteTitle")}
					trigger="click"
				>
					<button type="button" className={usageStyles.popLink}>
						{t("usagePage.metricsNoteTitle")}
					</button>
				</Popover>
			</p>
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
	/** 明细区当前展示的会话；由左侧会话列表驱动。 */
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
			<section aria-labelledby="member-usage-summary-heading">
				<div className={styles.blockHead}>
					<h2 id="member-usage-summary-heading" className={styles.blockTitle}>
						{t("usagePage.summaryTitle")}
					</h2>
					<div className={styles.agentFilter}>
						<span>{t("usagePage.agentFilterLabel")}</span>
						<div className={styles.agentFilterControl}>
							{/* 候选来自成员用量响应本身，展开重拉会连带刷新整页。 */}
							<RemoteResourcePicker
								label={t("usagePage.agentFilter")}
								hideLabel
								resource="Agent"
								placeholder={t("usagePage.allAgents")}
								value={memberUsageAgentKey(usage.agent)}
								onChange={(key) => usage.setAgent(usage.agents.find((agent) => memberUsageAgentKey(agent) === key))}
								defaultOption={{ id: "", name: t("usagePage.allAgents") }}
								emptyText={t("usagePage.pickerEmpty")}
								refreshOnOpen={false}
								showId={false}
								remote={{
									data: usage.agents.map((agent) => ({
										id: memberUsageAgentKey(agent),
										name: agent.display_name ?? agent.slug,
										detail: agent.display_name ? agent.slug : undefined,
										tag: agent.deleted ? (
											<Tag>{t("deletedTag")}</Tag>
										) : agent.catalog_entry_id === null ? (
											<Tag>{t("agentUnlinked")}</Tag>
										) : undefined,
									})),
									loading: usage.loading,
									error: usage.error,
									refresh: usage.retry,
								}}
							/>
						</div>
					</div>
					{summary ? (
						<>
							<span className={styles.headSpacer} />
							<span className={styles.headMeta} role="status">
								{t("usagePage.summarySessions", { count: summary.session_count, deleted: summary.deleted_session_count })} ·{" "}
								{refreshing
									? t("usagePage.progressRefreshing", { completed: summary.completed_sessions, total: summary.session_count })
									: t("usagePage.progressDone", { completed: summary.completed_sessions, total: summary.session_count })} ·{" "}
								{t("usagePage.lastCollected", { time: captureTime(summary.refreshed_at, t) })}
							</span>
						</>
					) : null}
				</div>
				{usage.error && (
					<Result status="error" title={usage.error} extra={<Button onClick={usage.retry}>{t("usagePage.retry")}</Button>} />
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
			</section>
			<MemberUsageLimits memberId={member.member_id} initiallyEditing={editLimits} />
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
						description={usage.agent ? t("usagePage.emptyAgent") : t("usagePage.emptyDefault")}
					/>
				)
			)}
		</section>
	);
}
