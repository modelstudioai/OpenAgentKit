import type { RemoteAgentVersionDetail } from "@openagentpack/kit-sdk/protocol";
import { Button } from "antd";
import i18n from "i18next";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	configList,
	configObject,
	configText,
	type VersionMcpServer,
	type VersionToolkit,
	versionMcpServers,
	versionToolkits,
} from "./agent-version-configuration.ts";
import styles from "./template-forms.module.less";

/** 启用状态徽标：base + 启用/禁用色（原为 cva，拆为组合类）。 */
function badgeClass(enabled?: boolean) {
	return enabled === undefined || enabled ? styles.badge : `${styles.badge} ${styles.badgeOff}`;
}

function Section({ title, children, plain = false }: { title: string; children: ReactNode; plain?: boolean }) {
	return (
		<section aria-label={title} className={styles.configSection}>
			<h4 className={plain ? styles.sectionTitlePlain : styles.sectionTitleMed}>{title}</h4>
			{children}
		</section>
	);
}

function Text({ children }: { children?: ReactNode }) {
	const { t } = useTranslation("templates");
	return <p className={styles.plainText}>{children || t("agent.view.empty")}</p>;
}

function Value({ label, value }: { label: string; value: unknown }) {
	const { t } = useTranslation("templates");
	const text = typeof value === "boolean" ? (value ? t("agent.view.on") : t("agent.view.off")) : configText(value);
	if (text === undefined) return null;
	return (
		<div className={styles.fieldStack}>
			<dt className={styles.mutedOnly}>{label}</dt>
			<dd className={styles.wrapAnywhere}>{text}</dd>
		</div>
	);
}

function Model({ value }: { value: unknown }) {
	const { t } = useTranslation("templates");
	const model = configObject(value);
	const provider = model.bailian;
	const fields = provider && typeof provider === "object" ? configObject(provider) : model;
	const name = configText(fields.name) ?? configText(fields.id) ?? configText(provider) ?? configText(value);
	if (!name) return <Text>{t("agent.view.modelEmpty")}</Text>;
	return (
		<div className={styles.modelBox}>
			<p className={styles.nameAny}>{name}</p>
		</div>
	);
}

function enabledLabel(value?: boolean) {
	const t = i18n.getFixedT(null, "templates");
	return value === undefined
		? t("agent.view.enabledMissing")
		: value
			? t("agent.view.enabledYes")
			: t("agent.view.enabledNo");
}

function sourceLabel(value: string) {
	const t = i18n.getFixedT(null, "templates");
	if (value === "official") return t("agent.view.sourceOfficial");
	if (["custom", "customer", "url", "http"].includes(value)) return t("agent.view.sourceCustom");
	return value;
}

