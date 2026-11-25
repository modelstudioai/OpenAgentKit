import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { RemoteResourcePicker } from "../catalog/remote-resource-picker.tsx";
import { MANAGED_AGENT_MODELS, managedAgentModelLabel } from "./managed-agent-models.ts";

const refresh = async () => undefined;

/** 当前模型目录固定在本地；只展示名称，选中后保存实际模型 ID。 */
export function TemplateAgentModelPicker({
	value,
	onChange,
	error,
	disabled,
	triggerRef,
	options = MANAGED_AGENT_MODELS,
}: {
	value: string;
	onChange: (id: string) => void;
	error?: string;
	disabled?: boolean;
	triggerRef?: Ref<{ focus: () => void }>;
	options?: readonly { id: string; name: string }[];
}) {
	const { t } = useTranslation("templates");
	const choices = (options ?? MANAGED_AGENT_MODELS).map((option) => ({
		...option,
		name: managedAgentModelLabel(option),
	}));
	return (
		<RemoteResourcePicker
			label={t("agent.form.model")}
			resource={t("agent.form.model")}
			placeholder={t("agent.modelPicker.placeholder")}
			required
			error={error}
			disabled={disabled}
			triggerRef={triggerRef}
			showId={false}
			emptyText={t("agent.modelPicker.empty")}
			value={value}
			onChange={onChange}
			remote={{ data: choices, loading: false, error: null, refresh }}
		/>
	);
}
