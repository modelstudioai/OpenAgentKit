<script setup lang="ts">
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import type { QuotaExceededDetails } from "@openagentkit/sdk/usage";
import { useQuotaRecovery } from "@openagentkit/sdk/usage/hooks-vue";
import { useTranslation } from "../../i18n/index.ts";
import { formatBeijingTime } from "../../lib/beijing-time.ts";
import { formatExactTokenCount, formatTokenCount } from "../../lib/format-token-count.ts";

const props = defineProps<{
	client: KitClient;
	details: QuotaExceededDetails;
	onRecovered: () => void;
	onOpenUsage: () => void;
}>();
const { t } = useTranslation("usage");
const limits = useQuotaRecovery(() => ({ client: props.client }));

const numberText = (value: number) => (props.details.metric === "tokens" ? formatTokenCount(value) : String(value));
const exactTokens = () =>
	props.details.metric === "tokens"
		? `${formatExactTokenCount(props.details.used)}/${formatExactTokenCount(props.details.limit)} Token`
		: undefined;
const metricLabel = () =>
	props.details.metric === "tokens"
		? "Token"
		: props.details.metric === "active_seconds"
			? t("quota.metricSeconds")
			: "Credits";

async function recheck() {
	if (await limits.recheck()) props.onRecovered();
}
</script>

<template>
	<div
		role="alert"
		data-testid="quota-banner"
		class="mx-4 mt-3 flex max-h-[calc(var(--kit-viewport-height,100dvh)/3)] min-w-0 shrink-0 flex-col gap-2 rounded-[var(--kit-radius)] border border-[var(--kit-danger)]/40 bg-[var(--kit-surface)] p-3 text-[length:var(--kit-text-caption)] leading-relaxed [overflow-wrap:anywhere] sm:flex-row sm:items-center sm:gap-3"
	>
		<div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
			<p class="text-[var(--kit-danger)]">
				{{
					t("quota.exceededPrefix", {
						period: details.period === "day" ? t("quota.today") : t("quota.month"),
						metric: metricLabel(),
					})
				}}
				<span :title="exactTokens()">{{ numberText(details.used) }}/{{ numberText(details.limit) }}</span>
				{{ t("quota.exceededSuffix", { reset: formatBeijingTime(details.reset_at) }) }}
			</p>
			<p v-if="limits.snapshot.value.error || limits.snapshot.value.notice" class="mt-2">
				{{ limits.snapshot.value.error ?? limits.snapshot.value.notice }}
			</p>
		</div>
		<div class="flex shrink-0 flex-wrap items-center gap-2">
			<button
				v-if="details.metric"
				type="button"
				:disabled="limits.snapshot.value.loading"
				class="min-h-10 shrink-0 rounded-[var(--kit-radius-sm)] border border-[var(--kit-danger)]/40 px-3 py-2 font-medium text-[var(--kit-danger)] transition-colors hover:bg-[var(--kit-danger)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50"
				@click="void recheck()"
			>
				{{ limits.snapshot.value.loading ? t("quota.rechecking") : t("quota.recheck") }}
			</button>
			<button
				v-else
				type="button"
				class="min-h-10 shrink-0 rounded-[var(--kit-radius-sm)] border border-[var(--kit-danger)]/40 px-3 py-2 font-medium text-[var(--kit-danger)] transition-colors hover:bg-[var(--kit-danger)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
				@click="onOpenUsage"
			>
				{{ t("quota.applyEntry") }}
			</button>
		</div>
	</div>
</template>
