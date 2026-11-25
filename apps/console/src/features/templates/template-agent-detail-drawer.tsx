import type { PresetPackAgentResources } from "@openagentkit/sdk/protocol";
import { Alert, Button, Drawer, Spin, Tag } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePresetPackResources } from "../preset-packs/preset-pack-session-resources.tsx";
import { AgentVersionConfigurationView } from "./agent-version-configuration-view.tsx";
import { TemplateAgentVersionPicker } from "./template-agent-version-picker.tsx";
import type { TemplateAgentSelection } from "./template-local-resources.tsx";
import styles from "./template-pages.module.less";
import { useTemplateAgentDetail } from "./use-template-agent-detail.ts";

function useAgentResourcePreview(agent: TemplateAgentSelection) {
	const query = usePresetPackResources(agent.agent_id, { enabled: !agent.local });
	return {
		...query,
		checking: !agent.local && (query.loading || (!query.data && !query.error)),
		confirmedResources: query.error ? undefined : query.data,
	};
}

function AgentDetailPreview({
	detail,
	ready,
	versionLabel,
}: {
	detail: ReturnType<typeof useTemplateAgentDetail>;
	ready: boolean;
	versionLabel: string;
}) {
	const { t } = useTranslation("templates");
	if (detail.error)
		return (
			<Alert
				type="error"
				showIcon
				message={detail.error}
				action={
					<Button size="small" onClick={() => void detail.refresh()}>
						{t("retry")}
					</Button>
				}
			/>
		);
	if (!ready)
		return (
			<div role="status" className={styles.loadingRow}>
				<Spin />
			</div>
		);
	return detail.data ? <AgentVersionConfigurationView detail={detail.data} versionLabel={versionLabel} /> : null;
}

function AgentDetailContent({
	agent,
	version: initialVersion,
	onClose,
	onConfirm,
}: {
	agent: TemplateAgentSelection;
	version?: number;
	onClose: () => void;
	onConfirm: (version?: number, resources?: PresetPackAgentResources) => void;
}) {
	const { t } = useTranslation("templates");
	const [version, setVersion] = useState(initialVersion);
	const detail = useTemplateAgentDetail(agent, version);
	const resources = useAgentResourcePreview(agent);
	const ready = !detail.loading && !detail.error && Boolean(detail.data);
	const createdAt = ready ? detail.data?.created_at : undefined;
	const versionLabel = agent.local ? t("agent.detail.pendingPublish") : `v${version}`;
	return (
		<Drawer
			open
			onClose={onClose}
			width={672}
			title={
				<div className={styles.drawerHead}>
					<div className={styles.drawerTitle}>{t("agent.detail.title")}</div>
					<p className={createdAt ? styles.drawerMeta : styles.srOnly}>
						{createdAt ? (
							<>
								{t("agent.detail.createdAt")}
								<time dateTime={createdAt}>{new Date(createdAt).toLocaleString("zh-CN", { hour12: false })}</time>
							</>
						) : (
							t("agent.detail.pickHint")
						)}
					</p>
				</div>
			}
			extra={
				!agent.local ? (
					<TemplateAgentVersionPicker
						agentId={agent.agent_id}
						agentName={agent.name || agent.agent_id}
						value={version}
						variant="button"
						onDefaultVersion={setVersion}
						onChange={setVersion}
					/>
				) : undefined
			}
			footer={
				<div className={styles.rowEnd}>
					<Button
						type="primary"
						disabled={!ready || resources.checking}
						loading={resources.checking}
						onClick={() => onConfirm(version, resources.confirmedResources)}
					>
						{t("agent.detail.confirm")}
					</Button>
				</div>
			}
		>
			<div className={styles.drawerBody}>
				{resources.checking ? <p role="status">{t("agent.detail.checking")}</p> : null}
				{resources.error ? (
					<Alert
						type="warning"
						showIcon
						title={t("agent.detail.detectFailed")}
						description={resources.error}
						action={<Button onClick={() => void resources.refresh()}>{t("retry")}</Button>}
					/>
				) : null}
				<AgentDetailPreview detail={detail} ready={ready} versionLabel={versionLabel} />
			</div>
		</Drawer>
	);
}

/** 打开当前候选版本配置，只有确认后才改变 Agent 选择；boundTo 非空表示该候选已被其他模版占用。 */
export function TemplateAgentDetailDrawer({
	agent,
	version,
	selected,
	onSelect,
	boundTo,
}: {
	agent: TemplateAgentSelection;
	version?: number;
	selected: boolean;
	onSelect: (version?: number, resources?: PresetPackAgentResources) => void;
	boundTo?: string;
}) {
	const { t } = useTranslation("templates");
	const [open, setOpen] = useState(false);
	const name = agent.name || agent.agent_id;
	const occupied = boundTo !== undefined && !selected;
	return (
		<>
			<button
				type="button"
				aria-label={t("agent.detail.selectAria", { name, id: agent.agent_id })}
				aria-pressed={selected}
				disabled={occupied || (!agent.local && version === undefined)}
				title={occupied ? `已被模版「${boundTo}」关联，不可选择` : undefined}
				onClick={() => setOpen(true)}
				className={styles.pickButton}
			>
				<span className={styles.pickName}>
					{name} {occupied ? <Tag>已被「{boundTo}」关联</Tag> : null}
				</span>
				<span className={styles.pickId}>{agent.local?.id ?? agent.agent_id}</span>
			</button>
			{open ? (
				<AgentDetailContent
					key={`${agent.agent_id}:${version}`}
					agent={agent}
					version={version}
					onClose={() => setOpen(false)}
					onConfirm={(selectedVersion, resources) => {
						onSelect(selectedVersion, resources);
						setOpen(false);
					}}
				/>
			) : null}
		</>
	);
}
