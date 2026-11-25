import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./template-forms.module.less";
import { TemplateUploadDropzone } from "./template-upload-dropzone.tsx";

/** 选择只保留浏览器 File，新增资源由下一步统一保存。 */
export function TemplateFileDropzone({ disabled, onSelect }: { disabled: boolean; onSelect: (file: File) => void }) {
	const { t } = useTranslation("templates");
	const [error, setError] = useState("");
	const select = (selection: File[]) => {
		if (disabled || !selection.length) return;
		if (selection.length > 1) {
			setError(t("file.dropzone.singleError"));
			return;
		}
		setError("");
		const file = selection[0];
		if (file) onSelect(file);
	};
	return (
		<div className={styles.dropzoneStack}>
			<TemplateUploadDropzone
				label={t("file.dropzone.label")}
				title={t("file.dropzone.title")}
				hint={t("file.dropzone.hint")}
				disabled={disabled}
				onSelect={select}
			/>
			{error ? (
				<p role="alert" className={styles.errorText}>
					{error}
				</p>
			) : null}
		</div>
	);
}
