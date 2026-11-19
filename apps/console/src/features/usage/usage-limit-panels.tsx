import type { UsageLimitDayState, UsageLimitMetricState } from "@openagentkit/sdk/protocol";
import { Button, Result } from "antd";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type AdminClient, createAdminClient } from "../../lib/admin/index.ts";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { adminRequest } from "../../lib/kit.ts";
import styles from "./usage.module.less";
import {
	formatLimit,
	type LimitPeriod,
	LimitPeriodTabs,
	limitsDescription,
	UsageLimitEditor,
} from "./usage-limit-editor.tsx";

export function useUsageLimitAccess() {
	const client = useMemo(() => createAdminClient({ request: adminRequest() }), []);
	const identity = useAdminQuery("usage-limits:identity", (signal) => client.identity(signal));
	return { client, identity, canWrite: identity.data?.role === "admin" };
}

function timeText(value: string | undefined, t: TFunction<"usage">) {
	return value ? new Date(value).toLocaleString("zh-CN", { timeZone: "UTC", hour12: false }) : t("panels.notUpdated");
}

function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
	const { t } = useTranslation("usage");
	return (
		<Result
			status="error"
			title={error}
			extra={
				<Button size="small" onClick={onRetry}>
					{t("panels.retry")}
				</Button>
			}
		/>
	);
}

export function DefaultUsageLimits({ client, canWrite }: { client: AdminClient; canWrite: boolean }) {
	const { t } = useTranslation("usage");
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState(false);
	const policy = useAdminQuery("usage-limits:policy", (signal) => client.usageLimits.policy(signal), { enabled: open });
	return (
		<div className={styles.stack}>
			<Button
				aria-expanded={open}
				onClick={() => {
					setOpen(!open);
					setEditing(false);
				}}
			>
				{t("panels.toggle")}
			</Button>
			{open && (
				<section aria-label={t("panels.defaultSectionAria")} className={styles.limitPanel}>
					<header className={styles.limitHeader}>
						<h3 className={styles.limitTitle}>{t("panels.defaultTitle")}</h3>
						{canWrite && policy.data && !editing && (
							<Button size="small" onClick={() => setEditing(true)}>
								{t("panels.setDefault")}
							</Button>
						)}
					</header>
					<p className={styles.metaText}>{t("panels.defaultHint", { notice: t("limitNotice") })}</p>
					{policy.loading && !policy.data && <p role="status">{t("panels.loadingDefault")}</p>}
					{policy.error && <LoadError error={policy.error} onRetry={() => void policy.refresh()} />}
					{policy.data && (
						<>
							<p className={styles.preLine}>{limitsDescription(policy.data.limits, t)}</p>
							<p className={styles.metaText}>{t("panels.lastSet", { time: timeText(policy.data.updated_at, t) })}</p>
							{editing && canWrite && (
								<UsageLimitEditor
									title={t("editor.defaultTitle")}
									initial={policy.data.limits}
									onSave={async (limits) => {
										await client.usageLimits.setPolicy(limits);
										await policy.refresh();
									}}
									onClose={() => setEditing(false)}
								/>
							)}
						</>
					)}
					{!canWrite && <p className={styles.metaText}>{t("panels.readOnly")}</p>}
				</section>
			)}
		</div>
	);
}

const statusLabels: Record<
	UsageLimitMetricState["status"],
	"balance.status.ok" | "balance.status.exceeded" | "balance.status.unavailable"
> = {
	ok: "balance.status.ok",
	exceeded: "balance.status.exceeded",
	unavailable: "balance.status.unavailable",
};

// styles 取值为 string | undefined（noUncheckedIndexedAccess），故不加 Record<string> 注解；
// 键与 statusLabels 一一对应，值必然存在。
const statusClass = {
	ok: styles.statusOk,
	exceeded: styles.statusExceeded,
	unavailable: styles.statusUnavailable,
};

/** 日维度未设置时的跟随文案：月维度已设置 → 跟随月度，两者都未设置 → 不限量；undefined = 按日数值正常展示。 */
function dayFallbackText(
	dayLimit: number | null,
	monthLimit: number | null,
	unit: string,
	t: TFunction<"usage">,
): string | undefined {
	if (dayLimit !== null) return undefined;
	return monthLimit === null ? t("unlimited") : t("balance.followMonth", { amount: formatLimit(monthLimit, unit, t) });
}

