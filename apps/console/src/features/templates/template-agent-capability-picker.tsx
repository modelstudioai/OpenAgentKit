import type { ProjectAgentCreateInput, ProjectAgentOptions, RemoteSkill } from "@openagentpack/kit-sdk/protocol";
import { Alert, Button, Drawer, Empty, Input, Spin } from "antd";
import i18n from "i18next";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import styles from "./template-forms.module.less";
import { TemplateSkillUploadAction } from "./template-skill-upload-dialog.tsx";

export type AgentSkillSelection = {
	key: string;
	name: string;
	reference: NonNullable<ProjectAgentCreateInput["skills"]>[number];
};
export type AgentCapabilities = { skills: AgentSkillSelection[] };
type Kind = "Skill";
type Source = "custom" | "official";
type Choice = { key: string; name: string; description?: string; detail?: string; available: boolean };
type Props = {
	projectName: string;
	revision?: string;
	value: AgentCapabilities;
	disabled: boolean;
	uploadEnabled: boolean;
	onUploadPendingChange: (pending: boolean) => void;
	onReloadProject: () => Promise<void>;
	onChange: (value: AgentCapabilities) => void;
	onPrepare?: () => Promise<unknown>;
};
const MAX_SKILLS = 10;
const PAGE_SIZE = 10;

/** 候选行：base + 选中主色浅底 / 未选中 hover 浅灰（原为 cva，拆为组合类）。 */
function rowClass(selected: boolean) {
	return selected ? `${styles.choiceRow} ${styles.choiceRowOn}` : `${styles.choiceRow} ${styles.choiceRowIdle}`;
}

const SOURCE_KEYS: Record<Source, "agent.skills.custom" | "agent.skills.official"> = {
	custom: "agent.skills.custom",
	official: "agent.skills.official",
};

/** 选择仅更新新建表单；远端 Skill 固定版本，本地资源随同一源码 revision 提交。 */
export function TemplateAgentCapabilities(props: Props) {
	return (
		<div className={styles.createRoot}>
			{(["Skill"] as const).map((kind) => (
				<CapabilitySection key={kind} {...props} kind={kind} />
			))}
		</div>
	);
}

function CapabilitySection({ kind, ...props }: Props & { kind: Kind }) {
	const { t } = useTranslation("templates");
	const [open, setOpen] = useState(false);
	const [source, setSource] = useState<Source>("custom");
	const [uploadMessage, setUploadMessage] = useState<string>();
	const selected = props.value.skills.map((skill) => ({
		key: skill.key,
		name: skill.name,
		version:
			typeof skill.reference === "string"
				? t("agent.skills.projectDeclaration")
				: t("agent.skills.sourceVersion", {
						source: t(SOURCE_KEYS[skill.reference.type]),
						version: skill.reference.version,
					}),
	}));
	return (
		<div className={`${styles.shrinkRoot} ${styles.blockStack}`}>
			<div className={styles.rowBetween}>
				<p className={styles.formNote}>{t("agent.skills.note", { max: MAX_SKILLS })}</p>
				<div className={styles.actionsWrap}>
					{kind === "Skill" ? (
						<TemplateSkillUploadAction
							projectName={props.projectName}
							revision={props.revision}
							enabled={props.uploadEnabled && props.value.skills.length < MAX_SKILLS}
							disabled={props.disabled}
							onPrepare={props.onPrepare}
							onPendingChange={props.onUploadPendingChange}
							onSaved={async (uploaded) => {
								const skills = new Map(props.value.skills.map((skill) => [skill.key, skill]));
								for (const skill of uploaded) {
									const key = `project:${skill.skill_key}`;
									skills.set(key, { key, name: skill.name, reference: skill.skill_key });
								}
								props.onChange({ ...props.value, skills: [...skills.values()] });
								setUploadMessage(t("agent.skills.addSaved", { count: uploaded.length, kind }));
								await props.onReloadProject();
							}}
						/>
					) : null}
					<Button
						disabled={props.disabled || (!props.onPrepare && (!props.projectName || !props.revision))}
						onClick={() => {
							if (props.onPrepare)
								void props
									.onPrepare()
									.then(() => setOpen(true))
									.catch(() => {});
							else setOpen(true);
						}}
					>
						{t("agent.skills.add", { kind })}
					</Button>
					{open ? (
						<CapabilityPicker
							{...props}
							kind={kind}
							source={source}
							onSourceChange={setSource}
							onClose={() => setOpen(false)}
						/>
					) : null}
				</div>
			</div>
			{kind === "Skill" && props.value.skills.length >= MAX_SKILLS ? (
				<p className={styles.formNote}>{t("agent.skills.limitHint", { max: MAX_SKILLS })}</p>
			) : null}
			{uploadMessage ? (
				<p role="status" className={styles.formNote}>
					{uploadMessage}
				</p>
			) : null}
			{selected.length ? (
				<ul aria-label={t("agent.skills.selectedAria", { kind })} className={styles.stack2}>
					{selected.map((item) => (
						<li key={item.key} className={styles.selectedItemCard}>
							<div className={`${styles.shrinkRoot} ${styles.fieldStack}`}>
								<p className={styles.nameAny}>{item.name}</p>
								<p className={styles.metaAny}>{item.version}</p>
							</div>
							<Button
								size="small"
								className={styles.shrinkZero}
								disabled={props.disabled}
								aria-label={t("agent.skills.removeAria", { kind, name: item.name })}
								onClick={() =>
									props.onChange({
										...props.value,
										skills: props.value.skills.filter((skill) => skill.key !== item.key),
									})
								}
							>
								{t("agent.skills.remove")}
							</Button>
						</li>
					))}
				</ul>
			) : (
				<p className={styles.formNote}>{t("agent.skills.empty", { kind })}</p>
			)}
		</div>
	);
}

