import type { UsageLimitConfig } from "@openagentpack/kit-sdk/protocol";
import { Alert, Button, Input, Modal, Segmented } from "antd";
import type { TFunction } from "i18next";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminMutation } from "../../lib/admin/use-admin-mutation.ts";

import styles from "./usage.module.less";

/** 限额周期：月与日两套独立配置，编辑器按周期切换编辑对应字段。 */
export type LimitPeriod = "month" | "day";

const periodFields = (period: LimitPeriod) =>
	period === "month"
		? ({ tokens: "monthly_tokens", seconds: "monthly_active_seconds" } as const)
		: ({ tokens: "daily_tokens", seconds: "daily_active_seconds" } as const);

export function formatLimit(value: number | null, unit: string, t: TFunction<"usage">) {
	return value === null ? t("unlimited") : `${value.toLocaleString("zh-CN", { maximumFractionDigits: 6 })} ${unit}`;
}

export function limitsDescription(limits: UsageLimitConfig, t: TFunction<"usage">) {
	return [
		t("limits.monthlyTokens", { value: formatLimit(limits.monthly_tokens, "Token", t) }),
		t("limits.monthlySeconds", { value: formatLimit(limits.monthly_active_seconds, t("unitSeconds"), t) }),
		t("limits.dailyTokens", { value: formatLimit(limits.daily_tokens, "Token", t) }),
		t("limits.dailySeconds", { value: formatLimit(limits.daily_active_seconds, t("unitSeconds"), t) }),
	].join("\n");
}

type PendingChange = { kind: "save"; limits: UsageLimitConfig } | { kind: "reset"; limits: UsageLimitConfig };

function confirmBody(
	kind: PendingChange["kind"],
	title: string,
	initial: UsageLimitConfig,
	limits: UsageLimitConfig,
	t: TFunction<"usage">,
	mutationError?: string | null,
) {
	const effect =
		kind === "reset"
			? t("confirm.resetEffect")
			: title === t("editor.defaultTitle")
				? t("confirm.defaultEffect")
				: t("confirm.memberEffect");
	return t("confirm.body", {
		before: limitsDescription(initial, t),
		after: limitsDescription(limits, t),
		effect,
		notice: t("limitNotice"),
		errorSuffix: mutationError ? t("confirm.errorSuffix", { message: mutationError }) : "",
	});
}

/** 校验当前周期输入并生成完整限额草稿；校验失败返回错误文案。 */
function buildDraft(
	initial: UsageLimitConfig,
	period: LimitPeriod,
	tokens: string,
	hours: string,
	t: TFunction<"usage">,
): { limits: UsageLimitConfig } | { error: string } {
	const tokenText = tokens.trim();
	const hourText = hours.trim();
	const tokenValue = tokenText ? Number(tokenText) : null;
	const fields = periodFields(period);
	const initialSeconds = initial[fields.seconds];
	// hourText 未改动时保持原秒数，避免小时换算丢精度。
	const unchangedSeconds = hours === (initialSeconds === null ? "" : String(initialSeconds / 3600));
	const seconds = hourText ? (unchangedSeconds ? initialSeconds : Number(hourText) * 3600) : null;
	if (tokenValue !== null && (!/^\d+$/.test(tokenText) || !Number.isSafeInteger(tokenValue)))
		return { error: t("validation.tokenNonNegative") };
	if (seconds !== null && (!Number.isFinite(seconds) || seconds < 0))
		return { error: t("validation.secondsNonNegative") };
	return { limits: { ...initial, [fields.tokens]: tokenValue, [fields.seconds]: seconds } };
}

/** 周期切换：月/日按钮对，展示与编辑共用。 */
export function LimitPeriodTabs({
	period,
	onChange,
}: {
	period: LimitPeriod;
	onChange: (period: LimitPeriod) => void;
}) {
	const { t } = useTranslation("usage");
	return (
		<Segmented
			aria-label={t("period.aria")}
			value={period}
			onChange={(value) => onChange(value as LimitPeriod)}
			options={[
				{ label: t("period.monthTab"), value: "month" },
				{ label: t("period.dayTab"), value: "day" },
			]}
		/>
	);
}

