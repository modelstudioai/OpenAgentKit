import type { PresetPackAgentResources } from "@openagentkit/sdk/protocol";
import { Alert, Button, Empty, Input, Spin } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type RemoteAgent, useRemoteAgents } from "../catalog/use-remote-agents.ts";
import { TemplateAgentDetailDrawer } from "./template-agent-detail-drawer.tsx";
import { TemplateAgentVersionPicker } from "./template-agent-version-picker.tsx";
import styles from "./template-lists.module.less";
import { type TemplateAgentSelection, useTemplateLocalResources } from "./template-local-resources.tsx";
import { templateResourceCandidates } from "./template-resource-candidates.ts";
import { useAgentOccupancy } from "./use-agent-occupancy.ts";

/** version 是列表元数据，选择时将默认版本或手选版本写入 agent_version 运行绑定。 */
export type { TemplateAgentSelection } from "./template-local-resources.tsx";

const PAGE_SIZE = 10;

function mergeAgentVersion(local: TemplateAgentSelection, remote: TemplateAgentSelection): TemplateAgentSelection {
	const versions = [local.version, remote.version].filter(
		(version): version is number => version !== undefined && Number.isInteger(version) && version > 0,
	);
	// 发布前读取的远端列表不能把刚发布的候选版本降回旧值；已选具体版本仍由草稿优先。
	return { ...remote, version: versions.length ? Math.max(...versions) : undefined };
}

/** 行：md 起 5 列网格；选中主色浅底 / 未选中 hover 浅灰（原为 cva，拆为组合类）。 */
function rowClass(selected: boolean) {
	return selected ? `${styles.selectRow5} ${styles.selectRowPrimary}` : `${styles.selectRow5} ${styles.selectRowIdle}`;
}

function TemplateAgentRow({
	agent,
	selected,
	version,
	boundTo,
	onSelect,
	onDefaultVersion,
	onVersionChange,
}: {
	agent: TemplateAgentSelection;
	selected: boolean;
	version?: number;
	/** 非空表示远端 Agent 已被其他模版关联；当前已选中项豁免。 */
	boundTo?: string;
	onSelect: (version?: number, resources?: PresetPackAgentResources) => void;
	onDefaultVersion: (version: number) => void;
	onVersionChange: (version: number) => void;
}) {
	const { t } = useTranslation("templates");
	const name = agent.name || agent.agent_id;
	const occupied = boundTo !== undefined && !selected;
	return (
		<li className={rowClass(selected)}>
			<TemplateAgentDetailDrawer
				agent={agent}
				version={version}
				selected={selected}
				boundTo={occupied ? boundTo : undefined}
				onSelect={onSelect}
			/>
			<div className={styles.actionCell}>
				{agent.local && !occupied ? (
					<span className={styles.metaText}>{t("agent.detail.pendingPublish")}</span>
				) : (
					<TemplateAgentVersionPicker
						agentId={agent.agent_id}
						agentName={name}
						value={version}
						disabled={occupied}
						onDefaultVersion={onDefaultVersion}
						onChange={onVersionChange}
					/>
				)}
			</div>
		</li>
	);
}

/** Provider 全量列表复用既有查询合同；搜索与分页仅改变当前展示，不截断候选集合。 */
export function useTemplateAgentListState(selected: TemplateAgentSelection | null) {
	return {
		search: useState(""),
		page: useState(1),
		versionDrafts: useState<Record<string, number | undefined>>(() =>
			selected ? { [selected.agent_id]: selected.agent_version } : {},
		),
	};
}