function CapabilityPicker({
	kind,
	source,
	onSourceChange,
	onClose,
	...props
}: Props & {
	kind: Kind;
	source: Source;
	onSourceChange: (source: Source) => void;
	onClose: () => void;
}) {
	const { t } = useTranslation("templates");
	return (
		<Drawer
			open
			onClose={onClose}
			width={672}
			title={
				<div className={styles.stack2}>
					<div className={styles.drawerTitle}>{t("agent.skills.chooseTitle", { kind })}</div>
					<p className={styles.drawerAgent}>{t("agent.skills.note", { max: MAX_SKILLS })}</p>
				</div>
			}
			footer={
				<div className={styles.rowBetween}>
					<p role="status" className={styles.formNote}>
						{t("agent.skills.selectedCount", { count: props.value.skills.length, kind })}
					</p>
					<Button type="primary" onClick={onClose}>
						{t("agent.skills.done")}
					</Button>
				</div>
			}
		>
			<div className={styles.pageStack}>
				{kind === "Skill" ? (
					<fieldset aria-label={t("agent.skills.sourceAria")} className={styles.sourceTabs}>
						{(["custom", "official"] as const).map((item) => (
							<button
								key={item}
								type="button"
								className={styles.sourceTab}
								aria-pressed={source === item}
								onClick={() => onSourceChange(item)}
							>
								{t(SOURCE_KEYS[item])}
							</button>
						))}
					</fieldset>
				) : null}
				<SkillChoices key={source} {...props} source={source} />
			</div>
		</Drawer>
	);
}

type SkillChoice = Choice & { selection?: AgentSkillSelection };

function remoteSkillChoice(skill: RemoteSkill): SkillChoice {
	const t = i18n.getFixedT(null, "templates");
	const key = `${skill.source}:${skill.skill_id}`;
	const available = Boolean(skill.available && skill.latest_version);
	return {
		key,
		name: skill.name,
		description: skill.description,
		detail: available ? t("agent.skills.version", { version: skill.latest_version }) : t("agent.skills.unavailable"),
		available,
		selection:
			available && skill.latest_version
				? {
						key,
						name: skill.name,
						reference: { type: skill.source, skill_id: skill.skill_id, version: skill.latest_version },
					}
				: undefined,
	};
}

/** 仅展示与当前源码版本一致的本地候选，读取失败时不复用旧快照。 */
function projectSkillSnapshot(
	query: { data?: ProjectAgentOptions; loading: boolean; error: string | null },
	revision: string | undefined,
	enabled: boolean,
) {
	if (!enabled) return { skills: [], error: null, outdated: false };
	const outdated = Boolean(query.data && query.data.base_revision !== revision);
	const error = outdated ? i18n.getFixedT(null, "templates")("agent.skills.projectOutdated") : query.error;
	return { skills: query.loading || error ? [] : (query.data?.skills ?? []), error, outdated };
}

function SkillChoices(props: Props & { source: Source }) {
	const { t } = useTranslation("templates");
	const client = useMemo(getAdminClient, []);
	const remote = useAdminQuery(`templates:agent-create:skills:${props.source}`, (signal) =>
		client.remoteSkills(props.source, signal),
	);
	const includeLocal = props.source === "custom";
	const project = useAdminQuery(
		`templates:agent-create:options:${props.projectName}:${props.revision}`,
		(signal) => client.draftResources.agentOptions(props.projectName, signal),
		{ enabled: includeLocal },
	);
	const local = projectSkillSnapshot(project, props.revision, includeLocal);
	const cloudSkills = remote.loading || remote.error ? [] : (remote.data ?? []);
	const choices = new Map<string, SkillChoice>();
	for (const skill of local.skills) {
		const key = `project:${skill.id}`;
		choices.set(key, {
			key,
			name: skill.name,
			description: skill.description,
			detail: t("agent.skills.local"),
			available: true,
			selection: { key, name: skill.name, reference: skill.id },
		});
	}
	for (const skill of cloudSkills) {
		const choice = remoteSkillChoice(skill);
		choices.set(choice.key, choice);
	}
	const selectedKeys = new Set(props.value.skills.map((skill) => skill.key));
	const loading = remote.loading || (includeLocal && project.loading);
	return (
		<div className={styles.blockStack}>
			{remote.error ? (
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
			) : null}
			{local.error ? (
				<Alert
					type="error"
					showIcon
					message={local.error}
					action={
						<Button size="small" onClick={local.outdated ? props.onReloadProject : () => void project.refresh()}>
							{t("retry")}
						</Button>
					}
				/>
			) : null}
			<CapabilityChoices
				kind="Skill"
				loading={loading && choices.size === 0}
				hideEmpty={Boolean(remote.error || local.error)}
				rows={[...choices.values()]}
				selectedKeys={selectedKeys}
				limitReached={props.value.skills.length >= MAX_SKILLS}
				onToggle={(key) => {
					const choice = choices.get(key);
					if (!choice) return;
					const selection = props.value.skills.filter((skill) => skill.key !== key);
					if (!selectedKeys.has(key)) {
						if (!choice.selection || props.value.skills.length >= MAX_SKILLS) return;
						selection.push(choice.selection);
					}
					props.onChange({ ...props.value, skills: selection });
				}}
				empty={t("agent.skills.emptyChoices")}
			/>
		</div>
	);
}

