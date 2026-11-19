import type { TemplateView } from "@openagentpack/kit-sdk/protocol";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { plazaCategoryLabel } from "../catalog/plaza-categories.ts";
import styles from "./template-resources.module.less";
import {
	SavedAgentConfiguration,
	SavedEnvironmentConfiguration,
	SavedMemoryConfiguration,
} from "./template-saved-resources.tsx";
import { TemplateVaultDetail } from "./template-vault-detail-drawer.tsx";

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section aria-label={title} className={styles.detailSection}>
			<h3 className={styles.detailSectionTitle}>{title}</h3>
			{children}
		</section>
	);
}

export function SavedConfiguration({ template }: { template: Omit<TemplateView, "listing" | "updated_at"> }) {
	const { t } = useTranslation("templates");
	const { t: tc } = useTranslation("catalog");
	return (
		<div className={styles.savedRoot}>
			<DetailSection title={t("savedConfig.presentation")}>
				<dl className={styles.presentationList}>
					<div>
						<dt className={styles.termLabel}>{t("savedConfig.name")}</dt>
						<dd className={styles.termValue}>{template.name}</dd>
					</div>
					<div>
						<dt className={styles.termLabel}>{t("savedConfig.category")}</dt>
						<dd className={styles.termValue}>{plazaCategoryLabel(template.category, tc)}</dd>
					</div>
					<div>
						<dt className={styles.termLabel}>{t("savedConfig.description")}</dt>
						<dd className={styles.termValuePre}>{template.description || t("savedConfig.notConfigured")}</dd>
					</div>
					<div>
						<dt className={styles.termLabel}>{t("savedConfig.opening")}</dt>
						<dd className={styles.termValuePre}>{template.opening_remarks || t("savedConfig.notConfigured")}</dd>
					</div>
					<div>
						<dt className={styles.termLabel}>{t("savedConfig.prompts")}</dt>
						<dd className={styles.termValue}>
							{template.suggested_prompts.length ? (
								<ol className={styles.promptList}>
									{template.suggested_prompts.map((prompt, index) => (
										<li key={`${index}:${prompt}`}>{prompt}</li>
									))}
								</ol>
							) : (
								t("savedConfig.notConfigured")
							)}
						</dd>
					</div>
				</dl>
			</DetailSection>
			<DetailSection title={t("savedConfig.base")}>
				<SavedAgentConfiguration template={template} />
			</DetailSection>
			<p className={styles.sectionNote}>{t("savedConfig.resourcesNote")}</p>
			<DetailSection title={t("savedConfig.environment")}>
				{template.remote_environment_id ? (
					<SavedEnvironmentConfiguration id={template.remote_environment_id} name={template.remote_environment_name} />
				) : (
					<p className={styles.mutedNote}>{t("savedConfig.defaultEnvironment")}</p>
				)}
			</DetailSection>
			<DetailSection title={t("savedConfig.files")}>
				{template.files.length ? (
					<ul className={styles.savedFileList}>
						{template.files.map((file) => (
							<li key={file.file_id} className={styles.savedFileItem}>
								<p className={styles.fileName}>{file.filename || file.file_id}</p>
								<p className={styles.fileId}>{file.file_id}</p>
								{file.mount_path ? (
									<p>
										{t("savedConfig.mountPath")}
										{file.mount_path}
									</p>
								) : null}
								{file.size !== undefined ? (
									<p>{t("savedConfig.size", { size: file.size.toLocaleString("zh-CN") })}</p>
								) : null}
							</li>
						))}
					</ul>
				) : (
					<p className={styles.mutedNote}>{t("savedConfig.notSelectedFiles")}</p>
				)}
			</DetailSection>
			<DetailSection title={t("savedConfig.memories")}>
				{template.memory_stores.length ? (
					<ul className={styles.savedMemoryList}>
						{template.memory_stores.map((memory) => (
							<li key={memory.memory_store_id} className={styles.memoryItem}>
								<SavedMemoryConfiguration memory={memory} />
							</li>
						))}
					</ul>
				) : (
					<p className={styles.mutedNote}>{t("savedConfig.notSelectedMemories")}</p>
				)}
			</DetailSection>
			<DetailSection title={t("savedConfig.vaults")}>
				{template.vault_ids.length ? (
					<ul className={styles.vaultList}>
						{template.vault_ids.map((id) => (
							<li key={id}>
								<TemplateVaultDetail vault={{ vault_id: id, name: id }} />
							</li>
						))}
					</ul>
				) : (
					<p className={styles.mutedNote}>{t("savedConfig.notSelectedVaults")}</p>
				)}
			</DetailSection>
		</div>
	);
}