function MetricBalance({
	title,
	metric,
	unit,
	limitText,
	remainingText,
}: {
	title: string;
	metric: UsageLimitMetricState;
	unit: string;
	/** 日维度跟随月度时的覆盖文案（仅日周期传入）；缺省按 metric 自身展示。 */
	limitText?: string;
	remainingText?: string;
}) {
	const { t } = useTranslation("usage");
	return (
		<div className={styles.balanceCard}>
			<h4 className={styles.balanceTitle}>{title}</h4>
			<dl className={styles.balanceGrid}>
				<dt className={styles.balanceLabel}>{t("balance.used")}</dt>
				<dd>{metric.used === null ? t("balance.pendingConfirm") : formatLimit(metric.used, unit, t)}</dd>
				<dt className={styles.balanceLabel}>{t("balance.limit")}</dt>
				<dd>{limitText ?? (metric.limit === null ? t("unlimited") : formatLimit(metric.limit, unit, t))}</dd>
				<dt className={styles.balanceLabel}>{t("balance.remaining")}</dt>
				<dd>
					{remainingText ??
						(metric.limit === null
							? t("unlimited")
							: metric.remaining === null
								? t("balance.pendingConfirm")
								: formatLimit(metric.remaining, unit, t))}
				</dd>
			</dl>
			<p role="status" className={`${styles.statusNote} ${statusClass[metric.status]}`}>
				{t(statusLabels[metric.status])}
			</p>
		</div>
	);
}

/** 周期切换 + 当前周期（当月/今日）已用与上限展示；成员与模版视图字段同构，共用一份。 */
function PeriodUsageStatus({
	period,
	onChange,
	view,
	scopeLabel,
}: {
	period: LimitPeriod;
	onChange: (period: LimitPeriod) => void;
	view: {
		month: string;
		reset_at: string;
		tokens: UsageLimitMetricState;
		active_seconds: UsageLimitMetricState;
		day_state: UsageLimitDayState;
	};
	scopeLabel: string;
}) {
	const { t } = useTranslation("usage");
	const active =
		period === "month"
			? { key: view.month, resetAt: view.reset_at, tokens: view.tokens, seconds: view.active_seconds }
			: {
					key: view.day_state.day,
					resetAt: view.day_state.reset_at,
					tokens: view.day_state.tokens,
					seconds: view.day_state.active_seconds,
				};
	return (
		<>
			<div className={styles.scopeRow}>
				<p className={styles.scopeMeta}>
					{t("periodStatus.meta", {
						key: active.key,
						period: period === "month" ? t("period.monthShort") : t("period.dayShort"),
						scope: scopeLabel,
						reset: timeText(active.resetAt, t),
					})}
				</p>
				<LimitPeriodTabs period={period} onChange={onChange} />
			</div>
			<div className={styles.balanceColumns}>
				<MetricBalance
					title={period === "month" ? t("periodStatus.tokensMonth") : t("periodStatus.tokensDay")}
					metric={active.tokens}
					unit="Token"
					limitText={
						period === "day" ? dayFallbackText(view.day_state.tokens.limit, view.tokens.limit, "Token", t) : undefined
					}
					remainingText={
						period === "day" ? dayFallbackText(view.day_state.tokens.limit, view.tokens.limit, "Token", t) : undefined
					}
				/>
				<MetricBalance
					title={period === "month" ? t("periodStatus.secondsMonth") : t("periodStatus.secondsDay")}
					metric={active.seconds}
					unit={t("unitSeconds")}
					limitText={
						period === "day"
							? dayFallbackText(view.day_state.active_seconds.limit, view.active_seconds.limit, t("unitSeconds"), t)
							: undefined
					}
					remainingText={
						period === "day"
							? dayFallbackText(view.day_state.active_seconds.limit, view.active_seconds.limit, t("unitSeconds"), t)
							: undefined
					}
				/>
			</div>
		</>
	);
}

