import { type ProjectVaultCredentialInput, ProjectVaultCredentialInputSchema } from "@openagentkit/sdk/protocol";
import { Button, Checkbox, Input, Modal, Select } from "antd";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { localizedValidationMessage } from "../../lib/validation-message.ts";
import styles from "./template-forms.module.less";

export interface VaultCredentialDraft {
	id: string;
	input: ProjectVaultCredentialInput;
}

function isUnchangedImported(
	initial: VaultCredentialDraft | undefined,
	input: Pick<ProjectVaultCredentialInput, "name" | "secret_name" | "secret_value" | "allowed_hosts">,
) {
	if (!initial || initial.input.secret_value || input.secret_value) return false;
	return (
		input.name.trim() === initial.input.name &&
		input.secret_name.trim() === initial.input.secret_name &&
		JSON.stringify([...input.allowed_hosts].sort()) === JSON.stringify([...initial.input.allowed_hosts].sort())
	);
}

/** managed agent 的环境变量密钥表单；这里只修改页面密钥库草稿，不发请求。 */
export function TemplateVaultCredentialDialog({
	initial,
	siblings,
	opener,
	onSave,
	onClose,
}: {
	initial?: VaultCredentialDraft;
	siblings: VaultCredentialDraft[];
	opener: HTMLButtonElement;
	onSave: (value: VaultCredentialDraft) => void;
	onClose: () => void;
}) {
	const { t } = useTranslation("templates");
	const prefix = useId();
	const source = initial?.input ?? {
		name: "",
		secret_name: "",
		secret_value: "",
		allowed_hosts: [],
		acknowledged: false,
	};
	const [name, setName] = useState(source.name);
	const [secretName, setSecretName] = useState(source.secret_name);
	const [secretValue, setSecretValue] = useState(source.secret_value);
	const [hosts, setHosts] = useState(source.allowed_hosts.join("\n"));
	const [acknowledged, setAcknowledged] = useState(source.acknowledged);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const allowedHosts = [
		...new Set(
			hosts
				.split(/[,，\n]/)
				.map((host) => host.trim().toLowerCase())
				.filter(Boolean),
		),
	];
	const allHosts = allowedHosts.includes("*");
	const unchangedImported = isUnchangedImported(initial, {
		name,
		secret_name: secretName,
		secret_value: secretValue,
		allowed_hosts: allowedHosts,
	});
	const restoreFocus = () => {
		setTimeout(() => {
			if (opener.isConnected) opener.focus({ preventScroll: true });
		});
	};
	function save() {
		if (unchangedImported) {
			close();
			return;
		}
		const result = ProjectVaultCredentialInputSchema.safeParse({
			name,
			secret_name: secretName,
			secret_value: secretValue,
			allowed_hosts: allowedHosts,
			acknowledged,
		});
		const issues: Record<string, string> = {};
		if (!result.success)
			for (const issue of result.error.issues) issues[String(issue.path[0])] ??= localizedValidationMessage(issue);
		const others = siblings.filter((item) => item.id !== initial?.id);
		if (others.some((item) => item.input.name === name.trim())) issues.name = t("vault.dialog.duplicateName");
		if (others.some((item) => item.input.secret_name === secretName.trim()))
			issues.secret_name = t("vault.dialog.duplicateVariable");
		setErrors(issues);
		if (!result.success || Object.keys(issues).length) return;
		onSave({ id: initial?.id ?? crypto.randomUUID(), input: result.data });
		close();
	}
	const close = () => {
		onClose();
		restoreFocus();
	};
	const error = (field: string) =>
		errors[field] ? (
			<p id={`${prefix}-${field}-error`} role="alert" className={styles.errorSmall}>
				{errors[field]}
			</p>
		) : null;
	return (
		<Modal
			open
			centered
			width={512}
			title={initial ? t("vault.dialog.editTitle") : t("vault.dialog.addTitle")}
			onCancel={close}
			styles={{ body: { maxHeight: "calc(100dvh - 220px)", overflowY: "auto" } }}
			footer={
				<div className={styles.formActions}>
					<Button onClick={close}>{t("cancel")}</Button>
					<Button type="primary" disabled={!acknowledged && !unchangedImported} onClick={save}>
						{initial ? t("vault.dialog.save") : t("vault.dialog.add")}
					</Button>
				</div>
			}
		>
			<div className={styles.dialogBody}>
				<p className={styles.metaText}>{t("vault.dialog.hint")}</p>
				<div className={styles.stack2}>
					<label htmlFor={`${prefix}-name`}>
						{t("vault.dialog.name")}{" "}
						<span aria-hidden="true" className={styles.errorColor}>
							*
						</span>
					</label>
					<Input
						id={`${prefix}-name`}
						required
						maxLength={50}
						value={name}
						onChange={(event) => setName(event.target.value)}
						aria-invalid={Boolean(errors.name)}
						aria-describedby={errors.name ? `${prefix}-name-error` : undefined}
					/>
					{error("name")}
				</div>
				<div className={styles.stack2}>
					<label htmlFor={`${prefix}-type`}>{t("vault.dialog.type")}</label>
					<Select
						id={`${prefix}-type`}
						aria-label={t("vault.dialog.typeAria")}
						disabled
						value="environment_variable"
						options={[{ value: "environment_variable", label: t("vault.dialog.typeEnvironment") }]}
						className={styles.fullControl}
					/>
				</div>
				<div className={styles.stack2}>
					<label htmlFor={`${prefix}-variable`}>
						{t("vault.dialog.variable")}{" "}
						<span aria-hidden="true" className={styles.errorColor}>
							*
						</span>
					</label>
					<Input
						id={`${prefix}-variable`}
						required
						maxLength={200}
						placeholder={t("vault.dialog.variablePlaceholder")}
						value={secretName}
						onChange={(event) => setSecretName(event.target.value)}
						aria-invalid={Boolean(errors.secret_name)}
						aria-describedby={errors.secret_name ? `${prefix}-secret_name-error` : undefined}
					/>
					{error("secret_name")}
				</div>
				<div className={styles.stack2}>
					<label htmlFor={`${prefix}-value`}>
						{t("vault.dialog.value")}{" "}
						<span aria-hidden="true" className={styles.errorColor}>
							*
						</span>
					</label>
					<Input.Password
						id={`${prefix}-value`}
						required
						autoComplete="new-password"
						spellCheck={false}
						maxLength={500}
						placeholder={t("vault.dialog.valuePlaceholder")}
						value={secretValue}
						onChange={(event) => setSecretValue(event.target.value)}
						aria-invalid={Boolean(errors.secret_value)}
						aria-describedby={errors.secret_value ? `${prefix}-secret_value-error` : undefined}
					/>
					{error("secret_value")}
				</div>
				<div className={styles.stack2}>
					<label htmlFor={`${prefix}-placement`}>{t("vault.dialog.placement")}</label>
					<Select
						id={`${prefix}-placement`}
						aria-label={t("vault.dialog.placementAria")}
						disabled
						value="header"
						options={[{ value: "header", label: t("vault.dialog.placementHeader") }]}
						className={styles.fullControl}
					/>
				</div>
				<div className={styles.previewBox}>
					<p>
						{t("vault.dialog.previewAgent")}
						<code className={styles.breakAll}>{`Authorization: Bearer \${${secretName || "MY_API_KEY"}}`}</code>
					</p>
					<p>
						{t("vault.dialog.previewGateway")}
						<code>Authorization: Bearer ••••••••</code>
					</p>
				</div>
				<div className={styles.stack2}>
					<label htmlFor={`${prefix}-hosts`}>
						{t("vault.dialog.hosts")}{" "}
						<span aria-hidden="true" className={styles.errorColor}>
							*
						</span>
					</label>
					<Input.TextArea
						id={`${prefix}-hosts`}
						required
						rows={2}
						maxLength={3000}
						placeholder={t("vault.dialog.hostsPlaceholder")}
						value={hosts}
						onChange={(event) => {
							setHosts(event.target.value);
							setAcknowledged(false);
						}}
						aria-invalid={Boolean(errors.allowed_hosts)}
						aria-describedby={`${prefix}-hosts-hint${errors.allowed_hosts ? ` ${prefix}-allowed_hosts-error` : ""}`}
					/>
					<p id={`${prefix}-hosts-hint`} className={styles.metaText}>
						{t("vault.dialog.hostsHint")}
					</p>
					{error("allowed_hosts")}
				</div>
				<div className={styles.acknowledgeBox}>
					<p>{allHosts ? t("vault.dialog.ackAll") : t("vault.dialog.ackShared")}</p>
					<Checkbox checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)}>
						{allHosts ? t("vault.dialog.ackAllCheckbox") : t("vault.dialog.ackSharedCheckbox")}
					</Checkbox>
					{error("acknowledged")}
				</div>
			</div>
		</Modal>
	);
}
