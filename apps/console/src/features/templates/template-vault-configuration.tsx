import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui";
import { Button, Input } from "antd";
import { type Ref, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { formRowClass, formRowLabelClass } from "../../lib/form-row.ts";
import styles from "./template-forms.module.less";
import { TemplateVaultCredentials } from "./template-vault-credentials.tsx";
import { useTemplateVaultDetail } from "./template-vault-detail-drawer.tsx";
import {
	emptyTemplateVault,
	importedTemplateVault,
	MAX_TEMPLATE_VAULTS,
	type TemplateVaultDraft,
	validateTemplateVaults,
	vaultNeedsCreation,
} from "./template-vault-draft.ts";
import { TemplateVaultPicker } from "./template-vault-picker.tsx";
import { useTemplateVaultForm, type VaultFormHandle } from "./use-template-vault-form.ts";

function useVaultFieldsModel(row: TemplateVaultDraft) {
	const detail = useTemplateVaultDetail(row, !row.creation && !row.configuration);
	const current = !row.creation && !row.configuration && detail.data ? importedTemplateVault(row, detail.data) : row;
	return {
		detail,
		current,
		editable: Boolean(current.creation || current.configuration),
		credentials: current.creation?.credentials ?? current.configuration?.credentials ?? [],
		modified: Boolean(current.configuration && vaultNeedsCreation(current)),
	};
}

function VaultFields({
	row,
	index,
	disabled,
	name,
	onChange,
	onRemove,
	onEditingChange,
}: {
	row: TemplateVaultDraft;
	index: number;
	disabled: boolean;
	name?: string;
	onChange: (row: TemplateVaultDraft) => void;
	onRemove: () => void;
	onEditingChange: (editing: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const { detail, current, editable, credentials, modified } = useVaultFieldsModel(row);
	const id = useId();
	return (
		<fieldset disabled={disabled} className={styles.resourceCard}>
			<legend className={styles.legendNote}>{t("vault.fields.index", { index: index + 1 })}</legend>
			<div className={formRowClass}>
				<label htmlFor={`${id}-name`} className={formRowLabelClass}>
					{t("vault.fields.name")}{" "}
					{editable ? (
						<span aria-hidden="true" className={styles.errorColor}>
							*
						</span>
					) : null}
				</label>
				<div className={styles.shrinkRoot}>
					<Input
						id={`${id}-name`}
						aria-label={t("vault.fields.nameAria")}
						value={current.name || (editable ? "" : name || row.vault_id)}
						readOnly={!editable}
						required={editable}
						maxLength={50}
						placeholder={t("vault.fields.namePlaceholder")}
						onChange={(event) => onChange({ ...current, name: event.target.value })}
					/>
				</div>
			</div>
			{editable ? (
				<>
					<TemplateVaultCredentials
						value={credentials}
						onChange={(credentials) =>
							onChange(
								current.configuration
									? { ...current, configuration: { ...current.configuration, credentials } }
									: { ...current, creation: { credentials } },
							)
						}
						disabled={disabled}
						onEditingChange={onEditingChange}
						requireValues={modified}
					/>
					{modified ? <p className={styles.metaText}>{t("vault.fields.modified")}</p> : null}
					{credentials.some((item) => item.input.secret_value) ? (
						<p className={styles.metaText}>{t("vault.fields.tempSecret")}</p>
					) : null}
				</>
			) : detail.error ? (
				<ErrorState message={detail.error} onRetry={() => void detail.refresh()} />
			) : (
				<EmptyState loading title={t("vault.fields.loading")} />
			)}
			<div className={styles.drawerFooter}>
				{modified && current.configuration ? (
					<Button
						onClick={() =>
							onChange({ vault_id: row.vault_id, name: current.configuration!.originalName, local: row.local })
						}
					>
						{t("vault.fields.restore")}
					</Button>
				) : null}
				<Button aria-label={t("vault.fields.removeAria", { index: index + 1 })} onClick={onRemove}>
					{t("vault.fields.remove")}
				</Button>
			</div>
		</fieldset>
	);
}

export function TemplateVaultConfiguration({
	value,
	onChange,
	formRef,
	onPendingChange,
}: {
	value: TemplateVaultDraft[];
	onChange: (rows: TemplateVaultDraft[]) => void;
	formRef: Ref<VaultFormHandle>;
	onPendingChange?: (pending: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const [initialRow] = useState(emptyTemplateVault);
	const [editing, setEditing] = useState(false);
	const model = useTemplateVaultForm(value, onChange, formRef, editing, onPendingChange);
	const rows = value.length ? value : [initialRow];
	const disabled = model.busy || model.identity.data?.role !== "admin";
	const error = [validateTemplateVaults(value), model.error].find(
		(message) => message && message !== t("vault.errors.nameRequired"),
	);
	return (
		<section aria-label={t("vault.config.title")} className={styles.configRoot}>
			<header className={styles.configHeader}>
				<h3 className={styles.sectionTitle}>{t("vault.config.title")}</h3>
				<p className={styles.mutedOnly}>{t("vault.config.hint", { max: MAX_TEMPLATE_VAULTS })}</p>
			</header>
			<div className={styles.configBody}>
				<div className={styles.rowStart}>
					<TemplateVaultPicker value={value} onChange={onChange} />
					<Button disabled={model.busy || !value.length} onClick={() => onChange([])}>
						{t("vault.config.clear")}
					</Button>
				</div>
				{model.identity.error ? (
					<ErrorState message={model.identity.error} onRetry={() => void model.identity.refresh()} />
				) : null}
				{model.names.error ? (
					<ErrorState message={model.names.error} onRetry={() => void model.names.refresh()} />
				) : null}
				{rows.map((row, index) => (
					<VaultFields
						key={row.vault_id}
						row={row}
						index={index}
						disabled={disabled}
						name={model.names.data?.find((item) => item.vault_id === row.vault_id)?.name}
						onChange={(next) => onChange(rows.map((item) => (item.vault_id === row.vault_id ? next : item)))}
						onRemove={() => onChange(value.filter((item) => item.vault_id !== row.vault_id))}
						onEditingChange={setEditing}
					/>
				))}
				<Button
					disabled={disabled || rows.length >= MAX_TEMPLATE_VAULTS}
					onClick={() => onChange(value.length ? [...value, emptyTemplateVault()] : [initialRow])}
				>
					{t("vault.config.add")}
				</Button>
				{error ? <ErrorState message={error} /> : null}
			</div>
		</section>
	);
}
