import type {
	MemberSessionUsage,
	MemberUsageSummary,
	MemberView,
	UsageModelRow,
	UsageSummary,
	UsageToolRow,
} from "@openagentpack/kit-sdk/protocol";
import type { TableColumnsType } from "antd";
import { Button, Empty, Popover, Result, Spin, Table, Tabs, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { createAdminClient } from "../../lib/admin/index.ts";
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

function captureTime(value?: string) {
	return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未采集";
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

const modelColumns: TableColumnsType<UsageModelRow> = [
	{ title: "模型名", dataIndex: "model_name", render: (value: string | null) => value ?? "未归因" },
	{ title: "调用次数", align: "right", render: (_, row) => countText(row.usage.call_count.value) },
	{ title: "失败次数", align: "right", render: (_, row) => countText(row.usage.failed_count.value) },
	{
		title: "输入",
		align: "right",
		render: (_, row) => <span className={styles.tabularNum}>{countText(row.usage.input_tokens.value)}</span>,
	},
	{
		title: "输出",
		align: "right",
		render: (_, row) => <span className={styles.tabularNum}>{countText(row.usage.output_tokens.value)}</span>,
	},
	{
		title: "缓存读取",
		align: "right",
		render: (_, row) => <span className={styles.tabularNum}>{countText(row.usage.cache_read_tokens.value)}</span>,
	},
	{
		title: "缓存创建",
		align: "right",
		render: (_, row) => <span className={styles.tabularNum}>{countText(row.usage.cache_creation_tokens.value)}</span>,
	},
];

function SessionModelTable({ rows, loading }: { rows: UsageModelRow[]; loading?: boolean }) {
	return (
		<Table
			rowKey={(row) => row.model_name ?? "unknown"}
			size="small"
			loading={loading}
			columns={modelColumns}
			dataSource={rows}
			pagination={false}
			scroll={{ x: "max-content" }}
			locale={{ emptyText: "该会话无模型调用" }}
		/>
	);
}

const toolColumns: TableColumnsType<UsageToolRow> = [
	{ title: "工具名", dataIndex: "tool_name", render: (value: string | null) => value ?? "未知" },
	{ title: "来源", dataIndex: "source", render: (value: string | null) => value ?? "未知" },
	{ title: "调用次数", align: "right", render: (_, row) => countText(row.usage.call_count.value) },
	{ title: "失败次数", align: "right", render: (_, row) => countText(row.usage.failed_count.value) },
];

function SessionToolTable({ rows, loading }: { rows: UsageToolRow[]; loading?: boolean }) {
	return (
		<Table
			rowKey={(row) => `${row.source ?? "unknown"}/${row.tool_name ?? "unknown"}`}
			size="small"
			loading={loading}
			columns={toolColumns}
			dataSource={rows}
			pagination={false}
			scroll={{ x: "max-content" }}
			locale={{ emptyText: "该会话无工具调用" }}
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
	const [tab, setTab] = useState<"models" | "tools">("models");
	return (
		<>
			{loading ? (
				<p role="status" className={styles.telemetryLoading}>
					正在加载…
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
								模型调用
								<span className={styles.tabCount}>{countText(shown.usage.total.model_call_count.value)} 次</span>
							</>
						),
						children: <SessionModelTable rows={slicePage(shown.usage.models, pageNo)} />,
					},
					{
						key: "tools",
						label: (
							<>
								工具调用
								<span className={styles.tabCount}>{countText(shown.usage.total.tool_call_count.value)} 次</span>
							</>
						),
						children: <SessionToolTable rows={slicePage(shown.usage.tools, pageNo)} />,
					},
				]}
			/>
			{hasNext || pageNo > 1 ? (
				<nav aria-label="会话用量明细分页" className={styles.telemetryPager}>
					<Button size="small" disabled={pageNo === 1} onClick={() => onPage(pageNo - 1)}>
						上一页
					</Button>
					<span>第 {pageNo} 页</span>
					<Button size="small" disabled={!hasNext} onClick={() => onPage(pageNo + 1)}>
						下一页
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
					已删除会话不再提供模型/工具明细，用量数字来自删除前的采集快照。
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
							重试
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
					{loading ? "正在加载该会话的模型/工具用量…" : "该会话暂无模型/工具用量。"}
				</p>
			) : null}
		</div>
	);
}

/** 选中会话的用量统计卡：六张独立蓝/灰交替浅色卡，缺失不按 0 计算。 */
function SessionStatCards({ session }: { session: MemberSessionUsage }) {
	const metrics = { ...session.usage, ...session.stats };
	/** 已采集但 Provider 未返回的指标用「未返回」，未采集的用「待获取」。 */
	const missingText = session.captured_at ? "未返回" : "待获取";
	const items: Array<{ label: string; value: number | null; unit?: string }> = [
		{ label: "输入 Token", value: metrics.input_tokens ?? null },
		{ label: "输出 Token", value: metrics.output_tokens ?? null },
		{ label: "缓存读取 Token", value: metrics.cache_read_input_tokens ?? null },
		{ label: "缓存写入 Token", value: metrics.cache_creation_input_tokens ?? null },
		{ label: "执行时长", value: metrics.active_seconds ?? null, unit: "秒" },
		{ label: "会话时长", value: metrics.duration_seconds ?? null, unit: "秒" },
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
					{session.deleted_at ? <Tag>已删除</Tag> : null}
				</span>
				<span className={styles.sSub}>
					{session.agent_slug} · 创建 {listTime(session.created_at)}
				</span>
			</span>
			<span className={styles.sNums}>
				<span>
					输入 <b>{sessionNum(session.usage?.input_tokens)}</b>
				</span>
				<span>
					输出 <b>{sessionNum(session.usage?.output_tokens)}</b>
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
	/** 仅当所选会话仍在当前筛选/分页结果里时才展示明细，避免明细与列表范围脱节。 */
	const selected = rows.find((row) => row.session_id === selectedId) ?? null;
	return (
		<section aria-labelledby="member-session-detail-heading" className={styles.sectionBlock}>
			<div className={styles.blockHead}>
				<h2 id="member-session-detail-heading" className={styles.blockTitle}>
					会话用量明细
				</h2>
				<span className={styles.headMeta}>点击会话查看明细，明细随筛选与分页联动</span>
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
						<nav aria-label="成员会话分页" className={styles.listPager}>
							<Button
								size="small"
								disabled={pagination.loading || pagination.page === 1}
								onClick={pagination.onPrevious}
							>
								上一页
							</Button>
							<span>第 {pagination.page} 页</span>
							<Button size="small" disabled={pagination.loading || !pagination.hasNext} onClick={pagination.onNext}>
								下一页
							</Button>
						</nav>
					)}
				</div>
				{selected ? (
					<div className={styles.detailStack}>
						<div className={styles.sdHead}>
							<h3 className={styles.sdTitle}>{selected.title || selected.session_id}</h3>
							{selected.deleted_at ? <Tag>已删除 · 用量保留</Tag> : null}
							<Tag>{collectionLabels[selected.collection_status]}</Tag>
						</div>
						<p className={styles.sessionMeta}>
							<code className={styles.sdCode} title={selected.session_id}>
								{shortId(selected.session_id)}
							</code>{" "}
							· {selected.agent_slug} · {selected.status || "—"} · 创建 {captureTime(selected.created_at)} · 采集{" "}
							{captureTime(selected.captured_at)}
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
	return (
		<>
			{["failed", "partial"].includes(summary.refresh_status) && (
				<p role="status" className={styles.summaryNote}>
					部分会话用量尚未成功获取，合计可能不完整。已保存的数据仍保留，可点击刷新用量重试。
				</p>
			)}
			<UsageMetrics summary={summary} />
			<p className={styles.metricsFoot}>
				<Popover
					content={
						<span className={usageStyles.preLine}>
							各指标独立统计，未知字段不按 0 计算。缓存 Token 与输入 Token 的包含关系由 Provider
							决定，此处不相加。统计范围与明细筛选一致，合计不受分页影响。
						</span>
					}
					title="口径说明"
					trigger="click"
				>
					<button type="button" className={usageStyles.popLink}>
						口径说明
					</button>
				</Popover>
			</p>
		</>
	);
}

export function MemberUsagePage({
	member,
	onBack,
	backLabel = "返回成员列表",
	editLimits = false,
}: {
	member: MemberView;
	onBack: () => void;
	backLabel?: string;
	editLimits?: boolean;
}) {
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
				title={`${member.display_name}的会话用量`}
				description={`${member.username} · 全部体验会话的累计用量，包含已删除会话。`}
				onBack={onBack}
				backLabel={backLabel}
				right={
					<Button loading={usage.loading || refreshing} onClick={() => void usage.refresh()}>
						{refreshing ? "采集中…" : "刷新用量"}
					</Button>
				}
			/>
			<section aria-labelledby="member-usage-summary-heading">
				<div className={styles.blockHead}>
					<h2 id="member-usage-summary-heading" className={styles.blockTitle}>
						用量汇总
					</h2>
					<div className={styles.agentFilter}>
						<span>Agent</span>
						<div className={styles.agentFilterControl}>
							{/* 候选来自成员用量响应本身，展开重拉会连带刷新整页。 */}
							<RemoteResourcePicker
								label="Agent 筛选"
								hideLabel
								resource="Agent"
								placeholder="全部 Agent"
								value={usage.agentSlug}
								onChange={usage.setAgent}
								defaultOption={{ id: "", name: "全部 Agent" }}
								emptyText="该成员暂无体验会话"
								refreshOnOpen={false}
								remote={{
									data: usage.agents.map((agent) => ({
										id: agent.slug,
										name: agent.display_name ?? agent.slug,
										tag: agent.deleted ? <Tag>已删除</Tag> : undefined,
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
								会话 {summary.session_count}（已删除 {summary.deleted_session_count}） ·{" "}
								{refreshing ? "正在采集" : "已处理"} {summary.completed_sessions} / {summary.session_count} · 最近采集{" "}
								{captureTime(summary.refreshed_at)}
							</span>
						</>
					) : null}
				</div>
				{usage.error && (
					<Result status="error" title={usage.error} extra={<Button onClick={usage.retry}>重试</Button>} />
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
						description={
							usage.agentSlug ? "该成员在此 Agent 下还没有会话。" : "该成员开始使用体验页后，将在这里统计会话用量。"
						}
					/>
				)
			)}
		</section>
	);
}
