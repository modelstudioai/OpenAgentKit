import { Button, Drawer } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./template-forms.module.less";
import { MAX_TEMPLATE_VAULTS, mergeImportedVaults, type TemplateVaultDraft } from "./template-vault-draft.ts";
import { TemplateVaultSelection } from "./template-vault-selection.tsx";

export function TemplateVaultPicker({
	value,
	onChange,
}: {
	value: TemplateVaultDraft[];
	onChange: (value: TemplateVaultDraft[]) => void;
}) {
	const { t } = useTranslation("templates");
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [selection, setSelection] = useState<TemplateVaultDraft[]>([]);
	const pending = value.filter((row) => row.creation).length;
	return (
		<>
			<Button
				onClick={() => {
					setSelection(
						value.filter((row) => !row.creation).map(({ vault_id, name, local }) => ({ vault_id, name, local })),
					);
					setOpen(true);
				}}
			>
				{t("vault.config.importExisting")}
			</Button>
			<Drawer
				open={open}
				onClose={() => setOpen(false)}
				destroyOnHidden
				width={768}
				title={<div className={styles.drawerTitle}>{t("vault.config.choose")}</div>}
				footer={
					<div className={styles.drawerFooter}>
						<Button onClick={() => setOpen(false)}>{t("cancel")}</Button>
						<Button
							type="primary"
							disabled={selection.length + pending > MAX_TEMPLATE_VAULTS}
							onClick={() => {
								onChange(mergeImportedVaults(value, selection));
								setOpen(false);
							}}
						>
							{t("memory.config.confirm")}
						</Button>
					</div>
				}
			>
				<TemplateVaultSelection
					value={selection}
					onChange={setSelection}
					search={search}
					onSearchChange={setSearch}
					maxVaults={MAX_TEMPLATE_VAULTS - pending}
				/>
			</Drawer>
		</>
	);
}