/** 月度/日度限额统计与累计 Session 快照分别展示，不受 Agent 明细筛选影响。 */
export function MemberUsageLimits({
	memberId,
	initiallyEditing = false,
}: {
	memberId: string;
	initiallyEditing?: boolean;
}) {
	const { t } = useTranslation("usage");
	const { client, identity, canWrite } = useUsageLimitAccess();
	const [editing, setEditing] = useState(initiallyEditing);
	const [period, setPeriod] = useState<LimitPeriod>("month");
	const canRead = identity.data?.role === "admin" || identity.data?.role === "auditor";
	const view = useAdminQuery(
		`usage-limits:member:${memberId}`,
		(signal) => client.members.usageLimit(memberId, signal),
		{
			enabled: canRead,
		},
	);
	const policy = useAdminQuery("usage-limits:member-defaults", (signal) => client.usageLimits.policy(signal), {
		enabled: editing && canWrite,
	});
	const current = view.data;
	return (
		<section aria-label={t("panels.memberSectionAria")} className={styles.limitPanel}>
			<header className={styles.limitHeader}>
				<h3 className={styles.limitTitle}>{t("panels.limitTitle")}</h3>
				<div className={styles.limitActions}>
					<Button
						size="small"
						loading={view.loading && !current}
						disabled={!canRead || editing}
						onClick={() => void view.refresh()}
					>
						{t("panels.refresh")}
					</Button>
					{canWrite && current && !editing && (
						<Button size="small" onClick={() => setEditing(true)}>
							{t("panels.setLimit")}
						</Button>
					)}
				</div>
			</header>
			<p className={styles.metaText}>{t("limitNotice")}</p>
			{(identity.loading || view.loading) && !current && <p role="status">{t("panels.loading")}</p>}
			{identity.error && <LoadError error={identity.error} onRetry={() => void identity.refresh()} />}
			{view.error && <LoadError error={view.error} onRetry={() => void view.refresh()} />}
			{current && (
				<>
					<PeriodUsageStatus
						period={period}
						onChange={setPeriod}
						view={current}
						scopeLabel={current.override ? t("panels.scopePersonal") : t("panels.scopeFollowDefault")}
					/>
					<p className={styles.metaText}>
						{t("panels.memberMeta", {
							started: timeText(current.accounting_started_at, t),
							updated: timeText(current.refreshed_at, t),
						})}
					</p>
					{editing && canWrite && (
						<>
							{policy.error && (
								<LoadError
									error={t("panels.policyLoadFailed", { error: policy.error })}
									onRetry={() => void policy.refresh()}
								/>
							)}
							<UsageLimitEditor
								title={t("editor.memberTitle")}
								initial={current.limits}
								defaults={policy.data?.limits}
								canReset={current.override !== null}
								onSave={async (limits) => {
									await client.members.setUsageLimit(memberId, limits);
									await view.refresh();
								}}
								onReset={async () => {
									await client.members.resetUsageLimit(memberId);
									await view.refresh();
								}}
								onClose={() => setEditing(false)}
							/>
						</>
					)}
				</>
			)}
			{identity.data?.role === "auditor" && <p className={styles.metaText}>{t("panels.readOnly")}</p>}
		</section>
	);
}

/** 模版限额：只统计从该模版上架条目发起的会话；未设置覆盖时不限量。 */
export function TemplateUsageLimits({
	templateId,
	initiallyEditing = false,
}: {
	templateId: string;
	initiallyEditing?: boolean;
}) {
	const { t } = useTranslation("usage");
	const { client, identity, canWrite } = useUsageLimitAccess();
	const [editing, setEditing] = useState(initiallyEditing);
	const [period, setPeriod] = useState<LimitPeriod>("month");
	const canRead = identity.data?.role === "admin" || identity.data?.role === "auditor";
	const view = useAdminQuery(
		`usage-limits:template:${templateId}`,
		(signal) => client.usage.templateLimit(templateId, signal),
		{
			enabled: canRead,
		},
	);
	const current = view.data;
	return (
		<section aria-label={t("panels.templateSectionAria")} className={styles.limitPanel}>
			<header className={styles.limitHeader}>
				<h3 className={styles.limitTitle}>{t("panels.limitTitle")}</h3>
				<div className={styles.limitActions}>
					<Button
						size="small"
						loading={view.loading && !current}
						disabled={!canRead || editing}
						onClick={() => void view.refresh()}
					>
						{t("panels.refresh")}
					</Button>
					{canWrite && current && !editing && (
						<Button size="small" onClick={() => setEditing(true)}>
							{t("panels.setLimit")}
						</Button>
					)}
				</div>
			</header>
			<p className={styles.metaText}>{t("panels.templateHint", { notice: t("limitNotice") })}</p>
			{(identity.loading || view.loading) && !current && <p role="status">{t("panels.loading")}</p>}
			{identity.error && <LoadError error={identity.error} onRetry={() => void identity.refresh()} />}
			{view.error && <LoadError error={view.error} onRetry={() => void view.refresh()} />}
			{current && (
				<>
					<PeriodUsageStatus
						period={period}
						onChange={setPeriod}
						view={current}
						scopeLabel={current.override ? t("panels.scopeTemplate") : t("panels.scopeUnset")}
					/>
					{editing && canWrite && (
						<UsageLimitEditor
							title={t("editor.templateTitle")}
							initial={current.limits}
							canReset={current.override !== null}
							onSave={async (limits) => {
								await client.usage.setTemplateLimit(templateId, limits);
								await view.refresh();
							}}
							onReset={
								current.override
									? async () => {
											await client.usage.resetTemplateLimit(templateId);
											await view.refresh();
										}
									: undefined
							}
							onClose={() => setEditing(false)}
						/>
					)}
				</>
			)}
			{identity.data?.role === "auditor" && <p className={styles.metaText}>{t("panels.readOnly")}</p>}
		</section>
	);
}
