import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui";
import type { RemoteMemoryStore } from "@openagentpack/kit-sdk/protocol";
import { Input } from "antd";
import { useTranslation } from "react-i18next";
import { useRemoteMemoryStores } from "../catalog/use-remote-memory-stores.ts";
import styles from "./template-forms.module.less";
import listStyles from "./template-lists.module.less";
import { type TemplateLocalResource, useTemplateLocalResources } from "./template-local-resources.tsx";
import { MAX_TEMPLATE_MEMORIES, type TemplateMemoryDraft } from "./template-memory-draft.ts";
import { templateResourceCandidates } from "./template-resource-candidates.ts";

export type { TemplateMemoryDraft } from "./template-memory-draft.ts";

const MAX_MEMORIES = MAX_TEMPLATE_MEMORIES;

function MemoryList({
	maxMemories,
	rows,
	value,
	remoteIds,
	onToggle,
}: {
	maxMemories: number;
	rows: (RemoteMemoryStore & TemplateLocalResource)[];
	value: TemplateMemoryDraft[];
	remoteIds: Set<string>;
	onToggle: (memory: RemoteMemoryStore & TemplateLocalResource) => void;
}) {
	const { t } = useTranslation("templates");
	const selectedIds = new Set(value.map((memory) => memory.memory_store_id));
	return (
		<div className={listStyles.tableWrap}>
			<div aria-hidden="true" className={listStyles.tableHead2}>
				<span>{t("memory.selection.name")}</span>
				<span>{t("memory.selection.id")}</span>
			</div>
			<ul aria-label={t("memory.selection.listAria")} className={listStyles.rowList}>
				{rows.map((memory) => {
					const id = memory.memory_store_id;
					const name = memory.name || id;
					const selected = selectedIds.has(id);
					const missing = !remoteIds.has(id);
					return (
						<li key={id}>
							<button
								type="button"
								aria-label={t("memory.selection.selectAria", { name, id })}
								aria-pressed={selected}
								disabled={!selected && (missing || value.length >= maxMemories)}
								onClick={() => onToggle(memory)}
								className={`${listStyles.selectRow} ${selected ? listStyles.selectRowSelected : listStyles.selectRowIdle}`}
							>
								<span className={listStyles.nameCell}>
									<span aria-hidden="true" className={listStyles.checkMark}>
										{selected ? "✓" : null}
									</span>
									<span className={listStyles.nameText}>{name}</span>
								</span>
								<span className={listStyles.metaCell}>
									<span className={listStyles.monoBlock}>{memory.local?.id ?? id}</span>
									{memory.local ? <span className="block">{t("memory.selection.pendingPublish")}</span> : null}
									{missing ? <span className="block">{t("memory.selection.missing")}</span> : null}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}

function MemoryEmptyState({ searching }: { searching: boolean }) {
	const { t } = useTranslation("templates");
	return (
		<EmptyState
			title={searching ? t("memory.selection.noMatch") : t("memory.selection.empty")}
			hint={searching ? t("memory.selection.noMatchHint") : t("memory.selection.emptyHint")}
		/>
	);
}

/** 列表只选择已有引用；每个已选库独立保留权限和说明，不创建空配置行。 */
export function TemplateMemorySelection({
	value,
	onChange,
	search,
	onSearchChange,
	maxMemories = MAX_MEMORIES,
}: {
	value: TemplateMemoryDraft[];
	onChange: (memories: TemplateMemoryDraft[]) => void;
	search: string;
	onSearchChange: (search: string) => void;
	maxMemories?: number;
}) {
	const { t } = useTranslation("templates");
	const remote = useRemoteMemoryStores();
	const local = useTemplateLocalResources();
	const query = search.trim().toLowerCase();
	const {
		rows: availableMemories,
		loading,
		ready,
	} = templateResourceCandidates(local.memories, remote, (item) => item.memory_store_id);
	const remoteNames = new Map(availableMemories.map((memory) => [memory.memory_store_id, memory.name]));
	const remoteIds = new Set(remoteNames.keys());
	const candidates = [
		...availableMemories,
		...value
			.filter((memory) => memory.memory_store_id && !remoteIds.has(memory.memory_store_id))
			.map((memory) => ({ ...memory, name: memory.name || memory.memory_store_id })),
	];
	const rows = candidates.filter((memory) => `${memory.name}\n${memory.memory_store_id}`.toLowerCase().includes(query));
	const toggle = (memory: RemoteMemoryStore & TemplateLocalResource) => {
		if (value.some((item) => item.memory_store_id === memory.memory_store_id)) {
			onChange(value.filter((item) => item.memory_store_id !== memory.memory_store_id));
		} else if (remoteIds.has(memory.memory_store_id) && value.length < maxMemories) {
			onChange([
				...value,
				{
					...memory,
					key: crypto.randomUUID(),
					access: "read_write",
					instructions: "",
				},
			]);
		}
	};
	return (
		<section aria-label={t("memory.selection.aria")} className={listStyles.listRoot}>
			<Input
				type="search"
				aria-label={t("memory.selection.searchAria")}
				placeholder={t("memory.selection.searchPlaceholder")}
				value={search}
				onChange={(event) => onSearchChange(event.target.value)}
				className={listStyles.searchInputSm}
			/>
			{loading ? <EmptyState loading title={t("memory.selection.loading")} /> : null}
			{remote.error ? <ErrorState message={remote.error} onRetry={() => void remote.refresh()} /> : null}
			{ready && rows.length === 0 ? <MemoryEmptyState searching={query.length > 0} /> : null}
			{ready && rows.length > 0 ? (
				<MemoryList maxMemories={maxMemories} rows={rows} value={value} remoteIds={remoteIds} onToggle={toggle} />
			) : null}
			<p aria-live="polite" className={styles.formNote}>
				{t("memory.selection.selectedCount", { count: value.length, max: maxMemories })}
				{ready ? (
					<span className={listStyles.noteCount}>{t("memory.selection.count", { count: rows.length })}</span>
				) : null}
			</p>
		</section>
	);
}

export function TemplateSelectedMemories({ memories }: { memories: TemplateMemoryDraft[] }) {
	const { t } = useTranslation("templates");
	if (!memories.length) return <p className={styles.formNote}>{t("memory.selection.notSelected")}</p>;
	return (
		<ul aria-label={t("memory.selection.selectedAria")} className={listStyles.selectedList}>
			{memories.map((memory) => (
				<li key={memory.key} className={listStyles.selectedItem}>
					<p className={styles.nameAny}>
						{memory.name || (memory.creation ? t("memory.selection.creationPending") : memory.memory_store_id)}
					</p>
					<p className={listStyles.envRowId}>
						{memory.creation ? t("memory.selection.pendingSave") : memory.memory_store_id}
					</p>
					<p className={styles.body13}>
						{t("memory.selection.access", {
							access: memory.access === "read_only" ? t("memory.fields.readOnly") : t("memory.fields.readWrite"),
						})}
					</p>
					{memory.instructions ? (
						<p className={styles.noteAny}>
							{t("memory.selection.instructions", { instructions: memory.instructions })}
						</p>
					) : null}
				</li>
			))}
		</ul>
	);
}
