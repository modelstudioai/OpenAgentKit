import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui";
import { Button, Input } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRemoteVaults } from "../catalog/use-remote-vaults.ts";
import styles from "./template-forms.module.less";
import listStyles from "./template-lists.module.less";
import { type TemplateVaultSelectionValue, useTemplateLocalResources } from "./template-local-resources.tsx";
import { templateResourceCandidates } from "./template-resource-candidates.ts";
import { TemplateVaultDetailDrawer } from "./template-vault-detail-drawer.tsx";

import { MAX_TEMPLATE_VAULTS, type TemplateVaultDraft, validateTemplateVaults } from "./template-vault-draft.ts";

export { validateTemplateVaults } from "./template-vault-draft.ts";

function VaultRow({
	vault,
	selected,
	missing,
	maxReached,
	onToggle,
}: {
	vault: TemplateVaultSelectionValue;
	selected: boolean;
	missing: boolean;
	maxReached: boolean;
	onToggle: (id: string) => void;
}) {
	const { t } = useTranslation("templates");
	const [open, setOpen] = useState(false);
	const id = vault.vault_id;
	return (
		<li className={`${listStyles.selectRow5} ${selected ? listStyles.selectRowSelected : listStyles.selectRowIdle}`}>
			<button
				type="button"
				aria-label={t("vault.list.selectAria", { name: vault.name || id, id })}
				aria-pressed={selected}
				disabled={!selected && (missing || maxReached)}
				onClick={() => onToggle(id)}
				className={listStyles.selectRowButton5}
			>
				<span className={listStyles.nameCell}>
					<span aria-hidden="true" className={listStyles.checkMark}>
						{selected ? "✓" : null}
					</span>
					<span className={listStyles.nameText}>{vault.name || id}</span>
				</span>
				<span className={listStyles.metaCell}>
					<span className={listStyles.monoBlock}>{vault.local?.id ?? id}</span>
					{vault.local ? <span className="block">{t("vault.list.pendingPublish")}</span> : null}
					{missing ? <span className="block">{t("vault.list.missing")}</span> : null}
				</span>
			</button>
			<div className={listStyles.actionCell}>
				<Button type="link" size="small" className={listStyles.linkFlush} onClick={() => setOpen(true)}>
					{t("vault.list.view")}
				</Button>
			</div>
			<TemplateVaultDetailDrawer vault={vault} open={open} onClose={() => setOpen(false)} />
		</li>
	);
}

function VaultList({
	rows,
	selectedIds,
	remoteIds,
	onToggle,
	maxVaults,
}: {
	rows: TemplateVaultSelectionValue[];
	selectedIds: string[];
	remoteIds: Set<string>;
	onToggle: (id: string) => void;
	maxVaults: number;
}) {
	const { t } = useTranslation("templates");
	return (
		<div className={listStyles.tableWrap}>
			<div aria-hidden="true" className={listStyles.tableHead5}>
				<span className={listStyles.headCol2}>{t("vault.list.name")}</span>
				<span className={listStyles.headCol2}>{t("vault.list.id")}</span>
				<span>{t("vault.list.actions")}</span>
			</div>
			<ul aria-label={t("vault.list.aria")} className={listStyles.rowList}>
				{rows.map((vault) => (
					<VaultRow
						key={vault.vault_id}
						vault={vault}
						selected={selectedIds.includes(vault.vault_id)}
						missing={!remoteIds.has(vault.vault_id)}
						maxReached={selectedIds.length >= maxVaults}
						onToggle={onToggle}
					/>
				))}
			</ul>
		</div>
	);
}

function VaultEmptyState({ searching }: { searching: boolean }) {
	const { t } = useTranslation("templates");
	return (
		<EmptyState
			title={searching ? t("vault.list.noMatch") : t("vault.list.empty")}
			hint={searching ? t("vault.list.noMatchHint") : t("vault.list.emptyHint")}
		/>
	);
}

/** 仅在导入抽屉打开时查询候选，确认前不修改主表单。 */
export function TemplateVaultSelection({
	value,
	onChange,
	search,
	onSearchChange,
	maxVaults = MAX_TEMPLATE_VAULTS,
}: {
	value: TemplateVaultDraft[];
	onChange: (vaults: TemplateVaultDraft[]) => void;
	search: string;
	onSearchChange: (value: string) => void;
	maxVaults?: number;
}) {
	const { t } = useTranslation("templates");
	const remote = useRemoteVaults();
	const local = useTemplateLocalResources();
	const query = search.trim().toLowerCase();
	const ids = value.map((vault) => vault.vault_id);
	const {
		rows: availableVaults,
		loading,
		ready,
	} = templateResourceCandidates(local.vaults, remote, (item) => item.vault_id);
	const remoteById = new Map(availableVaults.map((vault) => [vault.vault_id, vault]));
	const remoteIds = new Set(remoteById.keys());
	const candidates = [...availableVaults, ...value.filter((vault) => !remoteIds.has(vault.vault_id))];
	const rows = candidates.filter((vault) => `${vault.name}\n${vault.vault_id}`.toLowerCase().includes(query));
	const error = validateTemplateVaults(value);
	const select = (next: string[]) =>
		onChange(next.flatMap((id) => remoteById.get(id) ?? value.find((vault) => vault.vault_id === id) ?? []));
	const toggle = (id: string) => {
		if (ids.includes(id)) select(ids.filter((selected) => selected !== id));
		else if (remoteIds.has(id) && ids.length < maxVaults) select([...ids, id]);
	};
	return (
		<div className={listStyles.listRoot}>
			<Input
				type="search"
				aria-label={t("vault.list.searchAria")}
				placeholder={t("vault.list.searchPlaceholder")}
				value={search}
				onChange={(event) => onSearchChange(event.target.value)}
			/>
			{loading ? <EmptyState loading title={t("vault.list.loading")} /> : null}
			{remote.error ? <ErrorState message={remote.error} onRetry={() => void remote.refresh()} /> : null}
			{ready && !rows.length ? <VaultEmptyState searching={Boolean(query)} /> : null}
			{ready && rows.length ? (
				<VaultList rows={rows} selectedIds={ids} remoteIds={remoteIds} onToggle={toggle} maxVaults={maxVaults} />
			) : null}
			<p aria-live="polite" className={styles.formNote}>
				{t("vault.list.selectedCount", { count: value.length, max: maxVaults })}
			</p>
			{error ? (
				<p role="alert" className={styles.errorText}>
					{error}
				</p>
			) : null}
		</div>
	);
}

export function TemplateSelectedVaults({ vaults }: { vaults: TemplateVaultDraft[] }) {
	const { t } = useTranslation("templates");
	if (!vaults.length) return <p className={styles.formNote}>{t("vault.list.notSelected")}</p>;
	return (
		<ul aria-label={t("vault.list.selectedAria")} className={listStyles.selectedList}>
			{vaults.map((vault) => (
				<li key={vault.vault_id} className={listStyles.selectedItemRow}>
					<div className={`${listStyles.shrinkRoot} ${styles.stack2}`}>
						<p className={styles.nameAny}>
							{vault.name || (vault.creation ? t("vault.list.creationPending") : vault.vault_id)}
						</p>
						<p className={listStyles.envRowId}>{vault.creation ? t("vault.list.pendingSave") : vault.vault_id}</p>
					</div>
				</li>
			))}
		</ul>
	);
}
