import type { MemberView, TemplateUsageRow } from "@openagentpack/kit-sdk/protocol";
import type { TableColumnsType } from "antd";
import { Button, Empty, Input, Result, Segmented, Spin, Table } from "antd";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import { RemoteResourcePicker } from "../catalog/remote-resource-picker.tsx";
import { MemberUsageRoute } from "../members/member-usage-route.tsx";
import { UsageCollectionStatus } from "../members/usage-collection-status.tsx";
import { usageMetrics, usageValue } from "../members/usage-metrics.tsx";
import { useMembers } from "../members/use-members.ts";
import { useConsoleRoute } from "../navigation/console-router.tsx";
import { TemplateUsageDetail, TemplateUsagePanel } from "./template-usage-panel.tsx";
import styles from "./usage.module.less";
import { DefaultUsageLimits, useUsageLimitAccess } from "./usage-limit-panels.tsx";

type UsageTab = "members" | "templates";

function usageColumns(
	onSelect: (member: MemberView) => void,
	onLimits: ((member: MemberView) => void) | undefined,
	t: TFunction<["usage", "common"]>,
	tc: TFunction<"common">,
) {
	return [
		{
			title: t("sessionPage.colMember"),
			dataIndex: "member_id",
			fixed: "left",
			render: (_, row: MemberView) => (
				<div>
					<span className={styles.memberName}>{row.display_name}</span>{" "}
					<span className={styles.cellMeta}>{row.username}</span>
				</div>
			),
		},
		{
			title: t("sessionPage.colSessionCount"),
			align: "right" as const,
			render: (_, row: MemberView) => {
				const summary = row.usage_summary;
				return (
					<div>
						<span className={styles.tabularNum}>{summary?.session_count ?? tc("collection.pending")}</span>
						{summary && (
							<span className={styles.cellSub}>
								{t("sessionPage.deletedSub", { count: summary.deleted_session_count })}
							</span>
						)}
					</div>
				);
			},
		},
		...usageMetrics.map(([key, labelKey]) => ({
			title: tc(labelKey),
			align: "right" as const,
			render: (_: unknown, row: MemberView) => {
				const summary = row.usage_summary;
				return (
					<div>
						<span className={styles.tabularNum}>{usageValue(summary, key, tc)}</span>
						{summary && (
							<span className={styles.cellSub}>
								{tc("collection.coverage", {
									covered: summary.metrics[key].covered_sessions,
									total: summary.session_count,
								})}
							</span>
						)}
					</div>
				);
			},
		})),
		{
			title: t("sessionPage.colCollection"),
			render: (_, row: MemberView) => <UsageCollectionStatus summary={row.usage_summary} />,
		},
		{
			title: t("sessionPage.colActions"),
			fixed: "right",
			render: (_, row: MemberView) => (
				<div className={styles.rowActions}>
					<Button type="link" size="small" onClick={() => onSelect(row)}>
						{t("sessionPage.sessionDetail")}
					</Button>
					{onLimits && (
						<Button type="link" size="small" onClick={() => onLimits(row)}>
							{t("panels.setLimit")}
						</Button>
					)}
				</div>
			),
		},
	] satisfies TableColumnsType<MemberView>;
}

function SessionUsageTable({
	rows,
	onSelect,
	onLimits,
}: {
	rows: MemberView[];
	onSelect: (member: MemberView) => void;
	onLimits?: (member: MemberView) => void;
}) {
	const { t } = useTranslation(["usage", "common"]);
	const { t: tc } = useTranslation();
	return (
		<Table
			rowKey="member_id"
			size="middle"
			columns={usageColumns(onSelect, onLimits, t, tc)}
			dataSource={rows}
			pagination={false}
			scroll={{ x: "max-content" }}
			sticky
		/>
	);
}

function SessionUsageContent({
	members,
	onSelect,
	onLimits,
}: {
	members: ReturnType<typeof useMembers>;
	onSelect: (member: MemberView) => void;
	onLimits?: (member: MemberView) => void;
}) {
	const { t } = useTranslation("usage");
	if (members.loading) {
		return (
			<div className={styles.loadingRow}>
				<Spin />
			</div>
		);
	}
	if (members.error) {
		return (
			<Result
				status="error"
				title={members.error}
				extra={
					<Button
						size="small"
						onClick={() => {
							members.reload();
						}}
					>
						{t("sessionPage.retry")}
					</Button>
				}
			/>
		);
	}
	if (members.rows.length) return <SessionUsageTable rows={members.rows} onSelect={onSelect} onLimits={onLimits} />;
	return (
		<Empty
			image={Empty.PRESENTED_IMAGE_SIMPLE}
			description={
				members.search ? (
					<span>
						{t("sessionPage.emptySearch")}
						<br />
						<span className={styles.cellMeta}>{t("sessionPage.searchHint")}</span>
					</span>
				) : (
					t("sessionPage.emptyDefault")
				)
			}
		/>
	);
}

