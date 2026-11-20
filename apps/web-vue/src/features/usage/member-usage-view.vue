<script setup lang="ts">
import type { MemberUsageLimitView } from "@openagentkit/sdk/protocol";
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import { useQuota, useUsageLimits } from "@openagentkit/sdk/usage/hooks-vue";
import { ErrorState } from "@openagentpack/kit-chat-ui-vue";
import { computed } from "vue";
import { useTranslation } from "../../i18n/index.ts";
import { formatBeijingTime, formatUsageDayStart } from "../../lib/beijing-time.ts";
import UsageLimitCard from "./usage-limit-card.vue";
import YearHeatmap from "./year-heatmap.vue";

const props = defineProps<{
	client: KitClient;
	view: MemberUsageLimitView;
	loading: boolean;
	error: string | null;
}>();
const emit = defineEmits<{ reload: [] }>();
const { t } = useTranslation("usage");

/** 年热力固定一次查询近 53 周，独立请求不阻塞限额卡。 */
const HEATMAP_DAYS = 371;

const activityLimits = useUsageLimits({ client: props.client, days: HEATMAP_DAYS });
const activityQuota = useQuota({ client: props.client, days: HEATMAP_DAYS });

const rows = computed<{ day: string; amount: number; unit: string }[] | null>(() => {
	if (activityLimits.data.value) {
		return activityLimits.data.value.daily.map((row) => ({ day: row.day, amount: row.tokens, unit: "Token" }));
	}
	if (activityLimits.data.value === null && activityQuota.quota.value) {
		return activityQuota.quota.value.daily.map((row) => ({ day: row.day, amount: row.turns, unit: "Credits" }));
	}
	return null;
});

const range = computed(() => {
	const days = rows.value;
	const first = days?.[0];
	const last = days?.at(-1);
	return first && last ? t("heatmap.range", { from: first.day, to: last.day }) : "";
});

const activityError = computed(() => {
	if (activityLimits.error.value && activityLimits.data.value === undefined) return activityLimits.error.value;
	if (activityLimits.data.value === null && activityQuota.error.value) return activityQuota.error.value;
	return null;
});

function reloadActivity() {
	if (activityLimits.error.value && activityLimits.data.value === undefined) void activityLimits.reload();
	else void activityQuota.reload();
}
</script>

<template>
	<div class="h-full min-w-0 overflow-y-auto" data-testid="member-usage-limits">
		<div class="mx-auto w-full min-w-0 max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
			<header class="flex flex-wrap items-start justify-between gap-4">
				<div class="min-w-0">
					<h1 class="text-[length:var(--kit-text-display)] font-semibold leading-snug">
						{{ t("creditsPage.title") }}
					</h1>
					<p class="mt-2 text-[length:var(--kit-text-label)] leading-relaxed text-[var(--kit-fg-muted)] [overflow-wrap:anywhere]">
						{{ t("resetLine", { month: view.month, time: formatBeijingTime(view.reset_at) }) }}
					</p>
				</div>
				<button
					type="button"
					:disabled="loading"
					class="min-h-10 shrink-0 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] px-4 py-2 text-[length:var(--kit-text-label)] font-medium transition-colors hover:bg-[var(--kit-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50"
					@click="emit('reload')"
				>
					{{ loading ? t("member.refreshing") : t("member.refresh") }}
				</button>
			</header>

			<ErrorState v-if="error" :message="error" :on-retry="() => emit('reload')" />

			<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				<UsageLimitCard
					:metric="view.day_state.tokens"
					:title="t('member.dayTitle')"
					unit="Token"
					test-id="limit-daily-tokens"
					period="day"
					:hint="
						t('member.dayHint', {
							start: formatUsageDayStart(view.day_state.day),
							reset: formatBeijingTime(view.day_state.reset_at),
						})
					"
				/>
				<UsageLimitCard
					:metric="view.tokens"
					:title="t('member.monthTokenTitle')"
					unit="Token"
					test-id="limit-tokens"
				/>
				<UsageLimitCard
					:metric="view.active_seconds"
					:title="t('member.durationTitle')"
					:unit="t('member.unitSeconds')"
					test-id="limit-active_seconds"
				/>
			</div>

			<section class="min-w-0 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-5 [overflow-wrap:anywhere] md:p-6">
				<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
					<div class="flex min-w-0 flex-wrap items-baseline gap-2">
						<h3 class="text-[length:var(--kit-text-base)] font-semibold">{{ t("member.activityTitle") }}</h3>
						<span v-if="rows" class="text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">{{ range }}</span>
					</div>
					<span
						v-if="rows"
						class="flex items-center gap-1 text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]"
					>
						{{ t("heatmap.less") }}
						<span aria-hidden="true" class="h-3 w-3 rounded-[var(--kit-radius-xs)] bg-[var(--kit-border)]" />
						<span aria-hidden="true" class="h-3 w-3 rounded-[var(--kit-radius-xs)] bg-[var(--kit-heat)]/30" />
						<span aria-hidden="true" class="h-3 w-3 rounded-[var(--kit-radius-xs)] bg-[var(--kit-heat)]/60" />
						<span aria-hidden="true" class="h-3 w-3 rounded-[var(--kit-radius-xs)] bg-[var(--kit-heat)]" />
						{{ t("heatmap.more") }}
					</span>
				</div>
				<div v-if="activityError" class="mt-4">
					<ErrorState :message="activityError" :on-retry="reloadActivity" />
				</div>
				<YearHeatmap v-else-if="rows" :days="rows" />
				<p v-else role="status" class="mt-5 text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)]">
					{{ t("member.activityLoading") }}
				</p>
			</section>

			<div class="space-y-2 rounded-[var(--kit-radius)] bg-[var(--kit-bg-subtle)] p-4 text-[length:var(--kit-text-caption)] leading-relaxed text-[var(--kit-fg-muted)] [overflow-wrap:anywhere] md:p-5">
				<p>{{ t("member.noteCompute") }}</p>
				<p>{{ t("member.noteSince", { start: formatBeijingTime(view.accounting_started_at) }) }}</p>
				<p>{{ t("member.noteLimits") }}</p>
				<p>{{ t("member.noteCollection") }}</p>
				<p v-if="view.refreshed_at">{{ t("member.lastCollected", { time: formatBeijingTime(view.refreshed_at) }) }}</p>
			</div>
		</div>
	</div>
</template>