function ChoicesErrorAlert({ error, onRetry }: { error: string; onRetry?: () => void }) {
	const { t } = useTranslation("templates");
	return (
		<Alert
			type="error"
			showIcon
			message={error}
			action={
				onRetry ? (
					<Button size="small" onClick={onRetry}>
						{t("retry")}
					</Button>
				) : undefined
			}
		/>
	);
}

function CapabilityChoices({
	kind,
	rows,
	selectedKeys,
	limitReached,
	loading,
	hideEmpty = false,
	error,
	onRetry,
	onToggle,
	empty,
}: {
	kind: Kind;
	rows: Choice[];
	selectedKeys: Set<string>;
	limitReached: boolean;
	loading: boolean;
	hideEmpty?: boolean;
	error?: string | null;
	onRetry?: () => void;
	onToggle: (key: string) => void;
	empty: string;
}) {
	const { t } = useTranslation("templates");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const filtered = rows.filter((row) =>
		`${row.name} ${row.key}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
	);
	const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const currentPage = Math.min(page, pages);
	const emptyState = hideEmpty ? null : (
		<Empty description={search.trim() ? t("agent.skills.noMatch", { kind }) : empty} />
	);
	return (
		<div className={`${styles.shrinkRoot} ${styles.blockStack}`}>
			<Input
				type="search"
				aria-label={t("agent.skills.searchAria", { kind })}
				placeholder={t("agent.skills.searchPlaceholder", { kind })}
				value={search}
				onChange={(event) => {
					setSearch(event.target.value);
					setPage(1);
				}}
			/>
			{loading ? (
				<div role="status" className={styles.loadingRow}>
					<Spin />
				</div>
			) : error ? (
				<ChoicesErrorAlert error={error} onRetry={onRetry} />
			) : filtered.length ? (
				<>
					<ul aria-label={t("agent.skills.listAria", { kind })} className={styles.choiceListCard}>
						{filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((row) => (
							<li key={row.key}>
								<CapabilityRow
									kind={kind}
									row={row}
									selected={selectedKeys.has(row.key)}
									limitReached={limitReached}
									onToggle={onToggle}
								/>
							</li>
						))}
					</ul>
					{pages > 1 ? (
						<nav aria-label={t("agent.skills.paginationAria", { kind })} className={styles.rowEnd13}>
							<Button size="small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
								{t("agent.skills.previous")}
							</Button>
							<span>{t("agent.skills.page", { page: currentPage, pages })}</span>
							<Button size="small" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>
								{t("agent.skills.next")}
							</Button>
						</nav>
					) : null}
				</>
			) : (
				emptyState
			)}
		</div>
	);
}

function CapabilityRow({
	kind,
	row,
	selected,
	limitReached,
	onToggle,
}: {
	kind: Kind;
	row: Choice;
	selected: boolean;
	limitReached: boolean;
	onToggle: (key: string) => void;
}) {
	const { t } = useTranslation("templates");
	return (
		<button
			type="button"
			aria-label={
				kind === "Skill"
					? t("agent.skills.selectAriaWithKey", {
							kind,
							name: row.name,
							key: row.key.slice(row.key.indexOf(":") + 1),
						})
					: t("agent.skills.selectAria", { kind, name: row.name })
			}
			aria-pressed={selected}
			disabled={!selected && (!row.available || limitReached)}
			className={rowClass(selected)}
			onClick={() => onToggle(row.key)}
		>
			<span aria-hidden="true" className={styles.checkMark}>
				{selected ? "✓" : null}
			</span>
			<span className={`${styles.flexFill} ${styles.fieldStack} ${styles.wrapAnywhere}`}>
				<span className={styles.blockMedium}>{row.name}</span>
				{row.detail ? <span className={styles.blockMuted}>{row.detail}</span> : null}
				{row.description ? <span className={styles.blockMuted}>{row.description}</span> : null}
			</span>
		</button>
	);
}
