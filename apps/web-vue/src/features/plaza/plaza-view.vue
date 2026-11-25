<script setup lang="ts">
import { usePlaza } from "@openagentkit/sdk/agents/hooks-vue";
import type { PlazaCategory } from "@openagentkit/sdk/protocol";
import type { KitClient } from "@openagentkit/sdk/providers/kit";
import { CategoryTabs, EmptyState, ErrorState, PlazaCard, type PlazaTabId } from "@openagentpack/kit-chat-ui-vue";
import { computed, nextTick, onMounted, onUpdated, ref, watch } from "vue";
import { useTranslation } from "../../i18n/index.ts";
import { useDebounced } from "../../lib/use-debounced.ts";
import { plazaCategoryName, sectionsOf } from "./sections.ts";

const props = withDefaults(defineProps<{ client: KitClient; heading?: boolean }>(), { heading: true });
const emit = defineEmits<{ open: [slug: string] }>();
const { t } = useTranslation(["plaza", "common"]);

/** 卡片网格：H5 单列，md 两列，xl 三列（同包靠断点适配，不出第二套布局）。 */
const GRID = "grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";

const tab = ref<PlazaTabId>("featured");
const keyword = ref("");
const trimmed = computed(() => keyword.value.trim());
const q = useDebounced(trimmed, 250);
const source = computed(() => {
	const category = tab.value === "featured" ? undefined : (tab.value as PlazaCategory);
	return {
		client: props.client,
		...(category ? { category } : {}),
		...(q.value ? { q: q.value } : {}),
	};
});
const { view, loading, error, reload } = usePlaza(source);
const searching = computed(() => q.value.length > 0);
const localizedCategories = computed(() =>
	(view.value?.categories ?? []).map((item) => ({ ...item, name: plazaCategoryName(t, item.id) })),
);
const sections = computed(() => (view.value ? sectionsOf(view.value, tab.value, searching.value, t) : null));

/*
 * CategoryTabs 是冻结公开面、不接受 data-testid；这里按它的渲染顺序（「精选」+ categories）
 * 给每个 tab 补 E2E 锚点，避免为了 testid 在 web 侧复制一份 tab 组件。
 */
const tabsRef = ref<HTMLElement | null>(null);
const tabIds = computed<PlazaTabId[]>(() => [
	"featured",
	...(view.value?.categories ?? []).map((category) => category.id),
]);
function applyTabTestIds() {
	const buttons = tabsRef.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
	if (!buttons) return;
	tabIds.value.forEach((id, index) => {
		buttons[index]?.setAttribute("data-testid", `plaza-tab-${id}`);
	});
}
onMounted(applyTabTestIds);
onUpdated(applyTabTestIds);
watch(tabIds, () => void nextTick(applyTabTestIds), { flush: "post" });

function open(slug: string) {
	emit("open", slug);
}
</script>

<template>
	<div class="h-full min-w-0 overflow-y-auto">
		<div class="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 md:px-8 md:py-8">
			<div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
				<div class="min-w-0">
					<h1 v-if="heading" class="text-[length:var(--kit-text-display)] font-semibold leading-snug">
						{{ t("heading") }}
					</h1>
					<p class="mt-2 text-[length:var(--kit-text-label)] leading-relaxed text-[var(--kit-fg-muted)]">
						{{ t("sub") }}
					</p>
				</div>
				<div class="relative w-full lg:w-72 lg:shrink-0">
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--kit-fg-muted)]"
					>
						<circle cx="10.5" cy="10.5" r="6.5" />
						<path stroke-linecap="round" d="m16 16 4 4" />
					</svg>
					<input
						v-model="keyword"
						type="search"
						:placeholder="t('searchPlaceholder')"
						:aria-label="t('searchAria')"
						data-testid="plaza-search"
						class="min-h-11 w-full min-w-0 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] py-2 pl-10 pr-3 text-[length:var(--kit-text-heading)] placeholder:text-[var(--kit-fg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] md:text-[length:var(--kit-text-label)]"
					/>
				</div>
			</div>

			<slot />

			<div ref="tabsRef" data-testid="plaza-tabs" class="mt-6 min-w-0">
				<CategoryTabs :categories="localizedCategories" :active="tab" :on-change="(next) => (tab = next)" />
			</div>

			<div v-if="error" class="mt-8 min-w-0 [overflow-wrap:anywhere]">
				<ErrorState :message="error" :on-retry="reload" />
			</div>
			<div
				v-else-if="loading || !sections"
				class="mt-8 rounded-[var(--kit-radius)] border border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] py-6"
			>
				<EmptyState :title="t('common:loading')" loading />
			</div>
			<template v-else>
				<section v-if="sections.popular.length > 0" class="mt-8 min-w-0">
					<div class="mb-4 flex flex-wrap items-baseline gap-2">
						<h2 class="text-[length:var(--kit-text-heading)] font-semibold">{{ t("popularTitle") }}</h2>
						<span class="text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">{{ t("popularHint") }}</span>
					</div>
					<div :class="GRID">
						<div
							v-for="entry in sections.popular"
							:key="entry.slug"
							:data-testid="`plaza-card-${entry.slug}`"
							class="h-full min-w-0 [&>div]:h-full"
						>
							<PlazaCard :entry="entry" :on-open="open" />
						</div>
					</div>
				</section>

				<section v-if="sections.mine.length > 0" class="mt-8 min-w-0">
					<div class="mb-4 flex flex-wrap items-baseline gap-2">
						<h2 class="text-[length:var(--kit-text-heading)] font-semibold">{{ t("mineTitle") }}</h2>
						<span class="text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">{{ t("mineHint") }}</span>
					</div>
					<div :class="GRID">
						<div
							v-for="entry in sections.mine"
							:key="entry.slug"
							:data-testid="`plaza-card-${entry.slug}`"
							class="h-full min-w-0 [&>div]:h-full"
						>
							<PlazaCard :entry="entry" :on-open="open" />
						</div>
					</div>
				</section>

				<section class="mt-8 min-w-0">
					<div class="mb-4 flex flex-wrap items-baseline gap-2">
						<h2 class="text-[length:var(--kit-text-heading)] font-semibold">{{ sections.mainTitle }}</h2>
						<span
							v-if="sections.mainHint"
							class="text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]"
						>
							{{ sections.mainHint }}
						</span>
					</div>
					<div v-if="sections.main.length > 0" :class="GRID">
						<div
							v-for="entry in sections.main"
							:key="entry.slug"
							:data-testid="`plaza-card-${entry.slug}`"
							class="h-full min-w-0 [&>div]:h-full"
						>
							<PlazaCard :entry="entry" :on-open="open" />
						</div>
					</div>
					<div
						v-else
						class="rounded-[var(--kit-radius)] border border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] py-6"
					>
						<EmptyState :title="searching ? t('emptySearch') : t('emptyPlaza')" :hint="t('emptyHint')" />
					</div>
				</section>
			</template>
		</div>
	</div>
</template>
