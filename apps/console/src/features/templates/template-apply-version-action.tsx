import { ConfirmDialog } from "@openagentpack/kit-chat-ui";
import { KitError, type TemplateVersionView, type TemplateView } from "@openagentpack/kit-sdk/protocol";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminMutation } from "../../lib/admin/use-admin-mutation.ts";
import { getAdminClient } from "../../lib/api.ts";
import { primaryButtonClass } from "../../lib/styles.ts";
import styles from "./template-pages.module.less";

/** 通过既有更新事务追加新版本；只提交配置字段，不覆写历史快照或降低版本号。 */
export function TemplateApplyVersionAction({
	template,
	currentVersion,
	disabled = false,
	onApplied,
	onPendingChange,
}: {
	template: TemplateVersionView;
	currentVersion: number;
	disabled?: boolean;
	onApplied: (template: TemplateView) => void;
	onPendingChange: (pending: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const client = useMemo(getAdminClient, []);
	const [confirming, setConfirming] = useState(false);
	const [conflict, setConflict] = useState(false);
	const apply = useAdminMutation(async () => {
		try {
			return await client.templates.update(template.template_id, {
				base_version: currentVersion,
				name: template.name,
				category: template.category,
				remote_agent_id: template.remote_agent_id,
				agent_version: template.agent_version,
				remote_environment_id: template.remote_environment_id,
				files: template.files,
				memory_stores: template.memory_stores,
				vault_ids: template.vault_ids,
				description: template.description,
				opening_remarks: template.opening_remarks,
				suggested_prompts: template.suggested_prompts,
			});
		} catch (error) {
			setConflict(error instanceof KitError && error.status === 409);
			throw error;
		}
	});
	useEffect(() => {
		onPendingChange(apply.pending);
		return () => onPendingChange(false);
	}, [apply.pending, onPendingChange]);
	return (
		<div className={styles.actionRoot}>
			<button
				type="button"
				className={primaryButtonClass}
				disabled={disabled || apply.pending || conflict}
				onClick={() => setConfirming(true)}
			>
				{t("agent.apply.button")}
			</button>
			{apply.error ? (
				<p role="alert" className={styles.actionError}>
					{apply.error}
					{conflict ? t("agent.apply.conflict") : null}
				</p>
			) : null}
			{confirming ? (
				<ConfirmDialog
					title={t("agent.apply.title")}
					body={t("agent.apply.body")}
					danger={false}
					confirmLabel={apply.pending ? t("agent.apply.pending") : t("agent.apply.confirm")}
					busy={apply.pending}
					onCancel={() => setConfirming(false)}
					onConfirm={() => {
						if (disabled || apply.pending || conflict) return;
						void apply
							.run()
							.then(onApplied)
							.catch(() => setConfirming(false));
					}}
				/>
			) : null}
		</div>
	);
}
