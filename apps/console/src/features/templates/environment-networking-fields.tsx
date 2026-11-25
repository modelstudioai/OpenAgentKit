import { Input, Select } from "antd";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { EnvironmentCreateDraft } from "./template-environment-form-draft.ts";
import styles from "./template-resources.module.less";

export function EnvironmentNetworkingFields({
	value,
	onChange,
}: {
	value: EnvironmentCreateDraft;
	onChange: (next: EnvironmentCreateDraft) => void;
}) {
	const { t } = useTranslation("templates");
	const id = useId();
	const networking = value.networking;
	const accessFields = [
		{ key: "allow_mcp_servers", label: t("agent.environment.networking.mcpAccess") },
		{ key: "allow_package_managers", label: t("agent.environment.networking.packageAccess") },
	] as const;
	const modeOptions = [
		{ value: "", label: t("agent.environment.networking.modeDefault") },
		{ value: "unrestricted", label: t("agent.environment.networking.modeUnrestricted") },
		{ value: "limited", label: t("agent.environment.networking.modeLimited") },
	];
	const accessOptions = [
		{ value: "", label: t("agent.environment.networking.accessDefault") },
		{ value: "true", label: t("agent.environment.networking.allow") },
		{ value: "false", label: t("agent.environment.networking.deny") },
	];
	return (
		<section aria-label={t("agent.environment.networking.title")} className={styles.netRoot}>
			<h3 className={styles.netHeading}>{t("agent.environment.networking.title")}</h3>
			<div className={styles.fieldStack}>
				<label htmlFor={`${id}-mode`}>{t("agent.environment.networking.accessMode")}</label>
				<Select
					id={`${id}-mode`}
					aria-label={t("agent.environment.networking.accessModeAria")}
					className={styles.fullControl}
					value={networking?.type ?? ""}
					onChange={(type) => {
						if (!type) onChange({ ...value, networking: undefined, networkingHosts: undefined });
						else if (type === "unrestricted" || type === "limited")
							onChange({ ...value, networking: { ...networking, type } });
					}}
					options={modeOptions}
				/>
			</div>
			{networking?.type === "limited" ? (
				<div className={styles.limitedPanel}>
					<div className={styles.accessGrid}>
						{accessFields.map(({ key, label }) => (
							<div key={key} className={styles.fieldStack}>
								<label htmlFor={`${id}-${key}`}>{label}</label>
								<Select
									id={`${id}-${key}`}
									aria-label={label}
									className={styles.fullControl}
									value={networking[key] === undefined ? "" : String(networking[key])}
									onChange={(next) => {
										const updated = { ...networking };
										if (!next) delete updated[key];
										else updated[key] = next === "true";
										onChange({ ...value, networking: updated });
									}}
									options={accessOptions}
								/>
							</div>
						))}
					</div>
					<div className={styles.fieldStack}>
						<label htmlFor={`${id}-hosts`}>{t("agent.environment.networking.hosts")}</label>
						<Input.TextArea
							id={`${id}-hosts`}
							aria-label={t("agent.environment.networking.hosts")}
							aria-describedby={`${id}-hosts-hint`}
							rows={4}
							value={value.networkingHosts ?? networking.allowed_hosts?.join("\n") ?? ""}
							onChange={(event) => onChange({ ...value, networkingHosts: event.target.value })}
						/>
						<p id={`${id}-hosts-hint`} className={styles.hostsHint}>
							{t("agent.environment.networking.hostsHint")}
						</p>
					</div>
				</div>
			) : null}
		</section>
	);
}
