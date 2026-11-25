import type { PresetPackPreview } from "@openagentkit/sdk/protocol";
import { Alert, Button, Empty, Result, Spin } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { adminApi } from "../../lib/api.ts";
import { useConsoleRoute } from "../navigation/console-router.tsx";
import { InnerLayout } from "../navigation/inner-layout.tsx";
import type { TemplateDisplayDraft } from "./template-draft.ts";
import { TemplateEditorPage, type TemplateEditorProps } from "./template-editor-page.tsx";
import { TemplatePresetPicker } from "./template-preset-picker.tsx";

type Props = Pick<TemplateEditorProps, "onSaved" | "onCancel" | "onPendingChange">;

export function CreateTemplatePage(props: Props) {
	const { t } = useTranslation("templates");
	const { route, navigate, complete } = useConsoleRoute();
	const [started, setStarted] = useState(false);
	const [importing, setImporting] = useState(false);
	const reportImportPending = useCallback(
		(pending: boolean) => {
			setImporting(pending);
			props.onPendingChange?.(pending);
		},
		[props.onPendingChange],
	);
	const [applied, setApplied] = useState<
		{ preset: PresetPackPreview; display?: TemplateDisplayDraft; revision: number } | undefined
	>();
	const importPreset = (preset: PresetPackPreview, display?: TemplateDisplayDraft) => {
		setApplied((current) => ({ preset, display, revision: (current?.revision ?? 0) + 1 }));
		complete({ page: "template-create" });
	};
	useEffect(() => {
		if (!started && !applied && !route.preset && route.step) complete({ ...route, step: undefined }, true);
	}, [started, applied, route, complete]);
	const selected = route.preset ? undefined : applied;
	const query = useAdminQuery(
		`templates:preset:${route.preset ?? "none"}`,
		(signal) => (route.preset ? adminApi.presetPacks.get(route.preset, signal) : Promise.resolve(undefined)),
		{ enabled: Boolean(route.preset) },
	);
	if (route.preset && !selected && query.error)
		return (
			<Result
				status="error"
				title={t("create.presetLoadFailed")}
				subTitle={query.error}
				extra={[
					<Button key="retry" onClick={() => void query.refresh()}>
						{t("retry")}
					</Button>,
					<Button
						key="blank"
						onClick={() => {
							setStarted(true);
							navigate({ page: "template-create" });
						}}
					>
						{t("create.createBlank")}
					</Button>,
				]}
			/>
		);
	if (route.preset && !selected && (!query.data || query.loading))
		return <Spin aria-label={t("create.loadingPreset")} />;
	const preset = selected?.preset ?? (route.preset ? query.data : undefined);
	if (!started && !preset)
		return (
			<section aria-labelledby="create-template-title" className="space-y-6 animate-(--kit-animate-in)">
				<InnerLayout
					titleId="create-template-title"
					title={t("create.title")}
					backLabel={t("back")}
					onBack={props.onCancel}
				/>
				<div className="flex min-h-80 items-center justify-center py-12">
					<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("create.chooseMethod")}>
						<div className="flex flex-wrap justify-center gap-3">
							<TemplatePresetPicker
								buttonLabel={t("create.importExisting")}
								disabled={importing}
								hasConfiguration={false}
								onPendingChange={reportImportPending}
								onImport={importPreset}
							/>
							<Button type="primary" disabled={importing} onClick={() => setStarted(true)}>
								{t("create.startBlank")}
							</Button>
						</div>
					</Empty>
				</div>
			</section>
		);
	return (
		<div className="space-y-4 animate-(--kit-animate-in)">
			{preset ? (
				<Alert type="success" showIcon title={t("create.presetImported", { name: preset.remote_agent_name })} />
			) : null}
			<TemplateEditorPage
				{...props}
				key={`${route.preset ?? "blank"}:${selected?.revision ?? 0}`}
				initialPresetPack={preset}
				initialDisplay={selected?.display}
				onImportPreset={preset ? importPreset : undefined}
			/>
		</div>
	);
}
