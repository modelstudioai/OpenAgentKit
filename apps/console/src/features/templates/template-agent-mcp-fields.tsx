import { Button, Checkbox, Input } from "antd";
import { useTranslation } from "react-i18next";
import { type AgentMcpDraft, createMcpDraft, mcpDraftErrors } from "./template-agent-mcp-draft.ts";
import styles from "./template-forms.module.less";

type Props = { value: AgentMcpDraft[]; onChange: (value: AgentMcpDraft[]) => void; disabled: boolean };

/** MCP 只编辑页面草稿，下一步才生成本地 SDK 声明；标题由外层折叠卡提供。 */
export function TemplateAgentMcpFields({ value, onChange, disabled }: Props) {
	const { t } = useTranslation("templates");
	const errors = mcpDraftErrors(value);
	return (
		<div className={styles.mcpRoot}>
			<div className={styles.mcpHeader}>
				<p className={styles.mcpIntro}>{t("agent.mcpFields.intro", { max: 50 })}</p>
				<Button
					size="small"
					disabled={disabled || value.length >= 50}
					onClick={() => onChange([...value, createMcpDraft()])}
				>
					{t("agent.mcpFields.add")}
				</Button>
			</div>
			{value.length ? (
				<fieldset aria-label={t("agent.mcpFields.listAria")} className={styles.mcpList}>
					{value.map((server) => (
						<McpFields
							key={server.id}
							server={server}
							errors={errors}
							disabled={disabled}
							onChange={(next) => onChange(value.map((item) => (item.id === server.id ? next : item)))}
							onRemove={() => onChange(value.filter((item) => item.id !== server.id))}
						/>
					))}
				</fieldset>
			) : (
				<p className={styles.metaText}>{t("agent.mcpFields.empty")}</p>
			)}
		</div>
	);
}

function McpFields({
	server,
	onChange,
	onRemove,
	disabled,
	errors,
}: {
	server: AgentMcpDraft;
	onChange: (value: AgentMcpDraft) => void;
	onRemove: () => void;
	disabled: boolean;
	errors: Map<string, string>;
}) {
	const { t } = useTranslation("templates");
	const nameId = `mcp-name-${server.id}`;
	const serviceError = server.name.trim() ? errors.get(server.id) : undefined;
	return (
		<fieldset aria-label={t("agent.mcpFields.configAria")} disabled={disabled} className={styles.serverCard}>
			<div className={styles.removeRow}>
				<Button
					size="small"
					aria-label={t("agent.mcpFields.removeAria", { name: server.name || t("agent.mcpFields.unnamed") })}
					onClick={onRemove}
				>
					{t("agent.mcpFields.remove")}
				</Button>
			</div>
			<div className={styles.fieldBlock}>
				<label htmlFor={nameId}>
					{t("agent.mcpFields.serverLabel")}
					<span aria-hidden="true" className={styles.requiredStar}>
						*
					</span>
				</label>
				<Input
					id={nameId}
					required
					maxLength={200}
					placeholder={t("agent.mcpFields.placeholder")}
					value={server.name}
					status={serviceError ? "error" : undefined}
					aria-describedby={serviceError ? `${nameId}-error` : undefined}
					onChange={(event) => onChange({ ...server, name: event.target.value })}
				/>
				{serviceError ? (
					<p id={`${nameId}-error`} role="alert" className={styles.errorText}>
						{serviceError}
					</p>
				) : null}
			</div>
			<Checkbox
				checked={server.defaultEnabled}
				onChange={(event) => onChange({ ...server, defaultEnabled: event.target.checked })}
			>
				{t("agent.mcpFields.defaultEnabled")}
			</Checkbox>
			<div className={styles.toolsSection}>
				<div className={styles.mcpHeader}>
					<span>{t("agent.mcpFields.toolsTitle")}</span>
					<Button
						size="small"
						disabled={server.tools.length >= 200}
						onClick={() =>
							onChange({ ...server, tools: [...server.tools, { id: crypto.randomUUID(), name: "", enabled: true }] })
						}
					>
						{t("agent.mcpFields.addTool")}
					</Button>
				</div>
				{server.tools.length ? (
					server.tools.map((tool) => (
						<div key={tool.id} className={styles.toolRow}>
							<div className={styles.toolRowMain}>
								<div className={`${styles.fieldBlock} ${styles.fieldBlockFlex}`}>
									<label htmlFor={`mcp-tool-${tool.id}`}>
										{t("agent.mcpFields.toolLabel")}
										<span aria-hidden="true" className={styles.requiredStar}>
											*
										</span>
									</label>
									<Input
										id={`mcp-tool-${tool.id}`}
										required
										maxLength={200}
										value={tool.name}
										status={errors.has(tool.id) ? "error" : undefined}
										aria-describedby={errors.has(tool.id) ? `mcp-tool-${tool.id}-error` : undefined}
										onChange={(event) =>
											onChange({
												...server,
												tools: server.tools.map((item) =>
													item.id === tool.id ? { ...item, name: event.target.value } : item,
												),
											})
										}
									/>
								</div>
								<Checkbox
									className={styles.toolCheckbox}
									checked={tool.enabled}
									onChange={(event) =>
										onChange({
											...server,
											tools: server.tools.map((item) =>
												item.id === tool.id ? { ...item, enabled: event.target.checked } : item,
											),
										})
									}
								>
									{t("agent.mcpFields.enable")}
								</Checkbox>
								<Button
									size="small"
									className={styles.removeButton}
									aria-label={t("agent.mcpFields.removeToolAria", {
										name: tool.name || t("agent.mcpFields.toolUnnamed"),
									})}
									onClick={() => onChange({ ...server, tools: server.tools.filter((item) => item.id !== tool.id) })}
								>
									{t("agent.mcpFields.remove")}
								</Button>
							</div>
							{errors.has(tool.id) ? (
								<p id={`mcp-tool-${tool.id}-error`} role="alert" className={styles.errorText}>
									{errors.get(tool.id)}
								</p>
							) : null}
						</div>
					))
				) : (
					<p className={styles.metaText}>{t("agent.mcpFields.toolsEmpty")}</p>
				)}
			</div>
		</fieldset>
	);
}
