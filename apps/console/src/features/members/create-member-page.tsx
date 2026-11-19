import { ArrowLeftOutlined } from "@ant-design/icons";
import { CreateMemberRequestSchema, type CreateMemberResponse } from "@openagentpack/kit-sdk/protocol";
import { Alert, Button, Input, Radio, Typography } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./members.module.less";
import { useCreateMember } from "./use-members.ts";

interface MemberDraft {
	username: string;
	display_name: string;
	email: string;
	password_mode: "auto" | "custom";
	password: string;
}

const EMPTY_DRAFT: MemberDraft = {
	username: "",
	display_name: "",
	email: "",
	password_mode: "auto",
	password: "",
};

function CreatedMember({ result, onBack }: { result: CreateMemberResponse["data"]; onBack: () => void }) {
	const { t } = useTranslation("members");
	return (
		<section aria-labelledby="member-created-heading" className={styles.stack}>
			<h2 id="member-created-heading" className={styles.pageTitle}>
				{t("create.createdTitle")}
			</h2>
			<dl className={styles.createdGrid}>
				<div>
					<dt className={styles.mutedText}>{t("columns.username")}</dt>
					<dd className={styles.monoValue}>{result.member.username}</dd>
				</div>
				<div>
					<dt className={styles.mutedText}>{t("columns.displayName")}</dt>
					<dd className={styles.termValue}>{result.member.display_name}</dd>
				</div>
			</dl>
			{result.initial_password && (
				<div className={styles.passwordPanel}>
					<h3 className={styles.panelTitle}>{t("create.initialPassword")}</h3>
					<p className={styles.mutedText}>{t("create.initialPasswordNote")}</p>
					<Typography.Text
						copyable={{ text: result.initial_password }}
						data-testid="initial-password"
						className={styles.passwordText}
					>
						{result.initial_password}
					</Typography.Text>
				</div>
			)}
			<p className={styles.mutedText}>{t("create.memberAdded")}</p>
			<Button type="primary" onClick={onBack}>
				{t("create.backToList")}
			</Button>
		</section>
	);
}

function FieldError({ field, errors }: { field: keyof MemberDraft; errors: Record<string, string> }) {
	return errors[field] ? (
		<p id={`member-${field}-error`} className={styles.fieldError}>
			{errors[field]}
		</p>
	) : null;
}

