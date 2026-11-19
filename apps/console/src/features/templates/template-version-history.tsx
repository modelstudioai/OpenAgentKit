import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui";
import type { TemplateVersionSummary } from "@openagentpack/kit-sdk/protocol";
import { type ReactNode, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import { ghostButtonClass } from "../../lib/styles.ts";
import { plazaCategoryLabel } from "../catalog/plaza-categories.ts";
import styles from "./template-resources.module.less";

const PAGE_SIZE = 20;

function useTemplateVersions(templateId: string) {
	const client = useMemo(getAdminClient, []);
	const [cursors, setCursors] = useState([""]);
	const cursor = cursors.at(-1) || undefined;
	const versions = useAdminQuery(`templates:versions:${templateId}:${cursor ?? ""}`, (signal) =>
		client.templates.versions(templateId, { limit: PAGE_SIZE, page_token: cursor }, signal),
	);
	const loading = versions.loading || (!versions.data && !versions.error);
	const rows = !loading && !versions.error ? (versions.data?.data ?? []) : [];
	const nextCursor = !versions.error ? versions.data?.next_page_token : undefined;
	return { versions, cursors, setCursors, loading, rows, nextCursor };
}

export function TemplateVersionHistory({
	templateId,
	selectedVersion,
	onSelect,
}: {
	templateId: string;
	selectedVersion?: number;
	onSelect: (version: number) => void;
}) {
	const { t } = useTranslation("templates");
	const { versions, cursors, setCursors, loading, rows, nextCursor } = useTemplateVersions(templateId);
	return (
		<section aria-label={t("history.aria")} className={styles.historyRoot}>
			<h3 className={styles.listHeading}>{t("history.title")}</h3>
			{loading ? <EmptyState loading title={t("history.loading")} /> : null}
			{versions.error ? <ErrorState message={versions.error} onRetry={() => void versions.refresh()} /> : null}
			{!loading && !versions.error && rows.length === 0 ? <EmptyState title={t("history.empty")} /> : null}
			{rows.length ? (
				<ol aria-label={t("history.timelineAria")} className={styles.shrinkRoot}>
					{rows.map((version) => (
						<VersionRow
							key={version.version}
							version={version}
							current={version.version === versions.data?.current_version}
							selected={version.version === selectedVersion}
							onSelect={() => onSelect(version.version)}
						/>
					))}
				</ol>
			) : null}
			{cursors.length > 1 || nextCursor ? (
				<nav aria-label={t("history.pagerAria")} className={styles.pagerEnd}>
					<button
						type="button"
						className={ghostButtonClass}
						disabled={loading || cursors.length === 1}
						onClick={() => setCursors((current) => current.slice(0, -1))}
					>
						{t("history.previous")}
					</button>
					<span>{t("history.page", { page: cursors.length })}</span>
					<button
						type="button"
						className={ghostButtonClass}
						disabled={loading || !nextCursor}
						onClick={() => {
							if (nextCursor) setCursors((current) => [...current, nextCursor]);
						}}
					>
						{t("history.next")}
					</button>
				</nav>
			) : null}
		</section>
	);
}

function VersionRow({
	version,
	current,
	selected,
	onSelect,
}: {
	version: TemplateVersionSummary;
	current: boolean;
	selected: boolean;
	onSelect: () => void;
}) {
	const { t } = useTranslation("templates");
	const summaryId = useId();
	return (
		<li className={styles.timelineRow}>
			<span aria-hidden="true" className={`${styles.timelineLine} ${styles.timelineLineKit}`} />
			<span
				aria-hidden="true"
				className={
					selected
						? `${styles.timelineDot} ${styles.timelineDotKitOn}`
						: `${styles.timelineDot} ${styles.timelineDotKit}`
				}
			/>
			<button
				type="button"
				aria-label={t("history.viewAria", { version: version.version })}
				aria-describedby={summaryId}
				aria-pressed={selected}
				className={selected ? `${styles.versionRowCard} ${styles.versionRowSelected}` : styles.versionRowCard}
				onClick={onSelect}
			>
				<span className={styles.headRow}>
					<span className={styles.versionLabel}>v{version.version}</span>
					{current ? <span className={styles.currentBadge}>{t("history.current")}</span> : null}
				</span>
				<span className={styles.blockNameAny}>{version.name}</span>
				<span className={styles.blockCaptionAny}>
					{t("history.savedAt")}
					<VersionTime value={version.created_at} />
				</span>
				<span id={summaryId} className={styles.summaryBlock}>
					<VersionConfigurationSummary version={version} />
				</span>
			</button>
		</li>
	);
}

function SummaryPoint({ children }: { children: ReactNode }) {
	return (
		<span className={styles.summaryPoint}>
			<span aria-hidden="true" className={styles.shrinkZero}>
				•
			</span>
			<span className={`${styles.shrinkRoot} ${styles.wrapAnywhere}`}>{children}</span>
		</span>
	);
}

function VersionConfigurationSummary({ version }: { version: TemplateVersionSummary }) {
	const { t } = useTranslation("templates");
	const { t: tc } = useTranslation("catalog");
	const agentVersion =
		version.agent_version !== undefined
			? t("history.agentVersion", { version: version.agent_version })
			: version.remote_agent_version !== undefined
				? t("history.agentVersion", { version: version.remote_agent_version })
				: t("history.agentVersionMissing");
	return (
		<>
			<span className={styles.summaryGroup}>
				<span className={styles.blockMedium}>{t("history.agent")}</span>
				<SummaryPoint>
					{version.remote_agent_name || version.remote_agent_id}
					{t("agent.form.parenOpen")}
					{agentVersion}
					{t("agent.form.parenClose")}
				</SummaryPoint>
			</span>
			<span className={styles.summaryGroup}>
				<span className={styles.blockMedium}>{t("history.runtime")}</span>
				<SummaryPoint>
					{t("history.environment")}
					{version.remote_environment_id
						? version.remote_environment_name || version.remote_environment_id
						: t("history.defaultEnvironment")}
				</SummaryPoint>
				<SummaryPoint>
					{t("history.files")}
					{version.files.map((file) => file.filename || file.file_id).join(t("history.separator")) ||
						t("history.notSelected")}
				</SummaryPoint>
				<SummaryPoint>
					{t("history.memories")}
					{version.memory_stores
						.map((memory) =>
							t("history.memoryAccess", {
								id: memory.memory_store_id,
								access: memory.access === "read_only" ? t("history.readOnly") : t("history.readWrite"),
							}),
						)
						.join(t("history.separator")) || t("history.notSelected")}
				</SummaryPoint>
				<SummaryPoint>
					{t("history.vaults")}
					{version.vault_ids.join(t("history.separator")) || t("history.notSelected")}
				</SummaryPoint>
			</span>
			<span className={styles.summaryGroup}>
				<span className={styles.blockMedium}>{t("history.presentation")}</span>
				<SummaryPoint>
					{t("history.category")}
					{plazaCategoryLabel(version.category, tc)}
				</SummaryPoint>
			</span>
		</>
	);
}

function VersionTime({ value }: { value: string }) {
	return <time dateTime={value}>{new Date(value).toLocaleString("zh-CN", { hour12: false })}</time>;
}
