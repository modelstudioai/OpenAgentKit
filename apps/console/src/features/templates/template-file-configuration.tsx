import { ErrorState, FileCard } from "@openagentpack/kit-chat-ui";
import { Button } from "antd";
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import {
	MAX_TEMPLATE_FILES,
	pendingTemplateFile,
	type TemplateFileDraft,
	validateTemplateFiles,
	withFileMountPaths,
} from "./template-file-draft.ts";
import { TemplateFileDropzone } from "./template-file-dropzone.tsx";
import { TemplateFilePicker } from "./template-file-picker.tsx";
import styles from "./template-forms.module.less";
import { type FileFormHandle, useTemplateFileForm } from "./use-template-file-form.ts";

function FileFields({
	file,
	onChange,
	onRemove,
	disabled,
}: {
	file: TemplateFileDraft;
	onChange: (file: TemplateFileDraft) => void;
	onRemove: () => void;
	disabled: boolean;
}) {
	const { t } = useTranslation("templates");
	return (
		<li className={styles.fileItem}>
			<FileCard
				name={file.filename || file.file_id}
				type={file.pending?.file.type}
				className={styles.fileCard}
				description={
					file.pending ? t("file.card.pending") : file.local ? t("file.card.pendingPublish") : t("file.card.cloud")
				}
			/>
			<div className={styles.fileActions}>
				{file.pending?.original ? (
					<Button disabled={disabled} onClick={() => onChange(file.pending!.original!)}>
						{t("file.actions.restore")}
					</Button>
				) : null}
				<Button disabled={disabled} onClick={onRemove}>
					{t("file.actions.remove")}
				</Button>
			</div>
		</li>
	);
}

export function TemplateFileConfiguration({
	value,
	onChange,
	formRef,
	onPendingChange,
}: {
	value: TemplateFileDraft[];
	onChange: (files: TemplateFileDraft[]) => void;
	formRef: Ref<FileFormHandle>;
	onPendingChange?: (pending: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const model = useTemplateFileForm(value, formRef, onPendingChange);
	const editable = model.identity.data?.role === "admin" && !model.busy;
	const error = validateTemplateFiles(value);
	return (
		<section aria-label={t("file.config.title")} className={styles.configRoot}>
			<header className={styles.configHeader}>
				<h3 className={styles.sectionTitle}>{t("file.config.title")}</h3>
				<p className={styles.configHint}>{t("file.config.hint", { max: MAX_TEMPLATE_FILES })}</p>
			</header>
			<div className={styles.configBody}>
				<div className={styles.rowStart}>
					<TemplateFilePicker value={value} onChange={onChange} />
					<Button disabled={model.busy || !value.length} onClick={() => onChange([])}>
						{t("file.config.clear")}
					</Button>
				</div>
				{model.identity.error ? (
					<ErrorState message={model.identity.error} onRetry={() => void model.identity.refresh()} />
				) : null}
				<TemplateFileDropzone
					disabled={!editable || value.length >= MAX_TEMPLATE_FILES}
					onSelect={(file) => {
						if (file && value.length < MAX_TEMPLATE_FILES)
							onChange(withFileMountPaths([...value, pendingTemplateFile(file)]));
					}}
				/>
				<ul aria-label={t("file.config.listAria")} className={styles.fileList}>
					{value.map((file) => (
						<FileFields
							key={file.file_id}
							file={file}
							disabled={!editable}
							onChange={(next) => onChange(value.map((item) => (item.file_id === file.file_id ? next : item)))}
							onRemove={() => onChange(value.filter((item) => item.file_id !== file.file_id))}
						/>
					))}
				</ul>
				{error || model.error ? <ErrorState message={error || model.error || t("file.config.saveFailed")} /> : null}
			</div>
		</section>
	);
}
