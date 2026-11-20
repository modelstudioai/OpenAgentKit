<script setup lang="ts">
import { useAgentCatalog } from "@openagentkit/sdk/agents/hooks-vue";
import type { AgentSummary, QuotaRequestView, QuotaView } from "@openagentkit/sdk/protocol";
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import { useCreateQuotaRequest, useQuota, useQuotaRequests } from "@openagentkit/sdk/usage/hooks-vue";
import { ActivityHeatmap, EmptyState, ErrorState, isIconImageSource, MeterBar } from "@openagentpack/kit-chat-ui-vue";
import { computed, nextTick, ref } from "vue";
import { useTranslation } from "../../i18n/index.ts";
import { formatBeijingTime } from "../../lib/beijing-time.ts";
import ApplyCreditsDialog, { type ApplyCreditsValues } from "./apply-credits-dialog.vue";

const props = defineProps<{ client: KitClient }>();
const emit = defineEmits<{ openAgent: [slug: string] }>();
const { t } = useTranslation(["usage", "common"]);

const quotaQuery = useQuota({ client: props.client });
const requestsQuery = useQuotaRequests({ client: props.client });
const agentsQuery = useAgentCatalog({ client: props.client });
const createRequest = useCreateQuotaRequest({ client: props.client });

const quota = computed(() => quotaQuery.quota.value);
const requests = computed(() => requestsQuery.requests.value);
const agents = computed(() => agentsQuery.agents.value);
const applyOpen = ref(false);

const unlimited = computed(() => Boolean(quota.value && (quota.value.unlimited || quota.value.limit < 0)));
const percentage = computed(() => {
	const view = quota.value;
	if (!view || unlimited.value || view.limit <= 0) return 0;
	return Math.min(100, Math.round((view.used / view.limit) * 100));
});
const remaining = computed(() => (unlimited.value ? t("unlimited") : String(quota.value?.remaining ?? "—")));
const pendingRequest = computed(
	() => quota.value?.pending_request !== null && quota.value?.pending_request !== undefined,
);

function agentOf(slug: string): AgentSummary | undefined {
	return agents.value.find((agent) => agent.slug === slug);
}

function statusTone(status: QuotaRequestView["status"]) {
	if (status === "approved") return "bg-[var(--kit-success)]/15 text-[var(--kit-success)]";
	if (status === "rejected") return "bg-[var(--kit-danger)]/15 text-[var(--kit-danger)]";
	return "bg-[var(--kit-warning)]/15 text-[var(--kit-warning-fg)]";
}

