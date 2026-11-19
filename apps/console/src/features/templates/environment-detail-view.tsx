import type { RemoteEnvironmentDetail } from "@openagentpack/kit-sdk/protocol";
import i18n from "i18next";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import styles from "./template-resources.module.less";

const tagToneClass = {
	neutral: styles.tagNeutral,
	ready: styles.tagReady,
	building: styles.tagBuilding,
} as const;

/** 原为 cva 定义；变体拆为 module 组合类，调用形态保持 tagClass(tone) 不变。 */
function tagClass(tone: keyof typeof tagToneClass = "neutral") {
	return `${styles.tag} ${tagToneClass[tone]}`;
}

const packageManagers = ["apt", "npm", "pip", "go", "cargo", "gem"] as const;
const timeUnits = [
	[31_536_000, "year"],
	[2_592_000, "month"],
	[86_400, "day"],
	[3_600, "hour"],
	[60, "minute"],
] as const;

function updatedAtLabel(value?: string) {
	if (!value) return undefined;
	const timestamp = new Date(value).getTime();
	if (!Number.isFinite(timestamp)) return undefined;
	const seconds = (timestamp - Date.now()) / 1_000;
	const formatter = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
	for (const [size, unit] of timeUnits) {
		if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
	}
	return i18n.getFixedT(null, "templates")("agent.environment.detail.justNow");
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section aria-label={title} className={styles.envSection}>
			<h3 className={styles.sectionLabel}>{title}</h3>
			{children}
		</section>
	);
}

function DetailRows({ rows }: { rows: { key: string; label: string; value: string }[] }) {
	return (
		<dl className={styles.rowsList}>
			{rows.map((row) => (
				<div key={row.key} className={styles.rowGrid}>
					<dt className={styles.rowLabel}>{row.label}</dt>
					<dd className={styles.rowValue}>{row.value}</dd>
				</div>
			))}
		</dl>
	);
}

function Networking({ detail }: { detail: RemoteEnvironmentDetail }) {
	const { t } = useTranslation("templates");
	const networking = detail.configuration.networking;
	const mode = detail.copy_restricted_fields?.includes("configuration.networking")
		? t("agent.environment.config.restrictedConfig")
		: networking?.type === "unrestricted"
			? t("agent.environment.networking.modeUnrestricted")
			: networking?.type === "limited"
				? t("agent.environment.networking.modeLimited")
				: t("agent.environment.networking.modeDefault");
	const access = (value?: boolean) =>
		value === undefined
			? t("agent.environment.networking.accessDefault")
			: value
				? t("agent.environment.networking.allow")
				: t("agent.environment.networking.deny");
	const rows = [{ key: "type", label: t("agent.environment.networking.accessMode"), value: mode }];
	if (networking?.type === "limited")
		rows.push(
			{ key: "mcp", label: t("agent.environment.networking.mcpAccess"), value: access(networking.allow_mcp_servers) },
			{
				key: "packages",
				label: t("agent.environment.networking.packageAccess"),
				value: access(networking.allow_package_managers),
			},
			{
				key: "hosts",
				label: t("agent.environment.networking.hosts"),
				value: networking.allowed_hosts?.join("\n") || t("agent.view.empty"),
			},
		);
	return (
		<DetailSection title={t("agent.environment.networking.title")}>
			<DetailRows rows={rows} />
		</DetailSection>
	);
}

/** 与创建页使用同一环境合同，展示概览、网络策略、预装包和元数据。 */
export function EnvironmentDetailView({ detail }: { detail: RemoteEnvironmentDetail }) {
	const { t } = useTranslation("templates");
	const type = detail.configuration.type;
	const hostingLabel =
		type === "cloud"
			? t("agent.environment.detail.cloud")
			: type === "self_hosted"
				? t("agent.environment.detail.local")
				: undefined;
	const updatedAt = updatedAtLabel(detail.updated_at);
	const packages = packageManagers.flatMap((manager) =>
		[
			...new Set(
				(detail.configuration.packages?.[manager] ?? []).flatMap((value) => value.split(/\s+/)).filter(Boolean),
			),
		].map((value) => ({ key: `${manager}:${value}`, label: manager, value })),
	);
	const metadata = Object.entries(detail.metadata ?? {}).map(([key, value]) => ({
		key,
		label: key,
		value: value === "[redacted]" ? t("agent.environment.detail.hidden") : value,
	}));
	return (
		<div className={styles.envDetailRoot}>
			<div className={styles.detailHead}>
				<div className={styles.headRow}>
					<h3 className={styles.envDetailName}>{detail.name}</h3>
					{hostingLabel ? <span className={tagClass()}>{hostingLabel}</span> : null}
					{detail.package_status ? (
						<span className={tagClass(detail.package_status)}>
							{detail.package_status === "ready"
								? t("agent.environment.detail.ready")
								: t("agent.environment.detail.preparing")}
						</span>
					) : null}
				</div>
				<p className={styles.detailMeta}>
					{detail.environment_id}
					{updatedAt ? (
						<span title={detail.updated_at}>{t("agent.environment.detail.lastUpdated", { time: updatedAt })}</span>
					) : null}
				</p>
				{detail.description ? <p className={styles.detailDesc}>{detail.description}</p> : null}
			</div>
			<Networking detail={detail} />
			{type === "cloud" ? (
				<DetailSection title={t("agent.environment.fields.packages")}>
					{packages.length ? (
						<DetailRows rows={packages} />
					) : (
						<p className={styles.detailMeta}>{t("agent.environment.detail.noPackages")}</p>
					)}
				</DetailSection>
			) : null}
			<DetailSection title={t("agent.environment.fields.metadata")}>
				{metadata.length ? (
					<DetailRows rows={metadata} />
				) : (
					<p className={styles.detailMeta}>{t("agent.environment.detail.noMetadata")}</p>
				)}
			</DetailSection>
		</div>
	);
}