/** 复用成员累计快照；成员分页不改变每位成员的全量 Session 汇总。 */
function MembersTabSection({
	members,
	onSelect,
	onLimits,
}: {
	members: ReturnType<typeof useMembers>;
	onSelect: (member: MemberView) => void;
	onLimits?: (member: MemberView) => void;
}) {
	const { t } = useTranslation(["usage", "members"]);
	return (
		<>
			<p className={styles.cellMeta} style={{ marginTop: "10px" }}>
				{t("sessionPage.note")}
			</p>
			<SessionUsageContent members={members} onSelect={onSelect} onLimits={onLimits} />
			{!members.error && (members.page > 1 || members.hasNext) && (
				<nav aria-label={t("sessionPage.pagerAria")} className={styles.pager}>
					<Button size="small" disabled={members.loading || members.page === 1} onClick={members.previous}>
						{t("members:list.prev")}
					</Button>
					<span>{t("members:list.pageOf", { page: members.page })}</span>
					<Button size="small" disabled={members.loading || !members.hasNext} onClick={members.next}>
						{t("members:list.next")}
					</Button>
				</nav>
			)}
		</>
	);
}

/** 成员 tab 的文本搜索表单；提交后由 useMembers 发起服务端过滤。 */
function MembersSearchForm({
	value,
	onChange,
	onSubmit,
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
}) {
	const { t } = useTranslation("usage");
	return (
		<form
			className={styles.searchForm}
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<Input
				aria-label={t("sessionPage.searchPlaceholder")}
				placeholder={t("sessionPage.searchPlaceholder")}
				maxLength={254}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className={styles.searchInput}
			/>
			<Button htmlType="submit" className={styles.searchSubmit}>
				{t("sessionPage.search")}
			</Button>
		</form>
	);
}

/** 模版 tab 的可搜索下拉：默认「全部」（空 id，聚合全量模版），选中项驱动下方卡片与模型/工具用量明细区。 */
function TemplatePicker({
	value,
	onChange,
	templatesList,
}: {
	value: string;
	onChange: (templateId: string) => void;
	templatesList: ReturnType<typeof useAdminQuery<TemplateUsageRow[]>>;
}) {
	const { t } = useTranslation("usage");
	const rows = templatesList.data ?? [];
	return (
		<div className={styles.pickerWrap}>
			<RemoteResourcePicker
				value={value}
				onChange={onChange}
				label={t("sessionPage.selectTemplate")}
				resource={t("sessionPage.resourceTemplate")}
				placeholder={t("sessionPage.all")}
				defaultOption={{ id: "", name: t("sessionPage.all") }}
				remote={{
					data: rows.map((row) => ({ id: row.template_id, name: row.name, detail: row.remote_agent_name })),
					loading: templatesList.loading || (!templatesList.data && !templatesList.error),
					error: templatesList.error,
					refresh: templatesList.refresh,
				}}
			/>
		</div>
	);
}

/** 模版用量明细子视图：返回时刷新汇总，行内刷新同步当前行。 */
function TemplateDetailView({
	detail,
	templatesList,
	onClose,
	onRow,
}: {
	detail: { row: TemplateUsageRow; editLimits: boolean };
	templatesList: ReturnType<typeof useAdminQuery<TemplateUsageRow[]>>;
	onClose: () => void;
	onRow: (row: TemplateUsageRow) => void;
}) {
	return (
		<TemplateUsageDetail
			key={detail.row.template_id}
			template={detail.row}
			editLimits={detail.editLimits}
			onBack={() => {
				onClose();
				void templatesList.refresh();
			}}
			onRefresh={async () => {
				const data = await templatesList.refresh();
				const row = (data ?? []).find((item) => item.template_id === detail.row.template_id);
				if (row) onRow(row);
			}}
		/>
	);
}

/** 控件行：按当前视角给成员搜索框或模版选择器，右侧统一刷新按钮。 */
function UsageControls({
	tab,
	members,
	memberSearch,
	onMemberSearch,
	onMemberSearchSubmit,
	templatesList,
	selectedTemplateId,
	onTemplateSelect,
}: {
	tab: UsageTab;
	members: ReturnType<typeof useMembers>;
	memberSearch: string;
	onMemberSearch: (value: string) => void;
	onMemberSearchSubmit: () => void;
	templatesList: ReturnType<typeof useAdminQuery<TemplateUsageRow[]>>;
	selectedTemplateId: string;
	onTemplateSelect: (id: string) => void;
}) {
	const { t } = useTranslation("usage");
	return (
		<div className={styles.controlsRow}>
			{tab === "members" ? (
				<MembersSearchForm value={memberSearch} onChange={onMemberSearch} onSubmit={onMemberSearchSubmit} />
			) : (
				<TemplatePicker value={selectedTemplateId} onChange={onTemplateSelect} templatesList={templatesList} />
			)}
			<Button
				loading={tab === "members" ? members.loading : templatesList.loading}
				onClick={() => (tab === "members" ? members.reload() : void templatesList.refresh())}
			>
				{t("sessionPage.refreshList")}
			</Button>
		</div>
	);
}

