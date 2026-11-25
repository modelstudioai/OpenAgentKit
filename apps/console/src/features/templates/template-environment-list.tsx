import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui";
import { Input } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRemoteEnvironments } from "../catalog/use-remote-environments.ts";
import { TemplateEnvironmentDetailDrawer } from "./template-environment-detail-drawer.tsx";
import styles from "./template-lists.module.less";
import { type TemplateEnvironmentSelection, useTemplateLocalResources } from "./template-local-resources.tsx";
import { templateResourceCandidates } from "./template-resource-candidates.ts";

function EnvironmentRow({
	environment,
	selected,
	onSelect,
}: {
	environment: TemplateEnvironmentSelection;
	selected: boolean;
	onSelect: (environment: TemplateEnvironmentSelection) => void;
}) {
	const { t } = useTranslation("templates");
	const [open, setOpen] = useState(false);
	const name = environment.name || environment.environment_id;
	return (
		<li className={`${styles.selectRow5} ${selected ? styles.selectRowSelected : styles.selectRowIdle}`}>
			<button
				type="button"
				aria-label={t("agent.environment.list.viewAria", { name, id: environment.environment_id })}
				aria-pressed={selected}
				className={styles.envRowButton}
				onClick={() => setOpen(true)}
			>
				<span className={styles.envRowName}>{name}</span>
				<span className={styles.envRowId}>{environment.local?.id ?? environment.environment_id}</span>
				<span className={styles.envRowAction}>{t("agent.environment.list.viewAction")}</span>
			</button>
			<TemplateEnvironmentDetailDrawer
				environment={environment}
				open={open}
				onClose={() => setOpen(false)}
				onSelect={() => onSelect(environment)}
			/>
		</li>
	);
}

function EnvironmentEmptyState({ searching }: { searching: boolean }) {
	const { t } = useTranslation("templates");
	return (
		<EmptyState
			title={searching ? t("agent.environment.list.noMatch") : t("agent.environment.list.empty")}
			hint={searching ? t("agent.environment.list.noMatchHint") : t("agent.environment.list.emptyHint")}
		/>
	);
}

/** 环境仅作为当前模版草稿的单选配置，选择不修改 Provider 资源。 */
export function TemplateEnvironmentList({
	selected,
	onSelect,
	search,
	onSearchChange,
}: {
	selected: TemplateEnvironmentSelection | null;
	onSelect: (environment: TemplateEnvironmentSelection) => void;
	search: string;
	onSearchChange: (search: string) => void;
}) {
	const { t } = useTranslation("templates");
	const remote = useRemoteEnvironments();
	const local = useTemplateLocalResources();
	const query = search.trim().toLowerCase();
	const {
		rows: candidates,
		loading,
		ready,
	} = templateResourceCandidates(local.environments, remote, (item) => item.environment_id);
	const rows = candidates.filter((environment) =>
		`${environment.name}\n${environment.environment_id}`.toLowerCase().includes(query),
	);
	const retry = () => {
		// 只重试读取，不能把用户选择静默切回默认环境；提交时复核引用是否仍可用。
		void remote.refresh();
	};
	return (
		<section aria-label={t("agent.environment.list.aria")} className={styles.listRoot}>
			<Input
				type="search"
				aria-label={t("agent.environment.list.searchAria")}
				placeholder={t("agent.environment.list.searchPlaceholder")}
				value={search}
				onChange={(event) => onSearchChange(event.target.value)}
				className={styles.searchInputSm}
			/>
			{loading ? <EmptyState loading title={t("agent.environment.list.loading")} /> : null}
			{remote.error ? <ErrorState message={remote.error} onRetry={retry} /> : null}
			{ready && rows.length === 0 ? <EnvironmentEmptyState searching={query.length > 0} /> : null}
			{ready && rows.length > 0 ? (
				<div className={styles.tableWrap}>
					<div aria-hidden="true" className={styles.tableHead5}>
						<span className={styles.headCol2}>{t("agent.environment.list.name")}</span>
						<span className={styles.headCol2}>{t("agent.environment.list.id")}</span>
						<span>{t("agent.environment.list.actions")}</span>
					</div>
					<ul aria-label={t("agent.environment.list.listAria")} className={styles.rowList}>
						{rows.map((environment) => (
							<EnvironmentRow
								key={environment.environment_id}
								environment={environment}
								selected={selected?.environment_id === environment.environment_id}
								onSelect={onSelect}
							/>
						))}
					</ul>
				</div>
			) : null}
			<p className={styles.selectedNote}>
				{selected
					? t("agent.environment.list.selected", { name: selected.name || selected.environment_id })
					: t("agent.environment.list.defaultEnvironment")}
				{ready ? (
					<span className={styles.noteCount}>{t("agent.environment.list.count", { count: rows.length })}</span>
				) : null}
			</p>
		</section>
	);
}
