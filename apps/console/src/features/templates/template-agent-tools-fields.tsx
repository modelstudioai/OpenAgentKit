import type { ProjectAgentCreateInput } from "@openagentkit/sdk/protocol";
import { Checkbox, Select } from "antd";
import { useTranslation } from "react-i18next";
import { formRowClass, formRowLabelClass } from "../../lib/form-row.ts";
import { BUILTIN_TOOLS } from "./template-agent-form-draft.ts";
import styles from "./template-forms.module.less";

type Tools = NonNullable<ProjectAgentCreateInput["tools"]>;
const canonicalToolName = (name: string) =>
	name
		.trim()
		.replace(/[^a-zA-Z0-9]+/g, "")
		.toLowerCase();

export function TemplateAgentToolsFields({ value, onChange }: { value?: Tools; onChange: (tools: Tools) => void }) {
	const { t } = useTranslation("templates");
	const tools: Tools = value ?? { builtin: [...BUILTIN_TOOLS] };
	const defaultPermission = tools.default_permission ?? "allow";
	const inheritedLabel = defaultPermission === "ask" ? t("agent.tools.askEveryTime") : t("agent.tools.alwaysAllow");
	const names = [...new Set([...BUILTIN_TOOLS, ...tools.builtin])];
	const overrides = new Map(
		Object.entries(tools.permissions ?? {}).map(([name, permission]) => [canonicalToolName(name), permission]),
	);
	const changeEnabled = (name: string, enabled: boolean) => {
		const selected = new Set(tools.builtin);
		if (enabled) selected.add(name);
		else selected.delete(name);
		onChange({ ...tools, builtin: [...selected] });
	};
	const changePermission = (name: string, permission: string) => {
		const permissions = { ...tools.permissions };
		for (const key of Object.keys(permissions))
			if (canonicalToolName(key) === canonicalToolName(name)) delete permissions[key];
		if (permission === "allow" || permission === "ask") permissions[name] = permission;
		const { permissions: _, ...rest } = tools;
		onChange({ ...rest, ...(Object.keys(permissions).length ? { permissions } : {}) });
	};
	return (
		<section aria-label={t("agent.tools.title")} className={formRowClass}>
			<h4 className={`${formRowLabelClass} ${styles.toolsLabel}`}>{t("agent.tools.title")}</h4>
			<div className={styles.toolsBody}>
				<div className={styles.permissionRow}>
					<label htmlFor="agent-default-permission" className={styles.fieldLabel}>
						{t("agent.tools.permissionLabel")}
					</label>
					<Select
						id="agent-default-permission"
						className={styles.permissionSelect}
						value={defaultPermission}
						onChange={(permission) => {
							if (permission === "allow" || permission === "ask")
								onChange({ ...tools, default_permission: permission });
						}}
						options={[
							{ value: "allow", label: t("agent.tools.alwaysAllow") },
							{ value: "ask", label: t("agent.tools.askEveryTime") },
						]}
					/>
				</div>
				<p className={styles.toolsHint}>{t("agent.tools.hint")}</p>
				<div className={styles.toolsTableWrap}>
					<table className={styles.toolsTable}>
						<caption className={styles.srOnly}>{t("agent.tools.caption")}</caption>
						<thead className={styles.toolsTableHead}>
							<tr>
								{[t("agent.tools.colName"), t("agent.tools.colEnabled"), t("agent.tools.colPermission")].map(
									(label) => (
										<th key={label} scope="col" className={styles.toolsTableTh}>
											{label}
										</th>
									),
								)}
							</tr>
						</thead>
						<tbody className={styles.toolsTableBody}>
							{names.map((name) => (
								<tr key={name}>
									<th scope="row" className={styles.toolsTableName}>
										{name}
									</th>
									<td className={styles.toolsTableCell}>
										<Checkbox
											aria-label={name}
											checked={tools.builtin.includes(name)}
											onChange={(event) => changeEnabled(name, event.target.checked)}
										/>
									</td>
									<td className={styles.toolsTableCell}>
										<Select
											aria-label={t("agent.tools.permissionAria", { name })}
											className={styles.permissionCellSelect}
											value={overrides.get(canonicalToolName(name)) ?? "default"}
											disabled={!tools.builtin.includes(name)}
											onChange={(permission) => changePermission(name, permission)}
											options={[
												{ value: "default", label: t("agent.tools.followDefault", { label: inheritedLabel }) },
												{ value: "allow", label: t("agent.tools.alwaysAllow") },
												{ value: "ask", label: t("agent.tools.askEveryTime") },
											]}
										/>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	);
}
