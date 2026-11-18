import { useQuotaRecovery } from "@openagentpack/kit-sdk/usage/hooks";
import { useTranslation } from "react-i18next";
import { formatBeijingTime } from "../../lib/beijing-time.ts";
import { formatExactTokenCount, formatTokenCount } from "../../lib/format-token-count.ts";
import type { QuotaExceededDetails } from "../../lib/quota-error.ts";

/** 按服务端新结果解除发送禁用；失败、缺失和仍超限均保留草稿与禁用状态。 */
export function QuotaBanner({
	details,
	onRecovered,
	onOpenUsage,
}: {
	details: QuotaExceededDetails;
	onRecovered: () => void;
	onOpenUsage: () => void;
}) {
	const { t } = useTranslation("usage");
	const limits = useQuotaRecovery();
	const numberText = details.metric === "tokens" ? formatTokenCount : String;
	const exactTokens =
		details.metric === "tokens"
			? `${formatExactTokenCount(details.used)}/${formatExactTokenCount(details.limit)} Token`
			: undefined;
	const label =
		details.metric === "tokens" ? "Token" : details.metric === "active_seconds" ? t("quota.metricSeconds") : "Credits";
	async function recheck() {
		if (await limits.recheck()) onRecovered();
	}
	return (
		<div
			role="alert"
			data-testid="quota-banner"
			className="mx-4 mt-3 flex max-h-[calc(var(--kit-viewport-height,100dvh)/3)] min-w-0 shrink-0 flex-col gap-2 rounded-[var(--kit-radius)] border border-[var(--kit-danger)]/40 bg-[var(--kit-surface)] p-3 text-[length:var(--kit-text-caption)] leading-relaxed [overflow-wrap:anywhere] sm:flex-row sm:items-center sm:gap-3"
		>
			<div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
				<p className="text-[var(--kit-danger)]">
					{t("quota.exceededPrefix", {
						period: details.period === "day" ? t("quota.today") : t("quota.month"),
						metric: label,
					})}
					<span title={exactTokens}>
						{numberText(details.used)}/{numberText(details.limit)}
					</span>
					{t("quota.exceededSuffix", { reset: formatBeijingTime(details.reset_at) })}
				</p>
				{(limits.error || limits.notice) && <p className="mt-2">{limits.error ?? limits.notice}</p>}
			</div>
			<div className="flex shrink-0 flex-wrap items-center gap-2">
				{details.metric ? (
					<button
						type="button"
						disabled={limits.loading}
						onClick={() => void recheck()}
						className="min-h-10 shrink-0 rounded-[var(--kit-radius-sm)] border border-[var(--kit-danger)]/40 px-3 py-2 font-medium text-[var(--kit-danger)] transition-colors hover:bg-[var(--kit-danger)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{limits.loading ? t("quota.rechecking") : t("quota.recheck")}
					</button>
				) : (
					<button
						type="button"
						onClick={onOpenUsage}
						className="min-h-10 shrink-0 rounded-[var(--kit-radius-sm)] border border-[var(--kit-danger)]/40 px-3 py-2 font-medium text-[var(--kit-danger)] transition-colors hover:bg-[var(--kit-danger)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
					>
						{t("quota.applyEntry")}
					</button>
				)}
			</div>
		</div>
	);
}