function Toolkit({ value, title = value.title }: { value: VersionToolkit; title?: string }) {
	const { t } = useTranslation("templates");
	const [expanded, setExpanded] = useState(true);
	const contentId = useId();
	return (
		<section aria-label={t("agent.view.configAria", { title })} className={styles.toolkitCard}>
			<div className={styles.toolkitHeader}>
				<div className={styles.headRow}>
					<h5 className={styles.nameAny}>{title}</h5>
					<span className={badgeClass()}>{t("agent.view.items", { count: value.tools.length })}</span>
				</div>
				<Button
					size="small"
					aria-label={t("agent.view.expandAria", {
						action: expanded ? t("agent.view.collapse") : t("agent.view.expand"),
						title,
					})}
					aria-expanded={expanded}
					aria-controls={contentId}
					onClick={() => setExpanded((current) => !current)}
				>
					{expanded ? t("agent.view.collapse") : t("agent.view.expand")}
				</Button>
			</div>
			<dl className={styles.toolkitGrid}>
				<Value label={t("agent.view.defaultEnabled")} value={enabledLabel(value.defaultEnabled)} />
				<Value label={t("agent.view.defaultPermission")} value={value.defaultPermission} />
			</dl>
			<div id={contentId} hidden={!expanded} className={styles.toolkitBody}>
				{value.tools.length ? (
					<table aria-label={t("agent.view.toolkitAria", { title })} className={styles.toolkitTable}>
						<thead className={styles.toolkitThead}>
							<tr>
								<th scope="col" className={styles.toolkitTh}>
									{t("agent.view.toolName")}
								</th>
								<th scope="col" className={styles.toolkitTh25}>
									{t("agent.view.enableState")}
								</th>
								<th scope="col" className={styles.toolkitTh25}>
									{t("agent.view.permission")}
								</th>
							</tr>
						</thead>
						<tbody className={styles.toolkitTbody}>
							{value.tools.map((tool) => (
								<tr key={tool.name} className={styles.toolkitTr}>
									<th scope="row" className={styles.toolkitRowHead}>
										<span className={styles.blockMedium}>{tool.name}</span>
										{tool.description ? <span className={styles.blockMuted}>{tool.description}</span> : null}
									</th>
									<td className={styles.toolkitTd}>
										<span aria-hidden="true" className={styles.toolkitTdLabel}>
											{t("agent.view.enableState")}
										</span>
										<span className={badgeClass(tool.enabled === true)}>{enabledLabel(tool.enabled)}</span>
										{tool.inheritedEnabled ? (
											<span className={styles.toolkitInherit}>{t("agent.view.followDefault")}</span>
										) : null}
									</td>
									<td className={styles.toolkitTdAny}>
										<span aria-hidden="true" className={styles.toolkitTdLabel}>
											{t("agent.view.permission")}
										</span>
										{tool.permission}
										{tool.inheritedPermission ? (
											<span className={styles.toolkitInherit}>{t("agent.view.followDefault")}</span>
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				) : (
					<div className={styles.toolkitEmpty}>
						<Text>{t("agent.view.toolkitEmpty")}</Text>
					</div>
				)}
			</div>
		</section>
	);
}

function McpServer({ server }: { server: VersionMcpServer }) {
	const { t } = useTranslation("templates");
	return (
		<article aria-label={server.name} className={styles.mcpCard}>
			<div className={styles.entryRow}>
				<h5 className={`${styles.shrinkRoot} ${styles.nameAny}`}>{server.name}</h5>
				{server.type ? <span className={badgeClass()}>{sourceLabel(server.type)}</span> : null}
			</div>
			{server.description ? <Text>{server.description}</Text> : null}
			<dl className={`${styles.stack2} ${styles.textXs}`}>
				{server.code !== server.name ? <Value label={t("agent.view.serverCode")} value={server.code} /> : null}
				<Value label={t("agent.view.serverUrl")} value={server.url} />
				<Value label={t("agent.view.serverProtocol")} value={server.protocol} />
			</dl>
			{server.toolkit ? (
				<Toolkit value={server.toolkit} title={server.name} />
			) : (
				<Text>{t("agent.view.noToolkit")}</Text>
			)}
		</article>
	);
}

function Skills({ value }: { value: unknown }) {
	const { t } = useTranslation("templates");
	const skills = configList(value);
	if (!skills.length) return <Text>{t("agent.view.noSkills")}</Text>;
	return (
		<ul aria-label={t("agent.view.sectionSkills")} className={styles.skillList}>
			{skills.map((entry, index) => {
				const skill = configObject(entry);
				const id = configText(skill.skill_id ?? skill.skillId ?? skill.id ?? entry);
				const name =
					[skill.name, skill.skill_name, skill.skillName].map(configText).find((name) => name && name !== id) ??
					id ??
					t("agent.view.skillFallback");
				const version = configText(skill.version);
				const type = configText(skill.type);
				return (
					<li
						key={`${id ?? name}:${version ?? ""}:${index}`}
						title={configText(skill.description)}
						className={styles.skillChip}
					>
						<span className={styles.nameAny}>{name}</span>
						{version ? <span className={styles.mutedOnly}>@{version}</span> : null}
						{type ? <span className={styles.metaText}>{sourceLabel(type)}</span> : null}
					</li>
				);
			})}
		</ul>
	);
}

export function AgentVersionConfigurationView({
	detail,
	versionLabel,
	nameContent,
	versionContent,
	placeholder,
}: {
	detail?: Pick<RemoteAgentVersionDetail, "name" | "description" | "configuration">;
	versionLabel?: string;
	nameContent?: ReactNode;
	versionContent?: ReactNode;
	placeholder?: string;
}) {
	const { t } = useTranslation("templates");
	return (
		<div className={styles.shrinkRoot}>
			<Section title={t("agent.view.sectionName")} plain>
				{nameContent ?? <Text>{detail?.name}</Text>}
			</Section>
			{versionContent || versionLabel ? (
				<Section title={t("agent.view.sectionVersion")} plain>
					{versionContent ?? <Text>{versionLabel}</Text>}
				</Section>
			) : null}
			{placeholder || !detail ? (
				[
					t("agent.view.sectionModel"),
					t("agent.view.sectionDescription"),
					t("agent.view.sectionInstructions"),
					t("agent.view.sectionTools"),
					t("agent.view.sectionMcp"),
					t("agent.view.sectionSkills"),
				].map((title) => (
					<Section key={title} title={title}>
						<Text>{placeholder ?? t("agent.view.selectAgent")}</Text>
					</Section>
				))
			) : (
				<ConfigurationFields detail={detail} />
			)}
		</div>
	);
}

function ConfigurationFields({ detail }: { detail: Pick<RemoteAgentVersionDetail, "description" | "configuration"> }) {
	const { t } = useTranslation("templates");
	const config = detail.configuration;
	const tools = versionToolkits(config.tools).filter((toolkit) => toolkit.kind !== "mcp");
	const servers = versionMcpServers(config.mcp_servers, config.tools);
	const multiagent = configObject(config.multiagent);
	const members = configList(multiagent.agents);
	const multiagentEnabled =
		config.multiagent != null &&
		!(multiagent.type === "coordinator" && Array.isArray(multiagent.agents) && members.length === 0);
	return (
		<>
			<Section title={t("agent.view.sectionModel")}>
				<Model value={config.model} />
			</Section>
			<Section title={t("agent.view.sectionMultiagent")}>
				{multiagentEnabled ? (
					<div className={styles.stack2}>
						<p>{t("agent.view.coordinator")}</p>
						<ul aria-label={t("agent.view.subAgentsAria")} className={styles.stack2}>
							{members.map((member) => {
								const value = configObject(member);
								const id =
									configText(value.agent_id ?? value.id ?? member) ??
									(value.type === "self" ? t("agent.view.self") : t("agent.view.unknownSubAgent"));
								return (
									<li key={id} className={styles.wrapAnywhere}>
										{id}
										{value.version != null
											? t("agent.view.versionSuffix", { version: configText(value.version) ?? "" })
											: ""}
									</li>
								);
							})}
						</ul>
					</div>
				) : (
					<Text>{t("agent.view.disabled")}</Text>
				)}
			</Section>
			<Section title={t("agent.view.sectionDescription")}>
				<Text>{detail.description}</Text>
			</Section>
			<Section title={t("agent.view.sectionInstructions")}>
				<div className={styles.instructionsBox}>
					<Text>{config.instructions}</Text>
				</div>
			</Section>
			<Section title={t("agent.view.sectionTools")}>
				{tools.length ? (
					<div className={styles.blockStack}>
						{tools.map((toolkit) => (
							<Toolkit key={toolkit.id} value={toolkit} />
						))}
					</div>
				) : (
					<Text>{t("agent.view.noTools")}</Text>
				)}
			</Section>
			<Section title={t("agent.view.sectionMcp")}>
				{servers.length ? (
					<div className={styles.blockStack}>
						{servers.map((server) => (
							<McpServer key={server.id} server={server} />
						))}
					</div>
				) : (
					<Text>{t("agent.view.noMcp")}</Text>
				)}
			</Section>
			<Section title={t("agent.view.sectionSkills")}>
				<Skills value={config.skills} />
			</Section>
		</>
	);
}
