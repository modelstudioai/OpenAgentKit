<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "../../i18n/index.ts";
import { formatUsageDayStart } from "../../lib/beijing-time.ts";
import { formatExactTokenCount, formatTokenCount } from "../../lib/format-token-count.ts";

interface HeatmapDay {
	day: string;
	amount: number;
	unit: string;
}

const props = withDefaults(defineProps<{ days: HeatmapDay[]; testId?: string }>(), {
	testId: "usage-activity",
});
const { t } = useTranslation("usage");

/** 与 React 版活动热力同一套四级色阶。 */
const HEAT_LEVELS = [
	"bg-[var(--kit-border)]",
	"bg-[var(--kit-heat)]/30",
	"bg-[var(--kit-heat)]/60",
	"bg-[var(--kit-heat)]",
];

const max = computed(() => props.days.reduce((value, day) => Math.max(value, day.amount), 0));
const levelOf = (amount: number) =>
	amount <= 0 ? 0 : amount <= max.value / 3 ? 1 : amount <= (max.value * 2) / 3 ? 2 : 3;

/** 近 53 周按周列排布，周一为首行；月份标注在月首列上方。 */
const columns = computed(() => {
	const first = props.days[0];
	const offset = first ? (new Date(`${first.day}T00:00:00.000Z`).getUTCDay() + 6) % 7 : 0;
	const result: { label: string | null; cells: (HeatmapDay | null)[] }[] = [];
	for (let start = 0; start < props.days.length + offset; start += 7) {
		const cells = Array.from({ length: 7 }, (_, row): HeatmapDay | null => {
			const index = start + row - offset;
			return index >= 0 && index < props.days.length ? (props.days[index] ?? null) : null;
		});
		const firstCell = cells.find((cell) => cell !== null);
		const month = firstCell ? Number(firstCell.day.slice(5, 7)) : null;
		const previousMonth = result
			.at(-1)
			?.cells.find((cell) => cell !== null)
			?.day.slice(5, 7);
		const label =
			month !== null && Number(previousMonth ?? month) !== month ? `${month}${t("heatmap.monthSuffix")}` : null;
		result.push({ label, cells });
	}
	return result;
});

const ariaLabel = computed(() =>
	t("heatmap.aria", { from: props.days[0]?.day ?? "", to: props.days.at(-1)?.day ?? "" }),
);

function tooltip(day: HeatmapDay) {
	return t("heatmap.tooltip", {
		since: formatUsageDayStart(day.day),
		amount:
			day.unit === "Token"
				? formatTokenCount(day.amount)
				: day.amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 }),
		unit: day.unit,
	});
}
</script>

<template>
	<div role="img" :aria-label="ariaLabel" :data-testid="testId" class="mt-5 min-w-0">
		<div class="flex flex-col gap-1">
			<div class="flex gap-[3px]" aria-hidden="true">
				<div v-for="(column, index) in columns" :key="index" class="relative h-4 min-w-0 flex-1">
					<span
						v-if="column.label"
						class="absolute top-0 left-0 text-[10px] leading-4 whitespace-nowrap text-[var(--kit-fg-muted)]"
					>
						{{ column.label }}
					</span>
				</div>
			</div>
			<div class="flex gap-[3px]">
				<div v-for="(column, index) in columns" :key="index" class="flex min-w-0 flex-1 flex-col gap-[3px]">
					<template v-for="(cell, row) in column.cells" :key="cell?.day ?? `empty-${index}-${row}`">
						<div
							v-if="cell"
							:data-day="cell.day"
							:title="cell.unit === 'Token' ? `${formatExactTokenCount(cell.amount)} Token` : undefined"
							class="group relative"
						>
							<span aria-hidden="true" :class="['block aspect-square w-full rounded-[2px]', HEAT_LEVELS[levelOf(cell.amount)]]" />
							<div
								role="tooltip"
								class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-[var(--kit-radius-sm)] bg-[var(--kit-fg)] px-2 py-1 text-[length:var(--kit-text-meta)] whitespace-nowrap text-[var(--kit-bg)] shadow-[var(--kit-shadow)] group-hover:block"
							>
								{{ tooltip(cell) }}
							</div>
						</div>
						<span v-else aria-hidden="true" class="aspect-square w-full" />
					</template>
				</div>
			</div>
		</div>
	</div>
</template>