/** 编辑草稿与真正写入之间保留一次显式确认；失败保留草稿和待确认差异。 */
export function UsageLimitEditor({
	title,
	initial,
	defaults,
	canReset = false,
	onSave,
	onReset,
	onClose,
}: {
	title: string;
	initial: UsageLimitConfig;
	defaults?: UsageLimitConfig;
	canReset?: boolean;
	onSave: (limits: UsageLimitConfig) => Promise<unknown>;
	onReset?: () => Promise<unknown>;
	onClose: () => void;
}) {
	const { t } = useTranslation("usage");
	const id = useId();
	const [period, setPeriod] = useState<LimitPeriod>("month");
	/** 指定周期的原始配置值（hourText 未改动时保持原秒数，避免小时换算丢精度）。 */
	const initialFor = (target: LimitPeriod) => {
		const targetFields = periodFields(target);
		return { tokens: initial[targetFields.tokens], seconds: initial[targetFields.seconds] };
	};
	const [tokens, setTokens] = useState(() => {
		const base = initialFor("month");
		return base.tokens === null ? "" : String(base.tokens);
	});
	const [hours, setHours] = useState(() => {
		const base = initialFor("month");
		return base.seconds === null ? "" : String(base.seconds / 3600);
	});
	const [validationError, setValidationError] = useState<string | null>(null);
	const [change, setChange] = useState<PendingChange | null>(null);
	const mutation = useAdminMutation(async (pending: PendingChange) => {
		if (pending.kind === "reset") await onReset?.();
		else await onSave(pending.limits);
		setChange(null);
		onClose();
	});
	/** 切换周期时以原始配置重置两个输入框（另一周期的编辑不丢失，保存整体提交）。 */
	const switchPeriod = (next: LimitPeriod) => {
		const base = initialFor(next);
		setPeriod(next);
		setTokens(base.tokens === null ? "" : String(base.tokens));
		setHours(base.seconds === null ? "" : String(base.seconds / 3600));
		setValidationError(null);
	};
	const prepare = () => {
		const result = buildDraft(initial, period, tokens, hours, t);
		if ("error" in result) {
			setValidationError(result.error);
			return;
		}
		setValidationError(null);
		setChange({ kind: "save", limits: result.limits });
	};
	return (
		<div className={styles.editorRoot}>
			<form
				aria-label={title}
				className={styles.formStack}
				onSubmit={(event) => {
					event.preventDefault();
					if (!mutation.pending) prepare();
				}}
			>
				<div className={styles.periodRow}>
					<span className={styles.rowLabel}>{t("period.rowLabel")}</span>
					<LimitPeriodTabs period={period} onChange={switchPeriod} />
				</div>
				<div className={styles.fieldsGrid}>
					<label htmlFor={`${id}-tokens`} className={styles.fieldLabel}>
						{t("editor.tokensLabel", { period: period === "month" ? t("period.month") : t("period.day") })}
						<Input
							id={`${id}-tokens`}
							inputMode="numeric"
							placeholder={t("unlimited")}
							value={tokens}
							disabled={mutation.pending}
							onChange={(event) => setTokens(event.target.value)}
							className={styles.fieldInput}
						/>
					</label>
					<label htmlFor={`${id}-hours`} className={styles.fieldLabel}>
						{t("editor.hoursLabel", { period: period === "month" ? t("period.month") : t("period.day") })}
						<Input
							id={`${id}-hours`}
							inputMode="decimal"
							placeholder={t("unlimited")}
							value={hours}
							disabled={mutation.pending}
							onChange={(event) => setHours(event.target.value)}
							className={styles.fieldInput}
						/>
					</label>
				</div>
				<p className={styles.hintText}>{t("editor.hint")}</p>
				{validationError && <Alert type="error" showIcon message={validationError} />}
				{mutation.error && !change && <Alert type="error" showIcon message={mutation.error} />}
				<div className={styles.formActions}>
					<Button type="primary" htmlType="submit" loading={mutation.pending}>
						{t("editor.save")}
					</Button>
					{canReset && onReset && (
						<Button
							disabled={mutation.pending || !defaults}
							onClick={() => defaults && setChange({ kind: "reset", limits: defaults })}
						>
							{t("editor.restore")}
						</Button>
					)}
					<Button disabled={mutation.pending} onClick={onClose}>
						{t("editor.cancel")}
					</Button>
				</div>
			</form>
			{change && (
				<Modal
					title={change.kind === "reset" ? t("confirm.titleReset") : t("confirm.titleSave", { title })}
					open
					okText={change.kind === "reset" ? t("confirm.okReset") : t("confirm.okSave")}
					confirmLoading={mutation.pending}
					onOk={() => void mutation.run(change).catch(() => undefined)}
					onCancel={() => setChange(null)}
				>
					<p className={styles.confirmBodyText}>
						{confirmBody(change.kind, title, initial, change.limits, t, mutation.error)}
					</p>
				</Modal>
			)}
		</div>
	);
}
