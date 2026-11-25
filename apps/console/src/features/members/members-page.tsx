import type { AdminMemberView, MemberView } from "@openagentkit/sdk/protocol";
import type { TableColumnsType } from "antd";
import { Button, Empty, Input, Result, Spin, Table, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createAdminClient } from "../../lib/admin/index.ts";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { adminRequest } from "../../lib/kit.ts";
import { useConsoleRoute } from "../navigation/console-router.tsx";
import { CreateMemberPage } from "./create-member-page.tsx";
import { MemberOidcBindingDialog } from "./member-oidc-binding-dialog.tsx";
import { MemberUsageRoute } from "./member-usage-route.tsx";
import styles from "./members.module.less";
import { UsageCollectionStatus } from "./usage-collection-status.tsx";
import { usageValue } from "./usage-metrics.tsx";
import { useMembers } from "./use-members.ts";

function MembersContent({
	members,
	onCreate,
	onUsage,
	onBinding,
	canWrite,
}: {
	members: ReturnType<typeof useMembers>;
	onCreate: () => void;
	onUsage: (member: MemberView) => void;
	onBinding?: (member: MemberView) => void;
	canWrite: boolean;
}) {
	const { t } = useTranslation("members");
	const { t: tc } = useTranslation();
	const columns: TableColumnsType<AdminMemberView> = [
		{
			title: t("columns.displayName"),
			dataIndex: "display_name",
			width: 140,
			fixed: "left",
			render: (value: string) => <span className={styles.nameText}>{value}</span>,
		},
		{
			title: t("columns.username"),
			dataIndex: "username",
			width: 130,
			render: (value: string) => <span className={styles.monoText}>{value}</span>,
		},
		{
			title: t("columns.email"),
			dataIndex: "email",
			width: 170,
			render: (value: string | undefined) => <span className={styles.mutedText}>{value ?? "—"}</span>,
		},
		{ title: t("columns.authMethod"), width: 90, render: () => t("columns.authLocal") },
		{ title: t("columns.accountStatus"), width: 90, render: () => <Tag color="success">{t("columns.enabled")}</Tag> },
		{
			title: t("columns.sessionCount"),
			width: 90,
			render: (_, member) => (
				<span className={styles.tabularNum}>{member.usage_summary?.session_count ?? tc("collection.pending")}</span>
			),
		},
		{
			title: t("columns.inputTokens"),
			width: 110,
			render: (_, member) => (
				<span className={styles.tabularNum}>{usageValue(member.usage_summary, "input_tokens", tc)}</span>
			),
		},
		{
			title: t("columns.outputTokens"),
			width: 110,
			render: (_, member) => (
				<span className={styles.tabularNum}>{usageValue(member.usage_summary, "output_tokens", tc)}</span>
			),
		},
		{
			title: t("columns.collection"),
			width: 200,
			render: (_, member) => <UsageCollectionStatus summary={member.usage_summary} />,
		},
		{
			title: t("columns.createdAt"),
			width: 170,
			render: (_, member) => (
				<span className={styles.nowrapMuted}>
					<time dateTime={member.created_at}>
						{new Date(member.created_at).toLocaleString("zh-CN", { hour12: false })}
					</time>
				</span>
			),
		},
		{
			title: t("columns.memberId"),
			width: 230,
			render: (_, member) => (
				<Typography.Text copyable={{ text: member.member_id }} className={styles.monoSmall}>
					{member.member_id}
				</Typography.Text>
			),
		},
		{
			title: t("columns.actions"),
			width: onBinding ? 188 : 100,
			fixed: "right",
			render: (_, member) => (
				<>
					<Button type="link" size="small" onClick={() => onUsage(member)}>
						{t("columns.viewUsage")}
					</Button>
					{onBinding && (
						<Button type="link" size="small" onClick={() => onBinding(member)}>
							{t("columns.oidcBinding")}
						</Button>
					)}
				</>
			),
		},
	];
	if (members.error)
		return (
			<Result
				status="error"
				title={t("list.loadFailed")}
				subTitle={members.error}
				extra={<Button onClick={members.refresh}>{t("list.retry")}</Button>}
			/>
		);
	return (
		<Table
			rowKey="member_id"
			columns={columns}
			dataSource={members.rows}
			loading={members.loading}
			pagination={false}
			scroll={{ x: "max-content" }}
			sticky
			size="middle"
			locale={{
				emptyText: (
					<div className={styles.emptyWrap}>
						<Empty
							image={Empty.PRESENTED_IMAGE_SIMPLE}
							description={
								<div>
									<p>{members.search ? t("list.emptySearch") : t("list.emptyDefault")}</p>
									<p className={styles.emptyHint}>{members.search ? t("list.searchHint") : t("list.createHint")}</p>
								</div>
							}
						/>
						{!members.search && canWrite && (
							<Button type="primary" onClick={onCreate}>
								{t("list.createUser")}
							</Button>
						)}
					</div>
				),
			}}
		/>
	);
}

