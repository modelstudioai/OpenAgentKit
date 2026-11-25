import { DeleteOutlined } from "@ant-design/icons";
import { type AgentSummary, CatalogAgentInputSchema } from "@openagentkit/sdk/protocol";
import { Button, Form, Input, Modal, Tooltip } from "antd";
import i18n from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./catalog.module.less";

export interface AgentPresentationDraft {
	description: string;
	opening_remarks: string;
	/** 每行一条示例问题。 */
	suggested_prompts: string;
}

export type AgentPresentation = Pick<AgentSummary, "description" | "opening_remarks" | "suggested_prompts">;

export const EMPTY_AGENT_PRESENTATION: AgentPresentationDraft = {
	description: "",
	opening_remarks: "",
	suggested_prompts: "",
};

const presentationSchema = CatalogAgentInputSchema.pick({
	description: true,
	opening_remarks: true,
	suggested_prompts: true,
});

export function toAgentPresentation(draft: AgentPresentationDraft): AgentPresentation {
	return {
		...(draft.description.trim() ? { description: draft.description.trim() } : {}),
		...(draft.opening_remarks.trim() ? { opening_remarks: draft.opening_remarks.trim() } : {}),
		suggested_prompts: draft.suggested_prompts
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean),
	};
}

export function validateAgentPresentation(draft: AgentPresentationDraft): string | null {
	const t = i18n.getFixedT(null, "catalog");
	const result = presentationSchema.safeParse(toAgentPresentation(draft));
	if (result.success) return null;
	const path = result.error.issues[0]?.path;
	if (path?.[0] === "description") return t("agentPresentation.descriptionMax");
	if (path?.[0] === "opening_remarks") return t("agentPresentation.openingMax");
	return path?.length === 1 ? t("agentPresentation.promptsMax") : t("agentPresentation.promptMax");
}

const MAX_PROMPTS = 8;

interface PromptRow {
	id: string;
	text: string;
}

function toPromptRows(prompts: string[]): PromptRow[] {
	return prompts.map((text) => ({ id: crypto.randomUUID(), text }));
}

function newPromptRow(): PromptRow {
	return { id: crypto.randomUUID(), text: "" };
}

/** 上架条目与模版共用展示字段，不修改远端 Agent 的提示词或会话运行配置。 */
export function AgentPresentationFields({
	value,
	onChange,
}: {
	value: AgentPresentationDraft;
	onChange: (next: AgentPresentationDraft) => void;
}) {
	const { t } = useTranslation("catalog");
	const [editorOpen, setEditorOpen] = useState(false);
	const [rows, setRows] = useState<PromptRow[]>([]);
	const error = validateAgentPresentation(value);
	const set = (patch: Partial<AgentPresentationDraft>) => onChange({ ...value, ...patch });
	const prompts = value.suggested_prompts
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const openEditor = () => {
		const existing = toPromptRows(prompts);
		setRows(existing.length ? existing : [newPromptRow()]);
		setEditorOpen(true);
	};
	const confirmEditor = () => {
		set({
			suggested_prompts: rows
				.map((row) => row.text.trim())
				.filter(Boolean)
				.join("\n"),
		});
		setEditorOpen(false);
	};
	return (
		<Form component={false} layout="vertical" requiredMark={false}>
			<Form.Item label={t("agentPresentation.description")}>
				<Input
					value={value.description}
					maxLength={400}
					onChange={(event) => set({ description: event.target.value })}
					aria-label={t("agentPresentation.description")}
				/>
			</Form.Item>
			<Form.Item label={t("agentPresentation.opening")}>
				<Input.TextArea
					rows={2}
					value={value.opening_remarks}
					maxLength={2000}
					onChange={(event) => set({ opening_remarks: event.target.value })}
					aria-label={t("agentPresentation.opening")}
				/>
			</Form.Item>
			<div className="relative">
				<Form.Item
					label={
						<div>
							{t("agentPresentation.prompts")}
							<Button
								type="link"
								size="small"
								aria-label={t("agentPresentation.addPrompt")}
								onClick={openEditor}
								className="absolute top-0 right-0"
							>
								<span aria-hidden="true">+</span> {t("agentPresentation.add")}
							</Button>
						</div>
					}
					validateStatus={error ? "error" : undefined}
					help={error}
				>
					<div className="flex flex-col gap-1">
						{prompts.length ? (
							prompts.map((prompt, index) => (
								<Tooltip key={`${index}:${prompt}`} title={prompt}>
									<span className="block truncate">{prompt}</span>
								</Tooltip>
							))
						) : (
							<span className={styles.hintText}>--</span>
						)}
					</div>
				</Form.Item>
			</div>
			<Modal
				title={t("agentPresentation.prompts")}
				open={editorOpen}
				onCancel={() => setEditorOpen(false)}
				onOk={confirmEditor}
				okText={t("agentPresentation.ok")}
				cancelText={t("agentPresentation.cancel")}
				width={560}
				destroyOnHidden
			>
				<p className={styles.hintText}>{t("agentPresentation.hint", { max: MAX_PROMPTS })}</p>
				<div className="mt-2 flex flex-col gap-2">
					{rows.map((row, index) => (
						<div key={row.id} className="flex items-center gap-2">
							<Input
								aria-label={t("agentPresentation.promptAria", { index: index + 1 })}
								placeholder={t("agentPresentation.promptPlaceholder")}
								maxLength={200}
								value={row.text}
								onChange={(event) =>
									setRows((current) =>
										current.map((item) => (item.id === row.id ? { ...item, text: event.target.value } : item)),
									)
								}
							/>
							<Button
								type="text"
								size="small"
								aria-label={t("agentPresentation.removePrompt", { index: index + 1 })}
								title={t("agentPresentation.removePrompt", { index: index + 1 })}
								icon={<DeleteOutlined />}
								onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
							/>
						</div>
					))}
					<div className="flex justify-end">
						<Button
							type="link"
							size="small"
							aria-label={t("agentPresentation.addPrompt")}
							disabled={rows.length >= MAX_PROMPTS}
							onClick={() => setRows((current) => [...current, newPromptRow()])}
						>
							<span aria-hidden="true">+</span> {t("agentPresentation.add")}
						</Button>
					</div>
				</div>
			</Modal>
		</Form>
	);
}