export function CreateMemberPage({
	onBack,
	onPendingChange,
}: {
	onBack: () => void;
	onPendingChange: (pending: boolean) => void;
}) {
	const { t } = useTranslation("members");
	const [draft, setDraft] = useState<MemberDraft>(EMPTY_DRAFT);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const creation = useCreateMember(onPendingChange);
	const update = (field: keyof MemberDraft, value: string) => {
		setDraft((current) => ({ ...current, [field]: value }));
		setErrors((current) => ({ ...current, [field]: "" }));
	};
	const submit = async () => {
		const parsed = CreateMemberRequestSchema.safeParse({
			username: draft.username,
			display_name: draft.display_name,
			...(draft.email.trim() ? { email: draft.email.trim() } : {}),
			auth_type: "local",
			password_mode: draft.password_mode,
			...(draft.password_mode === "custom" ? { password: draft.password } : {}),
		});
		if (!parsed.success) {
			const next: Record<string, string> = {};
			for (const issue of parsed.error.issues) {
				const field = String(issue.path[0]);
				next[field] ??= issue.message;
			}
			setErrors(next);
			return;
		}
		setErrors({});
		if (await creation.create(parsed.data)) setDraft(EMPTY_DRAFT);
	};
	if (creation.result) return <CreatedMember result={creation.result} onBack={onBack} />;
	return (
		<form
			noValidate
			autoComplete="off"
			aria-labelledby="create-member-heading"
			className={styles.stack}
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<header className={styles.pageHeaderCenter}>
				<div className={styles.headerLeft}>
					<Button aria-label={t("create.backToList")} disabled={creation.pending} onClick={onBack}>
						<ArrowLeftOutlined />
						{t("create.back")}
					</Button>
					<h2 id="create-member-heading" className={styles.pageTitle}>
						{t("create.title")}
					</h2>
				</div>
				<Button type="primary" htmlType="submit" loading={creation.pending}>
					{t("create.createNow")}
				</Button>
			</header>
			{creation.error && <Alert type="error" showIcon closable message={creation.error} />}
			<fieldset disabled={creation.pending} className={styles.formSections}>
				<legend className={styles.srOnly}>{t("create.formLegend")}</legend>
				<div className={styles.fieldGrid}>
					<div className={styles.fieldRow}>
						<label htmlFor="member-username">
							{t("columns.username")}{" "}
							<span aria-hidden="true" className={styles.requiredMark}>
								*
							</span>
						</label>
						<Input
							id="member-username"
							name="username"
							required
							maxLength={32}
							value={draft.username}
							onChange={(event) => update("username", event.target.value)}
							aria-invalid={!!errors.username}
							aria-describedby="member-username-hint member-username-error"
						/>
						<p id="member-username-hint" className={styles.fieldHint}>
							{t("create.usernameHint")}
						</p>
						<FieldError field="username" errors={errors} />
					</div>
					<div className={styles.fieldRow}>
						<label htmlFor="member-display_name">
							{t("columns.displayName")}{" "}
							<span aria-hidden="true" className={styles.requiredMark}>
								*
							</span>
						</label>
						<Input
							id="member-display_name"
							name="display_name"
							required
							maxLength={32}
							value={draft.display_name}
							onChange={(event) => update("display_name", event.target.value)}
							aria-invalid={!!errors.display_name}
							aria-describedby="member-display_name-hint member-display_name-error"
						/>
						<p id="member-display_name-hint" className={styles.fieldHint}>
							{t("create.displayNameHint")}
						</p>
						<FieldError field="display_name" errors={errors} />
					</div>
				</div>
				<div className={styles.fieldRow}>
					<label htmlFor="member-email">
						{t("columns.email")} <span className={styles.mutedText}>{t("create.emailOptional")}</span>
					</label>
					<Input
						id="member-email"
						name="email"
						type="email"
						maxLength={254}
						value={draft.email}
						onChange={(event) => update("email", event.target.value)}
						aria-invalid={!!errors.email}
						aria-describedby="member-email-error"
					/>
					<FieldError field="email" errors={errors} />
				</div>
				<div>
					<p className={styles.sectionLabel}>{t("columns.authMethod")}</p>
					<p className={styles.staticField}>{t("columns.authLocal")}</p>
				</div>
				<fieldset className={styles.passwordSection}>
					<legend className={styles.legendTitle}>{t("create.passwordSection")}</legend>
					<Radio.Group
						disabled={creation.pending}
						value={draft.password_mode}
						onChange={(event) => {
							if (event.target.value === "auto") {
								update("password_mode", "auto");
								update("password", "");
								return;
							}
							update("password_mode", "custom");
						}}
					>
						<Radio value="auto">{t("create.autoPassword")}</Radio>
						<Radio value="custom">{t("create.customPassword")}</Radio>
					</Radio.Group>
					{draft.password_mode === "auto" ? (
						<p className={styles.autoPasswordHint}>{t("create.autoPasswordHint")}</p>
					) : (
						<div className={styles.fieldRow}>
							<label htmlFor="member-password">
								{t("create.initialPassword")}{" "}
								<span aria-hidden="true" className={styles.requiredMark}>
									*
								</span>
							</label>
							<Input.Password
								id="member-password"
								name="password"
								autoComplete="new-password"
								required
								maxLength={32}
								value={draft.password}
								onChange={(event) => update("password", event.target.value)}
								aria-invalid={!!errors.password}
								aria-describedby="member-password-hint member-password-error"
							/>
							<p id="member-password-hint" className={styles.fieldHint}>
								{t("create.passwordHint")}
							</p>
							<FieldError field="password" errors={errors} />
						</div>
					)}
				</fieldset>
			</fieldset>
		</form>
	);
}