export function TemplateAgentList({
	selected,
	state,
	onSelect,
	onVersionChange,
}: {
	selected: TemplateAgentSelection | null;
	state: ReturnType<typeof useTemplateAgentListState>;
	onSelect: (agent: TemplateAgentSelection, resources?: PresetPackAgentResources) => void;
	onVersionChange: (agent: TemplateAgentSelection) => void;
}) {
	const { t } = useTranslation("templates");
	const remote = useRemoteAgents();
	const local = useTemplateLocalResources();
	const boundAgents = useAgentOccupancy();
	const [search, setSearch] = state.search;
	const [page, setPage] = state.page;
	const [versionDrafts, setVersionDrafts] = state.versionDrafts;
	const versionFor = (agent: RemoteAgent) => {
		const chosen =
			(selected?.agent_id === agent.agent_id ? selected.agent_version : undefined) ?? versionDrafts[agent.agent_id];
		return (
			chosen ??
			(agent.version !== undefined && Number.isInteger(agent.version) && agent.version > 0 ? agent.version : undefined)
		);
	};
	const selectAgent = (
		agent: TemplateAgentSelection,
		version = versionFor(agent),
		resources?: PresetPackAgentResources,
	) => {
		if (agent.local) {
			onSelect(agent);
			return;
		}
		if (version === undefined) return;
		setVersionDrafts((current) => ({ ...current, [agent.agent_id]: version }));
		onSelect({ ...agent, agent_version: version }, resources);
	};
	const changeVersion = (agent: RemoteAgent, version: number) => {
		setVersionDrafts((current) => ({ ...current, [agent.agent_id]: version }));
		if (selected?.agent_id === agent.agent_id) onVersionChange({ ...selected, agent_version: version });
	};
	const query = search.trim().toLowerCase();
	const {
		rows: candidates,
		loading,
		ready,
	} = templateResourceCandidates(local.agents, remote, (item) => item.agent_id, mergeAgentVersion);
	const filtered = candidates.filter((agent) => `${agent.name}\n${agent.agent_id}`.toLowerCase().includes(query));
	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const currentPage = Math.min(page, pageCount);
	const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
	return (
		<section aria-label={t("agent.list.aria")} className={styles.tableWrap}>
			<header className={styles.listToolbar2}>
				<div className={styles.searchBox}>
					<Input
						type="search"
						aria-label={t("agent.list.searchAria")}
						placeholder={t("agent.list.searchPlaceholder")}
						value={search}
						onChange={(event) => {
							setSearch(event.target.value);
							setPage(1);
						}}
						className={`${styles.shrinkRoot} ${styles.searchInputSm}`}
					/>
				</div>
			</header>
			{loading ? (
				<div role="status" className={styles.loadingRow}>
					<Spin />
				</div>
			) : null}
			{remote.error ? (
				<div className={styles.padBox}>
					<Alert
						type="error"
						showIcon
						message={remote.error}
						action={
							<Button size="small" onClick={() => void remote.refresh()}>
								{t("retry")}
							</Button>
						}
					/>
				</div>
			) : null}
			{ready && rows.length === 0 ? (
				<Empty
					description={
						<span className={styles.mutedOnly}>
							{query ? t("agent.list.noMatch") : t("agent.list.empty")}
							<br />
							<span className={styles.textXs}>{query ? t("agent.list.noMatchHint") : t("agent.list.emptyHint")}</span>
						</span>
					}
				/>
			) : null}
			{ready && rows.length > 0 ? (
				<>
					<div aria-hidden="true" className={styles.tableHead5}>
						<span className={styles.headCol2}>{t("agent.view.sectionName")}</span>
						<span className={styles.headCol2}>ID</span>
						<span>{t("agent.view.sectionVersion")}</span>
					</div>
					<ul aria-label={t("agent.list.aria")} className={styles.rowList}>
						{rows.map((agent) => (
							<TemplateAgentRow
								key={agent.agent_id}
								agent={agent}
								selected={selected?.agent_id === agent.agent_id}
								version={versionFor(agent)}
								boundTo={boundAgents.get(agent.agent_id)}
								onSelect={(version, resources) => selectAgent(agent, version, resources)}
								onDefaultVersion={(version) => {
									// 补齐候选只用于后续显式选择，不能把旧模版的浮动绑定静默固定。
									setVersionDrafts((current) => ({ ...current, [agent.agent_id]: version }));
								}}
								onVersionChange={(version) => changeVersion(agent, version)}
							/>
						))}
					</ul>
				</>
			) : null}
			{ready ? (
				<footer className={styles.listFooter}>
					<span>{t("agent.list.count", { count: filtered.length, pageSize: PAGE_SIZE })}</span>
					<nav aria-label={t("agent.list.paginationAria")} className={styles.listPager}>
						<Button size="small" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
							{t("agent.skills.previous")}
						</Button>
						<span aria-live="polite">{t("agent.skills.page", { page: currentPage, pages: pageCount })}</span>
						<Button size="small" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>
							{t("agent.skills.next")}
						</Button>
					</nav>
				</footer>
			) : null}
		</section>
	);
}
