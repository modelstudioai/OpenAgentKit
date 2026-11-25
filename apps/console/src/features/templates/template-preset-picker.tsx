import type { PresetPackPreview } from "@openagentkit/sdk/protocol";
import { ConfirmDialog } from "@openagentpack/kit-chat-ui";
import { Button, Drawer } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PresetPackSelection } from "../preset-packs/preset-pack-selection.tsx";

/** 创建页的远端智能体与资源选择；准备结果只交给当前表单，不保存预设包。 */
export function TemplatePresetPicker({
	buttonLabel,
	disabled,
	hasConfiguration,
	onImport,
	onPendingChange,
}: {
	buttonLabel?: string;
	disabled: boolean;
	hasConfiguration: boolean;
	onImport: (preset: PresetPackPreview) => void;
	onPendingChange: (pending: boolean) => void;
}) {
	const { t } = useTranslation("templates");
	const [open, setOpen] = useState(false);
	const [drawerVisible, setDrawerVisible] = useState(false);
	const [preparing, setPreparing] = useState(false);
	const [pending, setPending] = useState<PresetPackPreview | null>(null);
	useEffect(() => {
		onPendingChange(preparing || Boolean(pending));
		return () => onPendingChange(false);
	}, [preparing, pending, onPendingChange]);
	const close = () => {
		if (!preparing) setOpen(false);
	};
	const showPicker = () => {
		setDrawerVisible(true);
		setOpen(true);
	};
	return (
		<>
			<Button disabled={disabled} onClick={showPicker}>
				{buttonLabel ?? t("preset.import")}
			</Button>
			<Drawer
				open={open}
				size="large"
				title={t("preset.import")}
				onClose={close}
				afterOpenChange={(visible) => {
					if (!visible) setDrawerVisible(false);
				}}
				closable={!preparing}
				maskClosable={!preparing}
				keyboard={!preparing}
				footer={
					<div className="flex justify-end">
						<Button disabled={preparing} onClick={close}>
							{t("cancel")}
						</Button>
					</div>
				}
			>
				<PresetPackSelection
					onPendingChange={setPreparing}
					onImport={(preset) => {
						setOpen(false);
						if (hasConfiguration) setPending(preset);
						else onImport(preset);
					}}
				/>
			</Drawer>
			{pending && !drawerVisible ? (
				<ConfirmDialog
					title={t("preset.replaceTitle")}
					body={t("preset.replaceBody", { name: pending.remote_agent_name, version: pending.agent_version })}
					confirmLabel={t("preset.confirmImport")}
					onCancel={() => {
						setPending(null);
						showPicker();
					}}
					onConfirm={() => {
						const preset = pending;
						setPending(null);
						onImport(preset);
					}}
				/>
			) : null}
		</>
	);
}
