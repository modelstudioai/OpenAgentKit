import { Alert, Button, Drawer } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import { TemplateAgentVersionHistory } from "./template-agent-version-history.tsx";
import styles from "./template-forms.module.less";

const TRIGGER_KEYS = {
	inline: "agent.versionPicker.triggerInline",
	button: "agent.versionPicker.triggerButton",
} as const;

/** 列表行内入口或详情按钮展开版本选择；查看候选不改变 Agent 或已有运行绑定。 */
export function TemplateAgentVersionPicker({
	agentId,
	agentName,
	value,
	variant = "inline",
	onDefaultVersion,
	onChange,
}: {
	agentId: string;
	agentName: string;
	value?: number;
	variant?: "inline" | "button";
	onDefaultVersion: (version: number) => void;
	onChange: (version: number) => void;
}) {
	const { t } = useTranslation("templates");
	const client = useMemo(getAdminClient, []);
	const [requested, setRequested] = useState(false);
	const [open, setOpen] = useState(false);
	const versions = useAdminQuery(
		`templates:agent-versions:${agentId}`,
		(signal) => client.remoteAgentVersions(agentId, signal),
		{ enabled: requested || value === undefined },
	);
	const choices = [...new Set((versions.data ?? []).map((item) => item.version))]
		.filter((version) => Number.isInteger(version) && version > 0)
		.sort((a, b) => b - a);
	const latestVersion = choices[0];
	useEffect(() => {
		if (value === undefined && latestVersion !== undefined) onDefaultVersion(latestVersion);
	}, [value, latestVersion, onDefaultVersion]);
	// 回填、分页重挂或查询失败期间保留具体版本，不能退回未绑定版本的运行方式。
	if (value !== undefined && !choices.includes(value)) choices.unshift(value);
	const status = (
		<>
			{value === undefined && versions.data?.length === 0 ? (
				<p role="status" className={styles.statusText}>
					{t("agent.versionPicker.none")}
				</p>
			) : null}
			{versions.loading ? (
				<p role="status" className={styles.statusText}>
					{t("agent.versionPicker.loading")}
				</p>
			) : null}
			{versions.error ? (
				<Alert
					type="error"
					showIcon
					message={versions.error}
					action={
						<Button size="small" onClick={() => void versions.refresh()}>
							{t("retry")}
						</Button>
					}
				/>
			) : null}
		</>
	);
	return (
		<div className={styles.pickerRoot}>
			<div className={styles.pickerRow}>
				{variant === "inline" ? (
					<span className={styles.versionChip}>
						{value === undefined ? t("agent.versionPicker.notSelected") : `v${value}`}
					</span>
				) : null}
				<Button
					type={variant === "inline" ? "link" : "default"}
					size="small"
					className={styles.triggerButton}
					aria-label={t("agent.versionPicker.triggerAria", { name: agentName, id: agentId })}
					onClick={() => {
						setOpen(true);
						setRequested(true);
					}}
				>
					{t(TRIGGER_KEYS[variant])}
				</Button>
				<Drawer
					open={open}
					onClose={() => setOpen(false)}
					width={672}
					title={
						<div className={styles.drawerHead}>
							<div className={styles.drawerTitle}>{t("agent.versionPicker.drawerTitle")}</div>
							<p className={styles.drawerAgent}>
								{t("agent.versionPicker.drawerSubtitle", { name: agentName, id: agentId })}
							</p>
						</div>
					}
				>
					{open ? (
						<TemplateAgentVersionHistory
							agentId={agentId}
							versions={choices}
							selectedVersion={value}
							latestVersion={latestVersion}
							status={status}
							onSelect={(version) => {
								onChange(version);
								setOpen(false);
							}}
						/>
					) : null}
				</Drawer>
			</div>
			{!open && value === undefined ? status : null}
		</div>
	);
}
