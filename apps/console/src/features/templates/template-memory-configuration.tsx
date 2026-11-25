import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui";
import { Button, Input, Select } from "antd";
import { type Ref, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import { formRowClass, formRowIndent, formRowLabelClass } from "../../lib/form-row.ts";
import styles from "./template-forms.module.less";
import {
	emptyTemplateMemory,
	importedTemplateMemory,
	MAX_TEMPLATE_MEMORIES,
	memoryNeedsCreation,
	type TemplateMemoryDraft,
	validateTemplateMemories,
} from "./template-memory-draft.ts";
import { TemplateMemoryEntries } from "./template-memory-entries.tsx";
import { TemplateMemoryPicker } from "./template-memory-picker.tsx";
import { type MemoryFormHandle, useTemplateMemoryForm } from "./use-template-memory-form.ts";

function useMemoryFieldsModel(row: TemplateMemoryDraft) {
	const client = useMemo(getAdminClient, []);
	const detail = useAdminQuery(
		`templates:memory-configuration:${row.memory_store_id}`,
		(signal) =>
			row.local
				? client.draftResources.memoryStoreConfiguration(row.local.projectName, row.local.id, signal)
				: client.remoteMemoryStoreConfiguration(row.memory_store_id, signal),
		{ enabled: !row.creation && !row.configuration && !row.referenceOnly },
	);
	const current =
		!row.creation && !row.configuration && !row.referenceOnly && detail.data
			? importedTemplateMemory(row, detail.data)
			: row;
	return {
		detail,
		current,
		configuration: current.creation ?? current.configuration,
		modified: Boolean(current.configuration && memoryNeedsCreation(current)),
		restricted: current.configuration?.restricted ?? [],
	};
}

function MemoryFields({
	row,
	index,
	disabled,
	onChange,
	onRemove,
	onEditingChange,
}: {
	row: TemplateMemoryDraft;
	index: number;
	disabled: boolean;
	onChange: (row: TemplateMemoryDraft) => void;
	onRemove: () => void;
	onEditingChange: (editing: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const model = useMemoryFieldsModel(row);
	const { current, configuration, modified, restricted } = model;
	const id = useId();
	function updateConfiguration(patch: Partial<NonNullable<TemplateMemoryDraft["creation"]>>) {
		onChange(
			current.configuration
				? { ...current, configuration: { ...current.configuration, ...patch } }
				: { ...current, creation: { description: "", ...current.creation, ...patch } },
		);
	}
	return (
		<fieldset disabled={disabled} className={styles.resourceCard}>
			<legend className={styles.legendNote}>{t("memory.fields.index", { index: index + 1 })}</legend>
			<fieldset disabled={restricted.length > 0} className={styles.configFields}>
				<div className={formRowClass}>
					<label htmlFor={`${id}-name`} className={formRowLabelClass}>
						{t("memory.fields.name")}{" "}
						<span aria-hidden="true" className={styles.errorColor}>
							*
						</span>
					</label>
					<div className={styles.shrinkRoot}>
						<Input
							id={`${id}-name`}
							aria-label={t("memory.fields.nameAria")}
							value={current.name ?? ""}
							readOnly={!configuration}
							required
							maxLength={64}
							placeholder={t("memory.fields.namePlaceholder")}
							onChange={(event) => onChange({ ...current, name: event.target.value })}
						/>
					</div>
				</div>
				{configuration ? (
					<>
						<div className={formRowClass}>
							<label htmlFor={`${id}-description`} className={formRowLabelClass}>
								{t("memory.fields.description")}
							</label>
							<div className={styles.shrinkRoot}>
								<Input.TextArea
									id={`${id}-description`}
									aria-label={t("memory.fields.description")}
									rows={3}
									value={configuration.description}
									onChange={(event) => updateConfiguration({ description: event.target.value })}
								/>
							</div>
						</div>
						<TemplateMemoryEntries
							value={configuration.entries ?? []}
							onChange={(entries) => updateConfiguration({ entries })}
							disabled={disabled || restricted.length > 0}
							onEditingChange={onEditingChange}
						/>
					</>
				) : row.referenceOnly ? (
					<div className={`${styles.referenceNote} ${formRowIndent}`}>
						<p>{t("memory.fields.referenceNote")}</p>
						<Button onClick={() => onChange({ ...row, referenceOnly: undefined })}>
							{t("memory.fields.readToEdit")}
						</Button>
					</div>
				) : model.detail.error ? (
					<ErrorState message={model.detail.error} onRetry={() => void model.detail.refresh()} />
				) : (
					<EmptyState loading title={t("memory.fields.loading")} />
				)}
			</fieldset>
			{restricted.length ? (
				<p role="status" className={styles.mutedOnly}>
					{t("memory.fields.restricted", { fields: restricted.join(t("memory.fields.restoreSeparator")) })}
				</p>
			) : null}
			{modified ? <p className={styles.mutedOnly}>{t("memory.fields.modified")}</p> : null}
			<div className={formRowClass}>
				<label htmlFor={`${id}-access`} className={formRowLabelClass}>
					{t("memory.fields.access")}
				</label>
				<div className={styles.shrinkRoot}>
					<Select
						id={`${id}-access`}
						aria-label={t("memory.fields.access")}
						className={styles.fullControl}
						value={row.access}
						onChange={(access) => onChange({ ...current, access: access === "read_only" ? "read_only" : "read_write" })}
						options={[
							{ value: "read_only", label: t("memory.fields.readOnly") },
							{ value: "read_write", label: t("memory.fields.readWrite") },
						]}
					/>
				</div>
			</div>
			<div className={formRowClass}>
				<label htmlFor={`${id}-instructions`} className={formRowLabelClass}>
					{t("memory.fields.instructions")}
				</label>
				<div className={styles.shrinkRoot}>
					<Input.TextArea
						id={`${id}-instructions`}
						aria-label={t("memory.fields.instructions")}
						rows={3}
						maxLength={4090}
						placeholder={t("memory.fields.instructionsPlaceholder")}
						value={row.instructions}
						onChange={(event) => onChange({ ...current, instructions: event.target.value })}
					/>
				</div>
			</div>
			<div className={styles.drawerFooter}>
				{modified && current.configuration ? (
					<Button
						onClick={() => onChange({ ...row, name: current.configuration!.originalName, configuration: undefined })}
					>
						{t("memory.fields.restore")}
					</Button>
				) : null}
				<Button aria-label={t("memory.fields.removeAria", { index: index + 1 })} onClick={onRemove}>
					{t("memory.fields.remove")}
				</Button>
			</div>
		</fieldset>
	);
}

export function TemplateMemoryConfiguration({
	value,
	onChange,
	formRef,
	onPendingChange,
}: {
	value: TemplateMemoryDraft[];
	onChange: (rows: TemplateMemoryDraft[]) => void;
	formRef: Ref<MemoryFormHandle>;
	onPendingChange?: (pending: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const [initialRow] = useState(emptyTemplateMemory);
	const [editing, setEditing] = useState(false);
	const [importing, setImporting] = useState(false);
	const model = useTemplateMemoryForm(value, onChange, formRef, editing || importing, onPendingChange);
	const rows = value.length ? value : [initialRow];
	const disabled = model.busy || model.identity.data?.role !== "admin";
	const error = [validateTemplateMemories(value), model.error].find(
		(message) => message && message !== t("memory.errors.nameRequired"),
	);
	return (
		<section aria-label={t("memory.config.title")} className={styles.configRoot}>
			<header className={styles.configHeader}>
				<h3 className={styles.sectionTitle}>{t("memory.config.title")}</h3>
				<p className={styles.mutedOnly}>{t("memory.config.hint", { max: MAX_TEMPLATE_MEMORIES })}</p>
			</header>
			<div className={styles.configBody}>
				<div className={styles.rowStart}>
					<TemplateMemoryPicker value={value} onChange={onChange} onPendingChange={setImporting} />
					<Button disabled={model.busy || !value.length} onClick={() => onChange([])}>
						{t("memory.config.clear")}
					</Button>
				</div>
				{model.identity.error ? (
					<ErrorState message={model.identity.error} onRetry={() => void model.identity.refresh()} />
				) : null}
				{model.names.error ? (
					<ErrorState message={model.names.error} onRetry={() => void model.names.refresh()} />
				) : null}
				{rows.map((row, index) => (
					<MemoryFields
						key={row.key}
						row={row}
						index={index}
						disabled={disabled}
						onChange={(next) => onChange(rows.map((item) => (item.key === row.key ? next : item)))}
						onRemove={() => onChange(value.filter((item) => item.key !== row.key))}
						onEditingChange={setEditing}
					/>
				))}
				<Button
					disabled={disabled || rows.length >= MAX_TEMPLATE_MEMORIES}
					onClick={() => onChange(value.length ? [...value, emptyTemplateMemory()] : [initialRow])}
				>
					{t("memory.fields.add")}
				</Button>
				{error ? <ErrorState message={error} /> : null}
			</div>
		</section>
	);
}
