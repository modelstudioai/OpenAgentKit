import { useIsMobile } from "@openagentkit/sdk/hooks";
import { Button, Drawer } from "antd";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentFormDetail } from "./template-agent-form-draft.ts";
import { AGENT_CONFIGURATION_FIELDS, agentConfigurationValues } from "./template-configuration-fields.ts";
import type { TemplateFileDraft } from "./template-file-selection.tsx";
import type {
	TemplateEnvironmentSelection,
	TemplateLocalResource,
	TemplateVaultSelectionValue,
} from "./template-local-resources.tsx";
import type { TemplateMemoryDraft } from "./template-memory-selection.tsx";
import styles from "./template-resources.module.less";

interface ConfigurationSummaryProps {
	name: string;
	agentConfiguration?: AgentFormDetail;
	environment: TemplateEnvironmentSelection | null;
	environmentName?: string;
	files: TemplateFileDraft[];
	memories: TemplateMemoryDraft[];
	vaults: TemplateVaultSelectionValue[];
}

function SummaryField({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className={styles.summaryField}>
			<dt className={styles.summaryLabel}>{label}</dt>
			<dd className={styles.summaryValue}>{children}</dd>
		</div>
	);
}

function SummaryValues({ values, empty }: { values: string[]; empty?: string }) {
	const { t } = useTranslation("templates");
	const unique = [...new Set(values.filter((value) => value.trim()))];
	return unique.length ? (
		<ul className={styles.valueList}>
			{unique.map((value) => (
				<li key={value}>{value}</li>
			))}
		</ul>
	) : (
		(empty ?? t("common.notConfigured"))
	);
}

function AgentConfigurationFields({ detail }: { detail?: AgentFormDetail }) {
	const { t } = useTranslation("templates");
	const values = agentConfigurationValues(detail);
	return (
		<>
			{AGENT_CONFIGURATION_FIELDS.map(({ key, label }) => {
				const value = values[key];
				return (
					<SummaryField key={key} label={t(label)}>
						{Array.isArray(value) ? (
							<SummaryValues values={value} empty={key === "skills" ? t("common.notSelected") : undefined} />
						) : (
							value
						)}
					</SummaryField>
				);
			})}
		</>
	);
}

function ResourceName({ name, id, local }: { name?: string; id: string } & TemplateLocalResource) {
	const { t } = useTranslation("templates");
	return (
		<>
			<p>{name?.trim() || id}</p>
			{name?.trim() && name !== id ? (
				<p className={styles.resourceId}>{local ? `${local.id} · ${t("summary.pendingPublish")}` : id}</p>
			) : null}
		</>
	);
}

/** 仅展示当前草稿；不查询远端资源，也不参与调试快照或运行时比较。 */
function ConfigurationSummaryContent({
	name,
	agentConfiguration,
	environment,
	environmentName,
	files,
	memories,
	vaults,
}: ConfigurationSummaryProps) {
	const { t } = useTranslation("templates");
	const selectedMemories = memories.filter((memory) => memory.memory_store_id.trim());
	return (
		<dl className={styles.summaryRoot}>
			<SummaryField label={t("fields.name")}>{name.trim() || "—"}</SummaryField>
			<AgentConfigurationFields detail={agentConfiguration} />
			<SummaryField label={t("fields.environment")}>
				{environmentName !== undefined ? (
					<p>{environmentName.trim() || t("summary.environmentNamePending")}</p>
				) : environment ? (
					<ResourceName name={environment.name} id={environment.environment_id} local={environment.local} />
				) : (
					t("summary.defaultEnvironment")
				)}
			</SummaryField>
			<SummaryField label={t("fields.files")}>
				{files.length ? (
					<ul className={styles.resourceList}>
						{files.map((file) => (
							<li key={file.file_id}>
								<ResourceName name={file.filename} id={file.file_id} local={file.local} />
								<p className={styles.resourceMeta}>{t("summary.mountPath", { path: file.mount_path || "—" })}</p>
							</li>
						))}
					</ul>
				) : (
					t("common.notSelected")
				)}
			</SummaryField>
			<SummaryField label={t("fields.memories")}>
				{selectedMemories.length ? (
					<ul className={styles.resourceList}>
						{selectedMemories.map((memory) => (
							<li key={memory.key}>
								<ResourceName name={memory.name} id={memory.memory_store_id} local={memory.local} />
								<p>
									{t("summary.access", {
										access: memory.access === "read_only" ? t("summary.readOnly") : t("summary.readWrite"),
									})}
								</p>
								<p className={styles.resourceMeta}>
									{t("summary.instructions", { text: memory.instructions.trim() || "—" })}
								</p>
							</li>
						))}
					</ul>
				) : (
					t("common.notSelected")
				)}
			</SummaryField>
			<SummaryField label={t("fields.vaults")}>
				{vaults.length ? (
					<ul className={styles.resourceList}>
						{vaults.map((vault) => (
							<li key={vault.vault_id}>
								<ResourceName name={vault.name} id={vault.vault_id} local={vault.local} />
							</li>
						))}
					</ul>
				) : (
					t("common.notSelected")
				)}
			</SummaryField>
		</dl>
	);
}

function ConfigurationSummaryDrawer(props: ConfigurationSummaryProps) {
	const { t } = useTranslation("templates");
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button onClick={() => setOpen(true)}>{t("summary.view")}</Button>
			<Drawer
				open={open}
				onClose={() => setOpen(false)}
				destroyOnHidden
				width={448}
				title={<div className={styles.drawerTitle}>{t("summary.title")}</div>}
			>
				<ConfigurationSummaryContent {...props} />
			</Drawer>
		</>
	);
}

export function TemplateConfigurationSummary(props: ConfigurationSummaryProps) {
	const { t } = useTranslation("templates");
	const narrow = useIsMobile(1280);
	return (
		<div className={styles.summaryAside}>
			{narrow ? (
				<ConfigurationSummaryDrawer {...props} />
			) : (
				<section aria-label={t("summary.title")} className={styles.summaryCard}>
					<header className={styles.summaryCardHeader}>
						<h3 className={styles.summaryCardTitle}>{t("summary.title")}</h3>
					</header>
					<div className={styles.summaryCardBody}>
						<ConfigurationSummaryContent {...props} />
					</div>
				</section>
			)}
		</div>
	);
}
