import { DeleteOutlined } from "@ant-design/icons";
import { Button, Input, Select } from "antd";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { EnvironmentNetworkingFields } from "./environment-networking-fields.tsx";
import { ENVIRONMENT_PACKAGE_MANAGERS, type EnvironmentCreateDraft } from "./template-environment-form-draft.ts";
import styles from "./template-forms.module.less";

const PACKAGE_MANAGERS = ENVIRONMENT_PACKAGE_MANAGERS;
const MAX_ROWS = 50;

function RemoveRowButton({ label, onRemove }: { label: string; onRemove: () => void }) {
	return (
		<Button
			type="text"
			size="small"
			aria-label={label}
			title={label}
			icon={<DeleteOutlined />}
			onClick={onRemove}
			className={styles.shrinkZero}
		/>
	);
}

/** 仅编辑环境草稿；保存位置与提交由调用方负责。 */
export function EnvironmentCreateFields({
	value,
	onChange,
}: {
	value: EnvironmentCreateDraft;
	onChange: (next: EnvironmentCreateDraft) => void;
}) {
	const { t } = useTranslation("templates");
	const id = useId();
	const updatePackage = (id: string, patch: Partial<EnvironmentCreateDraft["packages"][number]>) =>
		onChange({ ...value, packages: value.packages.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
	const updateMetadata = (id: string, patch: Partial<EnvironmentCreateDraft["metadata"][number]>) =>
		onChange({ ...value, metadata: value.metadata.map((row) => (row.id === id ? { ...row, ...patch } : row)) });
	return (
		<div className={styles.createRoot}>
			<div className={`${styles.fieldStack} ${styles.body13}`}>
				<label htmlFor={`${id}-name`}>
					{t("agent.environment.form.name")}{" "}
					<span aria-hidden="true" className={styles.errorColor}>
						*
					</span>
				</label>
				<Input
					id={`${id}-name`}
					aria-label={t("agent.environment.form.name")}
					required
					maxLength={50}
					value={value.name}
					onChange={(event) => onChange({ ...value, name: event.target.value })}
				/>
			</div>
			<div className={`${styles.fieldStack} ${styles.body13}`}>
				<label htmlFor={`${id}-description`}>{t("agent.environment.form.description")}</label>
				<Input.TextArea
					id={`${id}-description`}
					aria-label={t("agent.environment.form.description")}
					rows={3}
					maxLength={200}
					value={value.description}
					onChange={(event) => onChange({ ...value, description: event.target.value })}
				/>
			</div>
			<EnvironmentNetworkingFields value={value} onChange={onChange} />
			<section
				aria-label={t("agent.environment.form.packages")}
				className={`${styles.shrinkRoot} ${styles.blockStack}`}
			>
				<div>
					<div className={styles.rowBetweenSm}>
						<h3 className={styles.heading13}>{t("agent.environment.form.packages")}</h3>
						<Button
							type="link"
							size="small"
							aria-label={t("agent.environment.form.addPackage")}
							disabled={value.packages.length >= MAX_ROWS}
							className={`${styles.shrinkZero} ${styles.linkButton}`}
							onClick={() => {
								if (value.packages.length >= MAX_ROWS) return;
								onChange({
									...value,
									packages: [...value.packages, { id: crypto.randomUUID(), manager: "apt", value: "" }],
								});
							}}
						>
							<span aria-hidden="true">+</span> {t("agent.environment.form.add")}
						</Button>
					</div>
					<p id={`${id}-packages-hint`} className={styles.metaText}>
						{t("agent.environment.form.packageHint")}
					</p>
				</div>
				<div className={styles.stack2}>
					{value.packages.map((row, index) => (
						<div key={row.id} className={styles.entryRow}>
							<div className={styles.managerCell}>
								<Select
									aria-label={t("agent.environment.form.packageManager")}
									value={row.manager}
									className={styles.fullControl}
									options={PACKAGE_MANAGERS.map((manager) => ({ value: manager, label: manager }))}
									onChange={(manager) => {
										const found = PACKAGE_MANAGERS.find((option) => option === manager);
										if (found) updatePackage(row.id, { manager: found });
									}}
								/>
							</div>
							<Input
								aria-label={t("agent.environment.form.packageName")}
								aria-describedby={`${id}-packages-hint`}
								placeholder={t("agent.environment.form.packagePlaceholder")}
								maxLength={200}
								value={row.value}
								onChange={(event) => updatePackage(row.id, { value: event.target.value })}
								className={styles.flexFill}
							/>
							<RemoveRowButton
								label={t("agent.environment.form.removePackage", { index: index + 1 })}
								onRemove={() => onChange({ ...value, packages: value.packages.filter((item) => item.id !== row.id) })}
							/>
						</div>
					))}
				</div>
			</section>
			<section
				aria-label={t("agent.environment.form.metadata")}
				className={`${styles.metadataSection} ${styles.shrinkRoot}`}
			>
				<div>
					<div className={styles.rowBetweenSm}>
						<h3 className={styles.heading13}>{t("agent.environment.form.metadata")}</h3>
						<Button
							type="link"
							size="small"
							aria-label={t("agent.environment.form.addMetadata")}
							disabled={value.metadata.length >= MAX_ROWS}
							className={`${styles.shrinkZero} ${styles.linkButton}`}
							onClick={() => {
								if (value.metadata.length >= MAX_ROWS) return;
								onChange({ ...value, metadata: [...value.metadata, { id: crypto.randomUUID(), key: "", value: "" }] });
							}}
						>
							<span aria-hidden="true">+</span> {t("agent.environment.form.add")}
						</Button>
					</div>
					<p id={`${id}-metadata-hint`} className={styles.metaText}>
						{t("agent.environment.form.metadataHint")}
					</p>
				</div>
				<div className={styles.stack2}>
					{value.metadata.map((row, index) => {
						const invalid = /[A-Z]/.test(row.key);
						const errorId = `${id}-${row.id}-error`;
						return (
							<div key={row.id} className={`${styles.entryRow} ${styles.shrinkRoot}`}>
								<div className={`${styles.flexFill} ${styles.fieldStack}`}>
									<Input
										aria-label={t("agent.environment.form.metadataKey")}
										aria-invalid={invalid}
										aria-describedby={invalid ? `${id}-metadata-hint ${errorId}` : `${id}-metadata-hint`}
										placeholder={t("agent.environment.form.metadataKeyPlaceholder")}
										maxLength={64}
										value={row.key}
										onChange={(event) => updateMetadata(row.id, { key: event.target.value })}
										className={styles.shrinkRoot}
										status={invalid ? "error" : undefined}
									/>
									{invalid ? (
										<p id={errorId} className={styles.errorSmall}>
											{t("agent.environment.form.metadataLowercase")}
										</p>
									) : null}
								</div>
								<Input
									aria-label={t("agent.environment.form.metadataValue")}
									placeholder={t("agent.environment.form.metadataValuePlaceholder")}
									maxLength={200}
									value={row.value}
									onChange={(event) => updateMetadata(row.id, { value: event.target.value })}
									className={styles.flexFill}
								/>
								<RemoveRowButton
									label={t("agent.environment.form.removeMetadata", { index: index + 1 })}
									onRemove={() => onChange({ ...value, metadata: value.metadata.filter((item) => item.id !== row.id) })}
								/>
							</div>
						);
					})}
				</div>
			</section>
		</div>
	);
}
