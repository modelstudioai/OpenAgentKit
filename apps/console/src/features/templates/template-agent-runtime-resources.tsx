import type { PresetPackAgentResources, PresetPackPreview } from "@openagentkit/sdk/protocol";
import { Alert, Button, Drawer, Modal, Spin } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PresetPackResourceSelection, usePresetPackResources } from "../preset-packs/preset-pack-session-resources.tsx";
import type { TemplateAgentSelection } from "./template-local-resources.tsx";

function DetectionStatus({
	query,
	checking,
	onClose,
}: {
	query: ReturnType<typeof usePresetPackResources>;
	checking: boolean;
	onClose: () => void;
}) {
	const { t } = useTranslation("templates");
	return (
		<section aria-label={t("agent.runtime.detectAria")} className="space-y-4">
			{checking ? (
				<div role="status" className="flex items-center gap-2">
					<Spin size="small" />
					{t("agent.runtime.checking")}
				</div>
			) : (
				<Alert
					type={query.error ? "error" : "warning"}
					showIcon
					title={query.error ? t("agent.runtime.detectFailed") : t("agent.runtime.incomplete")}
					description={query.error ?? t("agent.runtime.incompleteHint")}
					action={<Button onClick={() => void query.refresh()}>{t("retry")}</Button>}
				/>
			)}
			<Button onClick={onClose}>{t("agent.runtime.cancelDetect")}</Button>
		</section>
	);
}

/** 仅由基础配置的显式远端选择挂载；取消或离开即释放查询，不对已有表单做自动回填。 */
export function TemplateAgentRuntimeResources({
	agent,
	initialResources,
	onApply,
	onClose,
}: {
	agent: TemplateAgentSelection;
	initialResources?: PresetPackAgentResources;
	onApply: (preset: PresetPackPreview) => void;
	onClose: () => void;
}) {
	const { t } = useTranslation("templates");
	const query = usePresetPackResources(agent.agent_id, { initialData: initialResources });
	const [phase, setPhase] = useState<"prompt" | "opening" | "select" | "closing">("prompt");
	const [preparing, setPreparing] = useState(false);
	const [actionContainer, setActionContainer] = useState<HTMLDivElement | null>(null);
	const [feedbackContainer, setFeedbackContainer] = useState<HTMLDivElement | null>(null);
	const hasResources = Boolean(query.data?.sessions.some((session) => session.resources.length));
	const checking = query.loading || (!query.data && !query.error);
	useEffect(() => {
		if (!checking && !query.error && query.data?.complete && !hasResources) onClose();
	}, [checking, query.error, query.data, hasResources, onClose]);
	const closeSelection = () => {
		if (!preparing) setPhase("closing");
	};
	return (
		<>
			{checking || query.error || (!hasResources && query.data && !query.data.complete) ? (
				<DetectionStatus query={query} checking={checking} onClose={onClose} />
			) : null}
			<Modal
				title={t("agent.runtime.title")}
				open={!checking && !query.error && hasResources && phase === "prompt"}
				okText={t("agent.runtime.ok")}
				cancelText={t("cancel")}
				onOk={() => setPhase("opening")}
				onCancel={closeSelection}
				afterOpenChange={(visible) => {
					if (visible) return;
					if (phase === "opening") setPhase("select");
					else if (phase === "closing") onClose();
				}}
			>
				<p>{t("agent.runtime.prompt")}</p>
			</Modal>
			<Drawer
				title={t("agent.runtime.selectTitle")}
				size="large"
				open={phase === "select"}
				onClose={closeSelection}
				closable={!preparing}
				maskClosable={!preparing}
				keyboard={!preparing}
				destroyOnHidden
				afterOpenChange={(visible) => {
					if (!visible && phase === "closing") onClose();
				}}
				footer={
					<div className="space-y-4">
						<div ref={setFeedbackContainer} className="empty:hidden" />
						<div className="flex justify-end gap-2">
							<Button disabled={preparing} onClick={closeSelection}>
								{t("cancel")}
							</Button>
							<div ref={setActionContainer} />
						</div>
					</div>
				}
			>
				<p className="mb-4 text-sm">{t("agent.runtime.hint")}</p>
				<PresetPackResourceSelection
					agent={{ ...agent, version: agent.agent_version ?? agent.version }}
					query={query}
					requireSelection
					actionLabel={t("agent.runtime.action")}
					actionContainer={actionContainer}
					feedbackContainer={feedbackContainer}
					onPendingChange={setPreparing}
					onImport={(preset) => {
						onApply(preset);
						setPhase("closing");
					}}
				/>
			</Drawer>
		</>
	);
}
