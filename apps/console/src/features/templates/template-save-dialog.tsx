import { KitError, type TemplateCreateInput, type TemplateView } from "@openagentkit/sdk/protocol";
import { Alert, Button, Modal } from "antd";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminMutation } from "../../lib/admin/use-admin-mutation.ts";
import { getAdminClient } from "../../lib/api.ts";
import { TemplateNameField, validateTemplateName } from "./template-name-field.tsx";
import styles from "./template-pages.module.less";

function useTemplateSave(input: Omit<TemplateCreateInput, "name">, name: string, editingTemplate?: TemplateView) {
	const { t } = useTranslation("templates");
	const client = useMemo(getAdminClient, []);
	const [conflict, setConflict] = useState(false);
	const save = useAdminMutation(async () => {
		setConflict(false);
		try {
			const value = { ...input, name: name.trim() };
			return editingTemplate
				? await client.templates.update(editingTemplate.template_id, {
						...value,
						base_version: editingTemplate.version,
					})
				: await client.templates.create(value);
		} catch (error) {
			setConflict(Boolean(editingTemplate) && error instanceof KitError && error.status === 409);
			throw error;
		}
	});
	const error = save.error && conflict ? `${save.error}${t("save.conflictSuffix")}` : save.error;
	return { ...save, error };
}

/** 保存本地模版配置；编辑态需二次确认，确认弹窗不阻塞草稿。 */
export function TemplateSaveDialog({
	opener,
	name,
	onNameChange,
	input,
	editingTemplate,
	onClose,
	onSaved,
	onPendingChange,
}: {
	opener: HTMLElement;
	name: string;
	onNameChange: (name: string) => void;
	input: Omit<TemplateCreateInput, "name">;
	editingTemplate?: TemplateView;
	onClose: () => void;
	onSaved: (template: TemplateView) => void;
	onPendingChange: (pending: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const formId = useId();
	const [confirming, setConfirming] = useState(false);
	const save = useTemplateSave(input, name, editingTemplate);
	const nameError = validateTemplateName(name);
	const copy = editingTemplate
		? {
				title: t("save.editTitle"),
				saveLabel: t("save.editTitle"),
				description: t("save.editDescription"),
			}
		: {
				title: t("save.createTitle"),
				saveLabel: t("save.createLabel"),
				description: t("save.createDescription"),
			};
	function submit() {
		if (save.pending || nameError) return;
		void save
			.run()
			.then(onSaved)
			.catch(() => setConfirming(false));
	}
	useEffect(() => {
		onPendingChange(save.pending);
		return () => onPendingChange(false);
	}, [save.pending, onPendingChange]);
	const restoreFocus = () => {
		setTimeout(() => {
			if (opener.isConnected) opener.focus({ preventScroll: true });
		});
	};
	const close = () => {
		if (save.pending || confirming) return;
		onClose();
		restoreFocus();
	};
	return (
		<>
			<Modal
				open
				centered
				width={512}
				title={copy.title}
				closable={!save.pending && !confirming}
				keyboard={!save.pending && !confirming}
				maskClosable={!save.pending && !confirming}
				onCancel={close}
				footer={
					<div className={styles.formActions}>
						<Button disabled={save.pending} onClick={close}>
							{t("cancel")}
						</Button>
						<Button type="primary" htmlType="submit" form={formId} loading={save.pending} disabled={Boolean(nameError)}>
							{copy.saveLabel}
						</Button>
					</div>
				}
			>
				<p className={styles.formNote}>{copy.description}</p>
				<form
					id={formId}
					className={styles.saveForm}
					aria-busy={save.pending}
					onSubmit={(event) => {
						event.preventDefault();
						if (save.pending || confirming || nameError) return;
						if (editingTemplate) setConfirming(true);
						else submit();
					}}
				>
					<TemplateNameField value={name} onChange={onNameChange} disabled={save.pending} />
					{save.error ? <Alert type="error" showIcon message={save.error} /> : null}
				</form>
			</Modal>
			<Modal
				open={confirming}
				centered
				width={320}
				title={t("save.confirmTitle")}
				maskClosable={false}
				onCancel={() => setConfirming(false)}
				footer={
					<div className={styles.formActions}>
						<Button onClick={() => setConfirming(false)}>{t("cancel")}</Button>
						<Button type="primary" loading={save.pending} onClick={submit}>
							{save.pending ? t("save.saving") : t("save.confirm")}
						</Button>
					</div>
				}
			>
				<p>{t("save.confirmBody")}</p>
			</Modal>
		</>
	);
}
