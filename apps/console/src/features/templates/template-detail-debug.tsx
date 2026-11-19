import { EmptyState } from "@openagentpack/kit-chat-ui";
import type { TemplateVersionView } from "@openagentpack/kit-sdk/protocol";
import { useTranslation } from "react-i18next";
import { TemplateDebugPreview } from "./template-debug-preview.tsx";

/** 按详情所选版本挂载；离开调试 Tab 或切换版本时释放自建会话。 */
export function TemplateDetailDebug({
	template,
	canDebug,
	readOnly,
	onBusyChange,
}: {
	template: TemplateVersionView;
	canDebug: boolean;
	readOnly: boolean;
	onBusyChange: (busy: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	if (canDebug)
		return (
			<TemplateDebugPreview
				input={{
					remote_agent_id: template.remote_agent_id,
					agent_version: template.agent_version,
					remote_environment_id: template.remote_environment_id,
					files: template.files,
					memory_stores: template.memory_stores,
					vault_ids: template.vault_ids,
					title: t("workflow.previewTitle", { name: `${template.name} · v${template.version}` }),
				}}
				agent={{ agent_id: template.remote_agent_id, name: template.remote_agent_name }}
				name={template.name}
				presentation={{
					description: template.description,
					opening_remarks: template.opening_remarks,
					suggested_prompts: template.suggested_prompts,
				}}
				onBusyChange={onBusyChange}
			/>
		);
	return <EmptyState loading={!readOnly} title={readOnly ? t("debug.detailReadOnly") : t("debug.detailLoading")} />;
}
