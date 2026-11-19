import { MAX_MEMORY_ENTRIES, MemoryEntrySchema } from "@openagentkit/sdk/protocol";
import { Button, Input, Modal } from "antd";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { localizedValidationMessage } from "../../lib/validation-message.ts";
import styles from "./template-forms.module.less";
import type { TemplateMemoryEntry } from "./template-memory-draft.ts";
import { TemplateMemoryEntryList } from "./template-memory-entry-list.tsx";

function MemoryEntryDialog({
	initial,
	siblings,
	onSave,
	onClose,
}: {
	initial?: TemplateMemoryEntry;
	siblings: TemplateMemoryEntry[];
	onSave: (entry: TemplateMemoryEntry) => void;
	onClose: () => void;
}) {
	const { t } = useTranslation("templates");
	const [key, setKey] = useState(initial?.key ?? "");
	const [content, setContent] = useState(initial?.content ?? "");
	const [error, setError] = useState<string | null>(null);
	const prefix = useId();
	function save() {
		const parsed = MemoryEntrySchema.safeParse({ key, content });
		if (!parsed.success) {
			setError(parsed.error.issues[0] ? localizedValidationMessage(parsed.error.issues[0]) : t("memory.entries.check"));
			return;
		}
		if (siblings.some((entry) => entry.id !== initial?.id && entry.key === parsed.data.key)) {
			setError(t("memory.entries.duplicate"));
			return;
		}
		onSave({ ...parsed.data, id: initial?.id ?? crypto.randomUUID() });
		onClose();
	}
	return (
		<Modal
			open
			centered
			width={672}
			title={initial ? t("memory.entries.editTitle") : t("memory.entries.addTitle")}
			onCancel={onClose}
			styles={{ body: { maxHeight: "calc(100dvh - 260px)", overflowY: "auto" } }}
			footer={
				<div className={styles.drawerFooter}>
					<Button onClick={onClose}>{t("cancel")}</Button>
					<Button type="primary" onClick={save}>
						{initial ? t("memory.entries.save") : t("memory.entries.add")}
					</Button>
				</div>
			}
		>
			<div className={styles.dialogBody}>
				<p className={styles.metaText}>{t("memory.entries.hint")}</p>
				<div className={styles.stack2}>
					<label htmlFor={`${prefix}-key`}>
						{t("memory.entries.path")}{" "}
						<span aria-hidden="true" className={styles.errorColor}>
							*
						</span>
					</label>
					<Input
						id={`${prefix}-key`}
						value={key}
						onChange={(event) => setKey(event.target.value)}
						maxLength={1024}
						placeholder={t("memory.entries.pathPlaceholder")}
					/>
				</div>
				<div className={styles.stack2}>
					<label htmlFor={`${prefix}-content`}>{t("memory.entries.content")}</label>
					<Input.TextArea
						id={`${prefix}-content`}
						rows={10}
						value={content}
						onChange={(event) => setContent(event.target.value)}
						className={styles.monoControl}
					/>
				</div>
				{error ? (
					<p role="alert" className={styles.errorText}>
						{error}
					</p>
				) : null}
			</div>
		</Modal>
	);
}

export function TemplateMemoryEntries({
	value,
	onChange,
	disabled,
	onEditingChange,
}: {
	value: TemplateMemoryEntry[];
	onChange: (entries: TemplateMemoryEntry[]) => void;
	disabled: boolean;
	onEditingChange: (editing: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const [editor, setEditor] = useState<{ initial?: TemplateMemoryEntry; opener: HTMLButtonElement } | null>(null);
	function edit(opener: HTMLElement, initial?: TemplateMemoryEntry) {
		// antd Button 只把 currentTarget 声明为 HTMLElement，实际渲染是 <button>。
		setEditor({ initial, opener: opener as HTMLButtonElement });
		onEditingChange(true);
	}
	return (
		<section aria-label={t("memory.entries.listAria")} className={styles.blockStack}>
			<div className={styles.rowBetween}>
				<h4 className={styles.sectionLabel}>{t("memory.entries.section", { count: value.length })}</h4>
				<Button
					size="small"
					disabled={disabled || value.length >= MAX_MEMORY_ENTRIES}
					onClick={(event) => edit(event.currentTarget)}
				>
					{t("memory.entries.addEntry")}
				</Button>
			</div>
			<TemplateMemoryEntryList
				value={value}
				actions={(entry) => (
					<>
						<Button
							type="link"
							size="small"
							className={styles.linkButton}
							disabled={disabled}
							aria-label={t("memory.entries.editAria", { key: entry.key })}
							onClick={(event) => edit(event.currentTarget, entry)}
						>
							{t("memory.entries.edit")}
						</Button>
						<Button
							type="link"
							size="small"
							className={styles.linkButton}
							disabled={disabled}
							aria-label={t("memory.entries.removeAria", { key: entry.key })}
							onClick={() => onChange(value.filter((item) => item.id !== entry.id))}
						>
							{t("memory.entries.remove")}
						</Button>
					</>
				)}
			/>
			{editor ? (
				<MemoryEntryDialog
					initial={editor.initial}
					siblings={value}
					onSave={(entry) =>
						onChange(editor.initial ? value.map((item) => (item.id === entry.id ? entry : item)) : [...value, entry])
					}
					onClose={() => {
						const opener = editor.opener;
						setEditor(null);
						onEditingChange(false);
						requestAnimationFrame(() => {
							if (opener.isConnected) opener.focus({ preventScroll: true });
						});
					}}
				/>
			) : null}
		</section>
	);
}
