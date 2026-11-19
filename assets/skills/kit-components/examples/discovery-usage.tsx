import type { PlazaCategory, PlazaEntry } from "@openagentkit/sdk/protocol";
import { ActivityHeatmap, CategoryTabs, MeterBar, PlazaCard, type PlazaTabId } from "@openagentpack/kit-chat-ui";

export interface DiscoveryUsageProps {
	entries: PlazaEntry[];
	categories: { id: PlazaCategory; name: string; count: number }[];
	active: PlazaTabId;
	onCategoryChange: (next: PlazaTabId) => void;
	onOpen: (slug: string) => void;
	used: number;
	limit: number;
	unlimited: boolean;
	days: { day: string; turns: number }[];
}

// 调用方通过 Hook 获取数据，并负责筛选、导航和额度策略。
export function DiscoveryUsage(props: DiscoveryUsageProps) {
	return (
		<section>
			<CategoryTabs categories={props.categories} active={props.active} onChange={props.onCategoryChange} />
			<div className="grid gap-4">
				{props.entries.map((entry) => (
					<PlazaCard key={entry.slug} entry={entry} onOpen={props.onOpen} />
				))}
			</div>
			<h2>月度用量</h2>
			<MeterBar value={props.used} max={props.limit} unlimited={props.unlimited} />
			<ActivityHeatmap days={props.days} />
		</section>
	);
}
