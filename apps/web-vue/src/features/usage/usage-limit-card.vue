<script setup lang="ts">
import type { UsageLimitMetricState } from "@openagentkit/sdk/protocol";
import { MeterBar } from "@openagentpack/kit-chat-ui-vue";
import { computed } from "vue";
import { useTranslation } from "../../i18n/index.ts";
import { formatExactTokenCount, formatTokenCount } from "../../lib/format-token-count.ts";

const props = withDefaults(
	defineProps<{
		metric: UsageLimitMetricState;
		title: string;
		unit: string;
		testId: string;
		period?: "day" | "month";
		hint?: string;
	}>(),
	{ period: "month", hint: "" },
);
const { t } = useTranslation("usage");

const remaining = computed(() => (props.metric.remaining === null ? null : Math.max(0, props.metric.remaining)));
const status = computed(
	() =>
		({
			ok: t("member.statusOk"),
			exceeded: t("member.statusExceeded"),
			unavailable: t("member.statusUnavailable"),
		})[props.metric.status],
);
const statusClass = computed(
	() =>
		({
			ok: "bg-[var(--kit-bg-subtle)] text-[var(--kit-fg-muted)]",
			exceeded: "bg-[var(--kit-danger)]/10 text-[var(--kit-danger)]",
			unavailable: "bg-[var(--kit-warning)]/10 text-[var(--kit-warning-fg)]",
		})[props.metric.status],
);

function numberText(value: number) {
	return props.unit === "Token" ? formatTokenCount(value) : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function tokenTitle(value: number | null) {
	return props.unit === "Token" && value !== null ? `${formatExactTokenCount(value)} Token` : undefined;
}
</script>

<template>
	<section
		:data-testid="testId"
		class="min-w-0 space-y-5 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-5 [overflow-wrap:anywhere] md:p-6"
	>
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-[length:var(--kit-text-base)] font-semibold">{{ title }}</h2>
			<p role="status" :class="['rounded-full px-2 py-1 text-[length:var(--kit-text-caption)]', statusClass]">
				{{ status }}
			</p>
		</div>
		<dl class="space-y-3 text-[length:var(--kit-text-label)]">
			<div class="mb-5 flex flex-col gap-2">
				<dt class="text-[var(--kit-fg-muted)]">
					{{ period === "day" ? t("member.usedToday") : t("member.usedMonth") }}
				</dt>
				<dd
					:title="tokenTitle(metric.used)"
					class="text-[length:var(--kit-text-display)] font-semibold leading-snug tabular-nums"
				>
					{{ metric.used === null ? t("member.pendingFetch") : `${numberText(metric.used)} ${unit}` }}
				</dd>
			</div>
			<div class="flex flex-wrap justify-between gap-2">
				<dt class="text-[var(--kit-fg-muted)]">
					{{ period === "day" ? t("member.limitDay") : t("member.limitMonth") }}
				</dt>
				<dd :title="tokenTitle(metric.limit)" class="font-medium tabular-nums">
					{{ metric.limit === null ? t("unlimited") : `${numberText(metric.limit)} ${unit}` }}
				</dd>
			</div>
			<div class="flex flex-wrap justify-between gap-2">
				<dt class="text-[var(--kit-fg-muted)]">{{ t("member.remaining") }}</dt>
				<dd :title="tokenTitle(remaining)" class="font-medium tabular-nums">
					{{
						metric.limit === null
							? t("unlimited")
							: remaining === null
								? t("member.remainingPending")
								: `${numberText(remaining)} ${unit}`
					}}
				</dd>
			</div>
		</dl>
		<MeterBar v-if="metric.used !== null" :value="metric.used" :max="metric.limit ?? 0" :unlimited="metric.limit === null" />
		<p v-if="hint" class="text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">{{ hint }}</p>
	</section>
</template>
