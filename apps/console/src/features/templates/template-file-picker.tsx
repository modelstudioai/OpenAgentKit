import { Button, Drawer } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MAX_TEMPLATE_FILES, mergeImportedFiles, type TemplateFileDraft } from "./template-file-draft.ts";
import { TemplateFileSelection } from "./template-file-selection.tsx";
import styles from "./template-forms.module.less";

export function TemplateFilePicker({
	value,
	onChange,
}: {
	value: TemplateFileDraft[];
	onChange: (files: TemplateFileDraft[]) => void;
}) {
	const { t } = useTranslation("templates");
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [selection, setSelection] = useState<TemplateFileDraft[]>([]);
	const newCount = value.filter((file) => file.pending && !file.pending.original).length;
	return (
		<>
			<Button
				onClick={() => {
					setSelection(value.filter((file) => !file.pending || file.pending.original));
					setOpen(true);
				}}
			>
				{t("file.config.importExisting")}
			</Button>
			<Drawer
				open={open}
				onClose={() => setOpen(false)}
				destroyOnHidden
				width={768}
				title={<div className={styles.drawerTitle}>{t("file.config.choose")}</div>}
				footer={
					<div className={styles.drawerFooter}>
						<Button onClick={() => setOpen(false)}>{t("cancel")}</Button>
						<Button
							type="primary"
							disabled={selection.length + newCount > MAX_TEMPLATE_FILES}
							onClick={() => {
								onChange(mergeImportedFiles(value, selection));
								setOpen(false);
							}}
						>
							{t("file.config.confirm")}
						</Button>
					</div>
				}
			>
				<TemplateFileSelection
					value={selection}
					onChange={setSelection}
					search={search}
					onSearchChange={setSearch}
					maxFiles={MAX_TEMPLATE_FILES - newCount}
				/>
			</Drawer>
		</>
	);
}