async function submitRequest(values: ApplyCreditsValues): Promise<string | null> {
	try {
		await createRequest.submit({
			requestedCredits: values.requestedCredits,
			...(values.reason ? { reason: values.reason } : {}),
		});
		// 申请成功后额度与历史都要刷新：pending chip 与「我的申请」列表都依赖它们。
		await Promise.all([quotaQuery.reload(), requestsQuery.reload()]);
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

async function closeApply(completed: boolean) {
	applyOpen.value = false;
	await nextTick();
	const selector = completed ? '[data-testid="usage-meter"]' : '[data-testid="usage-apply-btn"]';
	document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
}
</script>

<template>
	<div class="h-full min-w-0 overflow-y-auto">
		<div class="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 md:px-8 md:py-8">
			<h1 class="text-[length:var(--kit-text-display)] font-semibold leading-snug">{{ t("creditsPage.title") }}</h1>
			<p class="mt-2 text-[length:var(--kit-text-label)] leading-relaxed text-[var(--kit-fg-muted)]">
				{{ t("creditsPage.sub") }}
			</p>

			<div v-if="quotaQuery.error.value" class="mt-6 min-w-0 [overflow-wrap:anywhere]">
				<ErrorState :message="quotaQuery.error.value" :on-retry="quotaQuery.reload" />
			</div>
			<div
				v-else-if="!quota"
				class="mt-6 rounded-[var(--kit-radius)] border border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] py-6"
			>
				<EmptyState :title="t('common:loading')" loading />
			</div>
			<template v-else>
				<div class="mt-6 grid min-w-0 gap-4 lg:grid-cols-2">
					<div class="flex min-w-0 flex-col gap-4">
						<section
							data-testid="usage-meter"
							tabindex="-1"
							:aria-label="t('credits.ariaMeter')"
							class="min-w-0 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-5 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] md:p-6"
						>
							<div class="flex flex-wrap items-baseline justify-between gap-2">
								<h2 class="text-[length:var(--kit-text-base)] font-semibold">{{ t("credits.title") }}</h2>
								<span class="text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">
									{{ t("resetLine", { month: quota.month, time: formatBeijingTime(quota.reset_at) }) }}
								</span>
							</div>
							<div class="mt-5 text-[length:var(--kit-text-display)] font-semibold leading-snug tabular-nums">
								<template v-if="unlimited">{{ t("unlimited") }}</template>
								<template v-else>
									{{ quota.used }}
									<span class="ml-1 text-[length:var(--kit-text-heading)] font-normal text-[var(--kit-fg-muted)]">
										/ {{ quota.limit }}
									</span>
								</template>
							</div>
							<div class="mt-2 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" data-testid="usage-meter-summary">
								{{ t("credits.usedSummary", { used: unlimited ? quota.used : `${percentage}%`, remaining }) }}
							</div>
							<MeterBar class="mt-3" :value="quota.used" :max="quota.limit" :unlimited="unlimited" />
							<ul v-if="quota.packs.length > 0" class="mt-3 flex flex-col gap-1.5">
								<li
									v-for="pack in quota.packs"
									:key="pack.id"
									class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--kit-radius-sm)] bg-[var(--kit-bg-subtle)] px-3 py-2 text-[length:var(--kit-text-caption)]"
								>
									<span class="min-w-0 flex-1 truncate" :title="pack.reason">{{ pack.reason ?? t("credits.packDefaultReason") }}</span>
									<span class="font-semibold text-[var(--kit-success)]">+{{ pack.credits }}</span>
									<span class="text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">
										{{ t("credits.packExpires", { month: pack.month }) }}
									</span>
								</li>
							</ul>
							<div class="mt-4 flex flex-wrap items-center gap-2">
								<button
									type="button"
									data-testid="usage-apply-btn"
									:disabled="pendingRequest"
									class="min-h-10 flex-1 rounded-[var(--kit-radius-sm)] bg-[var(--kit-accent)] px-4 py-2 text-[length:var(--kit-text-label)] font-medium text-[var(--kit-accent-fg)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
									@click="applyOpen = true"
								>
									{{ t("credits.apply") }}
								</button>
								<span
									v-if="pendingRequest"
									class="rounded-full bg-[var(--kit-warning)]/15 px-2 py-0.5 text-[length:var(--kit-text-meta)] font-semibold text-[var(--kit-warning-fg)]"
								>
									{{ t("credits.approving") }}
								</span>
							</div>
						</section>

						<section
							v-if="quota.per_agent.length > 0"
							class="min-w-0 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-5 [overflow-wrap:anywhere] md:p-6"
						>
							<div class="mb-5 flex flex-wrap items-baseline gap-2">
								<h2 class="text-[length:var(--kit-text-base)] font-semibold">{{ t("apps.title") }}</h2>
								<span class="text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">{{ t("apps.hint") }}</span>
							</div>
							<div class="flex flex-wrap gap-2">
								<button
									v-for="row in quota.per_agent"
									:key="row.agent_slug"
									type="button"
									:data-testid="`usage-agent-${row.agent_slug}`"
									:title="`${agentOf(row.agent_slug)?.display_name ?? row.agent_slug}：${row.turns} turns`"
									class="flex w-20 min-w-0 flex-col items-center gap-2 rounded-[var(--kit-radius-sm)] border border-transparent p-2 text-[length:var(--kit-text-meta)] transition-colors hover:border-[var(--kit-border)] hover:bg-[var(--kit-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
									@click="emit('openAgent', row.agent_slug)"
								>
									<span
										class="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--kit-radius-icon)] bg-[var(--kit-surface)] text-[length:var(--kit-text-title)]"
										aria-hidden="true"
									>
										<img
											v-if="isIconImageSource(agentOf(row.agent_slug)?.icon)"
											:src="agentOf(row.agent_slug)?.icon"
											alt=""
											class="h-3/5 w-3/5 object-contain"
										/>
										<template v-else>{{ agentOf(row.agent_slug)?.icon ?? "🤖" }}</template>
									</span>
									<span class="w-full truncate">{{ agentOf(row.agent_slug)?.display_name ?? row.agent_slug }}</span>
								</button>
							</div>
						</section>
					</div>

					<div class="flex min-w-0 flex-col gap-4">
						<section class="min-w-0 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-5 [overflow-wrap:anywhere] md:p-6">
							<div class="mb-5 flex flex-wrap items-baseline gap-2">
								<h2 class="text-[length:var(--kit-text-base)] font-semibold">{{ t("activity30") }}</h2>
							</div>
							<ActivityHeatmap :days="quota.daily" />
						</section>

						<section class="min-w-0 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-5 [overflow-wrap:anywhere] md:p-6">
							<div class="mb-5 flex flex-wrap items-baseline gap-2">
								<h2 class="text-[length:var(--kit-text-base)] font-semibold">{{ t("usagePanel.title") }}</h2>
								<span class="text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">{{ t("usagePanel.hint") }}</span>
							</div>
							<p v-if="quota.per_agent.length === 0" class="text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
								{{ t("table.empty") }}
							</p>
							<table v-else class="w-full table-fixed border-collapse text-[length:var(--kit-text-caption)]">
								<caption class="sr-only">{{ t("table.caption") }}</caption>
								<thead>
									<tr class="text-left text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">
										<th scope="col" class="w-8 pb-2 font-medium">#</th>
										<th scope="col" class="pb-2 font-medium">{{ t("table.colApp") }}</th>
										<th scope="col" class="w-16 pb-2 text-right font-medium">Turns</th>
										<th scope="col" class="w-16 pb-2 pl-3 font-medium sm:w-24">占比</th>
									</tr>
								</thead>
								<tbody>
									<tr
										v-for="(row, index) in quota.per_agent"
										:key="row.agent_slug"
										class="border-t border-[var(--kit-border-subtle)] align-middle"
									>
										<td class="py-3">
											<span class="grid h-5 w-5 place-items-center rounded-full bg-[var(--kit-bg-subtle)] text-[length:var(--kit-text-meta)] font-semibold">
												{{ index + 1 }}
											</span>
										</td>
										<td class="py-3 pr-2">
											<span class="block truncate" :title="agentOf(row.agent_slug)?.display_name ?? row.agent_slug">
												{{ agentOf(row.agent_slug)?.display_name ?? row.agent_slug }}
											</span>
										</td>
										<td class="py-3 text-right tabular-nums [overflow-wrap:anywhere]">{{ row.turns }}</td>
										<td class="py-3 pl-3">
											<MeterBar :value="row.turns" :max="Math.max(...quota.per_agent.map((item) => item.turns), 0)" class="h-1.5" />
										</td>
									</tr>
								</tbody>
							</table>
						</section>
					</div>
				</div>

				<section v-if="requests.length > 0" class="mt-8 min-w-0">
					<h2 class="mb-4 text-[length:var(--kit-text-heading)] font-semibold">{{ t("requests.title") }}</h2>
					<ul class="flex flex-col gap-3">
						<li
							v-for="request in requests"
							:key="request.id"
							:data-testid="`usage-request-${request.status}`"
							class="min-w-0 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-4 text-[length:var(--kit-text-caption)] leading-relaxed [overflow-wrap:anywhere] md:p-5"
						>
							<div class="flex flex-wrap items-center gap-2">
								<span :class="['rounded-full px-2 py-0.5 text-[length:var(--kit-text-meta)] font-semibold', statusTone(request.status)]">
									{{
										request.status === "approved"
											? t("requests.approved")
											: request.status === "rejected"
												? t("requests.rejected")
												: t("credits.approving")
									}}
								</span>
								<span class="font-semibold">{{ t("requests.summary", { credits: request.requested_credits }) }}</span>
								<span
									v-if="request.status === 'approved' && request.mode"
									class="rounded-full bg-[var(--kit-bg-subtle)] px-2 py-0.5 text-[length:var(--kit-text-meta)] font-semibold text-[var(--kit-fg-muted)]"
								>
									{{ request.mode === "override" ? t("requests.modeOverride") : t("requests.modePack") }}
								</span>
								<span
									v-if="request.status === 'approved' && request.granted_credits !== null"
									class="font-semibold text-[var(--kit-success)]"
								>
									+{{ request.granted_credits }}
								</span>
								<span class="ml-auto text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">
									{{ formatBeijingTime(request.created_at) }}
								</span>
							</div>
							<p v-if="request.reason" class="mt-1.5 text-[var(--kit-fg-muted)]">
								{{ t("requests.reason", { reason: request.reason }) }}
							</p>
							<p v-if="request.status === 'rejected' && request.review_note" class="mt-1.5 text-[var(--kit-danger)]">
								{{ t("requests.reviewNote", { note: request.review_note }) }}
							</p>
							<p v-if="request.reviewed_at" class="mt-1.5 text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">
								{{ t("requests.reviewedAt", { time: formatBeijingTime(request.reviewed_at) }) }}
							</p>
						</li>
					</ul>
				</section>
			</template>
		</div>

		<ApplyCreditsDialog v-if="applyOpen" :on-submit="submitRequest" @close="closeApply" />
	</div>
</template>
