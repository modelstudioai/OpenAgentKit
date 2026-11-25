import { Button } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./template-forms.module.less";
import { TemplateVaultCredentialDialog, type VaultCredentialDraft } from "./template-vault-credential-dialog.tsx";

export function TemplateVaultCredentials({
	value,
	onChange,
	disabled,
	onEditingChange,
	requireValues = false,
}: {
	value: VaultCredentialDraft[];
	onChange: (value: VaultCredentialDraft[]) => void;
	disabled: boolean;
	onEditingChange: (value: boolean) => void;
	requireValues?: boolean;
}) {
	const { t } = useTranslation("templates");
	const [editor, setEditor] = useState<{ initial?: VaultCredentialDraft; opener: HTMLButtonElement } | null>(null);
	function open(opener: HTMLElement, initial?: VaultCredentialDraft) {
		// antd Button 只把 currentTarget 声明为 HTMLElement，实际渲染是 <button>。
		setEditor({ initial, opener: opener as HTMLButtonElement });
		onEditingChange(true);
	}
	return (
		<section aria-label={t("vault.credentials.aria")} className={styles.vaultRoot}>
			<div className={styles.vaultHeader}>
				<h3 className={styles.vaultTitle}>
					{value.length ? t("vault.credentials.titleCount", { count: value.length }) : t("vault.credentials.title")}
				</h3>
				<Button size="small" disabled={disabled || value.length >= 100} onClick={(event) => open(event.currentTarget)}>
					{t("vault.credentials.add")}
				</Button>
			</div>
			{value.length ? (
				<ul className={styles.credentialList}>
					{value.map((item) => (
						<li key={item.id} className={styles.credentialItem}>
							<div className={styles.credentialHead}>
								<strong className={styles.credentialName}>{item.input.name}</strong>
								<div className={styles.credentialActions}>
									<Button
										type="link"
										size="small"
										aria-label={t("vault.credentials.editAria", { name: item.input.name })}
										className={styles.linkFlushSm}
										disabled={disabled}
										onClick={(event) => open(event.currentTarget, item)}
									>
										{t("vault.credentials.edit")}
									</Button>
									<Button
										type="link"
										size="small"
										aria-label={t("vault.credentials.removeAria", { name: item.input.name })}
										className={styles.linkFlushSm}
										disabled={disabled}
										onClick={() => onChange(value.filter((entry) => entry.id !== item.id))}
									>
										{t("vault.credentials.remove")}
									</Button>
								</div>
							</div>
							<p className={styles.credentialMeta}>
								{t("vault.credentials.secretMeta", { secretName: item.input.secret_name })}
							</p>
							<p className={styles.credentialMeta}>
								{t("vault.credentials.hosts", {
									hosts: item.input.allowed_hosts.join(t("vault.credentials.joinHosts")),
								})}
							</p>
							{requireValues && !item.input.secret_value ? (
								<p className={styles.credentialMeta}>{t("vault.credentials.missingValue")}</p>
							) : null}
						</li>
					))}
				</ul>
			) : (
				<p className={styles.emptyNote}>{t("vault.credentials.empty")}</p>
			)}
			{editor ? (
				<TemplateVaultCredentialDialog
					initial={editor.initial}
					siblings={value}
					opener={editor.opener}
					onSave={(item) =>
						onChange(editor.initial ? value.map((entry) => (entry.id === item.id ? item : entry)) : [...value, item])
					}
					onClose={() => {
						setEditor(null);
						onEditingChange(false);
					}}
				/>
			) : null}
		</section>
	);
}