/** 限额引导区：成员视角展示全局默认月度限额；模版没有全局默认限额，指路逐模版设置入口。 */
function UsageLimitsArea({ tab, access }: { tab: UsageTab; access: ReturnType<typeof useUsageLimitAccess> }) {
	const { t } = useTranslation("usage");
	if (tab === "templates") return <p className={styles.mutedNote}>{t("sessionPage.templateLimitsHint")}</p>;
	return <DefaultUsageLimits client={access.client} canWrite={access.canWrite} />;
}

/** 复用成员累计快照；成员分页不改变每位成员的全量 Session 汇总。 */
export function SessionUsagePage() {
	const { t } = useTranslation("usage");
	const members = useMembers();
	const access = useUsageLimitAccess();
	const client = useMemo(getAdminClient, []);
	const [memberSearch, setMemberSearch] = useState("");
	const templatesList = useAdminQuery("usage:templates", (signal) => client.usage.templates({}, signal));
	const templateRows = templatesList.data ?? [];
	/** 空串表示「全部」视角（默认）：卡片聚合全量模版；选中项被删除或列表刷新后找不到时回落为「全部」。 */
	const [selectedTemplateId, setSelectedTemplateId] = useState("");
	const selectedTemplate = selectedTemplateId
		? (templateRows.find((row) => row.template_id === selectedTemplateId) ?? null)
		: null;
	const [templateDetail, setTemplateDetail] = useState<{ row: TemplateUsageRow; editLimits: boolean } | null>(null);
	/** 默认选中「模版用量」视角，与 tab 按钮顺序一致。 */
	const [tab, setTab] = useState<UsageTab>("templates");
	// 成员明细走 console 路由（URL 可直达、可带编辑态）；模版明细保持本页内切换。
	const { route, navigate } = useConsoleRoute();
	if (route.page === "member-usage" && route.id)
		return <MemberUsageRoute key={route.id} id={route.id} onReturn={members.reload} />;
	if (templateDetail)
		return (
			<TemplateDetailView
				detail={templateDetail}
				templatesList={templatesList}
				onClose={() => setTemplateDetail(null)}
				onRow={(row) => setTemplateDetail((current) => (current ? { ...current, row } : current))}
			/>
		);
	return (
		<section aria-labelledby="session-usage-heading" className={styles.pageRoot}>
			<header>
				<h2 id="session-usage-heading" className={styles.pageTitle}>
					{t("sessionPage.title")}
				</h2>
				<p className={styles.pageSub}>
					{tab === "templates" ? t("sessionPage.subTemplates") : t("sessionPage.subMembers")}
				</p>
			</header>
			{access.identity.error && (
				<Result
					status="error"
					title={access.identity.error}
					extra={
						<Button
							size="small"
							onClick={() => {
								void access.identity.refresh();
							}}
						>
							{t("sessionPage.retry")}
						</Button>
					}
				/>
			)}
			<UsageLimitsArea tab={tab} access={access} />
			<UsageControls
				tab={tab}
				members={members}
				memberSearch={memberSearch}
				onMemberSearch={setMemberSearch}
				onMemberSearchSubmit={() => members.searchFor(memberSearch)}
				templatesList={templatesList}
				selectedTemplateId={selectedTemplateId}
				onTemplateSelect={setSelectedTemplateId}
			/>
			<Segmented
				aria-label={t("sessionPage.viewAria")}
				className={styles.viewToggle}
				value={tab}
				onChange={(value) => setTab(value as UsageTab)}
				options={[
					{ label: t("sessionPage.tabTemplates"), value: "templates" },
					{ label: t("sessionPage.tabMembers"), value: "members" },
				]}
			/>
			{tab === "templates" ? (
				<TemplateUsagePanel
					rows={selectedTemplate ? [selectedTemplate] : templateRows}
					loading={templatesList.loading || (!templatesList.data && !templatesList.error)}
					error={templatesList.error}
					onRetry={() => {
						void templatesList.refresh();
					}}
					onSelect={(row) => setTemplateDetail({ row, editLimits: false })}
					onLimits={(row) => setTemplateDetail({ row, editLimits: true })}
				/>
			) : (
				<MembersTabSection
					members={members}
					onSelect={(member) => navigate({ page: "member-usage", id: member.member_id, from: "usage" })}
					onLimits={
						access.canWrite
							? (member) => navigate({ page: "member-usage", id: member.member_id, from: "usage", limits: "edit" })
							: undefined
					}
				/>
			)}
		</section>
	);
}