function MembersList({
	onCreate,
	onUsage,
	onBinding,
	canWrite,
}: {
	onCreate: () => void;
	onUsage: (member: MemberView) => void;
	onBinding?: (member: MemberView) => void;
	canWrite: boolean;
}) {
	const { t } = useTranslation("members");
	const members = useMembers();
	const [search, setSearch] = useState("");
	return (
		<div className={styles.stack}>
			<div className={styles.controlsRow}>
				<form
					className={styles.searchForm}
					onSubmit={(event) => {
						event.preventDefault();
						members.searchFor(search);
					}}
				>
					<Input
						aria-label={t("list.searchAria")}
						placeholder={t("list.searchAria")}
						maxLength={254}
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						className={styles.searchInput}
					/>
					<Button htmlType="submit" className={styles.searchSubmit}>
						{t("list.search")}
					</Button>
				</form>
				<Button disabled={members.loading} onClick={members.refresh}>
					{t("list.refresh")}
				</Button>
			</div>
			<MembersContent
				members={members}
				onCreate={onCreate}
				onUsage={onUsage}
				onBinding={onBinding}
				canWrite={canWrite}
			/>
			{!members.error && (members.page > 1 || members.hasNext) && (
				<nav aria-label={t("list.pagerAria")} className={styles.pager}>
					<Button size="small" disabled={members.loading || members.page === 1} onClick={members.previous}>
						{t("list.prev")}
					</Button>
					<span>{t("list.pageOf", { page: members.page })}</span>
					<Button size="small" disabled={members.loading || !members.hasNext} onClick={members.next}>
						{t("list.next")}
					</Button>
				</nav>
			)}
		</div>
	);
}

function IdentityPending({ error, role, onRetry }: { error: string | null; role?: string; onRetry: () => void }) {
	const { t } = useTranslation("members");
	if (error)
		return (
			<Result
				status="error"
				title={t("identity.failed")}
				subTitle={error}
				extra={<Button onClick={onRetry}>{t("list.retry")}</Button>}
			/>
		);
	if (role === "auditor") return <p>{t("identity.auditorReadonly")}</p>;
	return (
		<div className={styles.pendingRow}>
			<Spin size="small" />
			{t("identity.pending")}
		</div>
	);
}

export function MembersPage({
	onPendingChange,
	oidcIssuer,
	passwordLogin,
}: {
	onPendingChange: (pending: boolean) => void;
	oidcIssuer?: string;
	passwordLogin: boolean;
}) {
	const [bindingMember, setBindingMember] = useState<MemberView | null>(null);
	const { t } = useTranslation("members");
	const { route, navigate } = useConsoleRoute();
	const creating = route.page === "member-create";
	const client = useMemo(() => createAdminClient({ request: adminRequest() }), []);
	const identity = useAdminQuery("members:identity", (signal) => client.identity(signal));
	const canWrite = identity.data?.role === "admin";
	if (route.page === "member-usage" && route.id) return <MemberUsageRoute key={route.id} id={route.id} />;
	if (creating) {
		if (canWrite)
			return (
				<CreateMemberPage
					passwordLogin={passwordLogin}
					onBack={() => navigate({ page: "members" })}
					onPendingChange={onPendingChange}
				/>
			);
		return (
			<section className={styles.stack}>
				<Button onClick={() => navigate({ page: "members" })}>{t("identity.backToMembers")}</Button>
				<IdentityPending error={identity.error} role={identity.data?.role} onRetry={() => void identity.refresh()} />
			</section>
		);
	}
	return (
		<section aria-labelledby="members-heading" className={styles.stack}>
			<header className={styles.pageHeader}>
				<div>
					<h2 id="members-heading" className={styles.pageTitle}>
						{t("page.title")}
					</h2>
					<p className={styles.pageSub}>{t(passwordLogin ? "page.sub" : "page.subOidc")}</p>
				</div>
				{canWrite && (
					<Button type="primary" onClick={() => navigate({ page: "member-create" })}>
						{t("list.createUser")}
					</Button>
				)}
			</header>
			{identity.error && (
				<Result
					status="error"
					title={t("identity.failed")}
					subTitle={identity.error}
					extra={<Button onClick={() => void identity.refresh()}>{t("list.retry")}</Button>}
				/>
			)}
			{identity.data?.role === "auditor" && <p className={styles.mutedNote}>{t("identity.auditorNote")}</p>}
			<MembersList
				onCreate={() => navigate({ page: "member-create" })}
				onUsage={(member) => navigate({ page: "member-usage", id: member.member_id })}
				onBinding={oidcIssuer && identity.data ? setBindingMember : undefined}
				canWrite={canWrite}
			/>
			{bindingMember && oidcIssuer && (
				<MemberOidcBindingDialog
					key={bindingMember.member_id}
					member={bindingMember}
					client={client}
					issuer={oidcIssuer}
					canWrite={canWrite}
					onClose={() => setBindingMember(null)}
					onPendingChange={onPendingChange}
				/>
			)}
		</section>
	);
}
