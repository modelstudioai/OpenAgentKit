"use client";

import { ActivityHeatmap, CategoryTabs, MeterBar, PlazaCard, type PlazaTabId } from "@openagentpack/kit-chat-ui";
import type { PlazaEntry, PlazaView } from "@openagentpack/kit-sdk/protocol";
import { useState } from "react";

const exampleAgent: PlazaEntry = {
	slug: "weekly-writer",
	display_name: "周报助手",
	icon: "📝",
	category: "writing",
	featured: true,
	description: "把会议纪要和任务记录整理成可以直接发送的周报。",
	suggested_prompts: ["把这些任务记录整理成一份周报"],
	capabilities: { streaming: true, fileUpload: true, artifacts: true, threads: false, reasoning: false },
	stats: { turns_30d: 28, mine: true },
};

const categories: PlazaView["categories"] = [
	{ id: "writing", name: "写作", count: 1 },
	{ id: "coding", name: "编程", count: 1 },
	{ id: "data", name: "数据分析", count: 1 },
];

const exampleAgents = [
	exampleAgent,
	{ slug: "code-reviewer", display_name: "代码审阅助手", category: "coding", featured: false },
	{ slug: "table-analyst", display_name: "表格分析助手", category: "data", featured: true },
];

const activity = [0, 1, 4, 0, 6, 2, 0, 3, 0, 8, 1, 4, 0, 2, 0, 6, 9, 4, 0, 1, 0, 3, 5, 0, 7, 3, 0, 1, 2, 0].map(
	(turns, index) => ({ day: `2026-10-${String(index + 1).padStart(2, "0")}`, turns }),
);

export function PlazaCardDemo() {
	const [selected, setSelected] = useState("");
	return (
		<div className="w-full max-w-md space-y-3 p-6">
			<PlazaCard entry={exampleAgent} onOpen={setSelected} />
			<p role="status" className="text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
				{selected && `已选中 ${selected}`}
			</p>
		</div>
	);
}

export function CategoryTabsDemo() {
	const [active, setActive] = useState<PlazaTabId>("featured");
	const visibleAgents = exampleAgents.filter((agent) =>
		active === "featured" ? agent.featured : agent.category === active,
	);
	return (
		<div className="min-w-0 space-y-4 p-6">
			<CategoryTabs categories={categories} active={active} onChange={setActive} />
			<ul
				aria-label="当前分类的 Agent"
				className="divide-y divide-[var(--kit-border-subtle)] rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)]"
			>
				{visibleAgents.map((agent) => (
					<li key={agent.slug} className="px-4 py-3 text-[length:var(--kit-text-label)]">
						{agent.display_name}
					</li>
				))}
			</ul>
		</div>
	);
}

export function MeterBarDemo() {
	const [used, setUsed] = useState(60);
	const [unlimited, setUnlimited] = useState(false);
	const limit = 100;
	return (
		<div className="w-full max-w-lg space-y-4 p-6 text-[length:var(--kit-text-label)]">
			<div className="flex items-center justify-between gap-2">
				<span>当月额度</span>
				<span role="status" className="text-[var(--kit-fg-muted)] tabular-nums">
					{unlimited ? `已用 ${used}，不限量` : `已用 ${used} / ${limit}`}
				</span>
			</div>
			<MeterBar value={used} max={limit} unlimited={unlimited} />
			<label className="flex flex-wrap items-center gap-3">
				已用额度
				<input
					type="range"
					min={0}
					max={limit}
					value={used}
					onChange={(event) => setUsed(event.currentTarget.valueAsNumber)}
					className="min-w-24 flex-1 accent-[var(--kit-accent)]"
				/>
			</label>
			<label className="flex items-center gap-2">
				<input
					type="checkbox"
					checked={unlimited}
					onChange={(event) => setUnlimited(event.currentTarget.checked)}
					className="accent-[var(--kit-accent)]"
				/>
				不限量
			</label>
		</div>
	);
}

export function ActivityHeatmapDemo() {
	const [zeroTurns, setZeroTurns] = useState(false);
	const days = zeroTurns ? activity.map(({ day }) => ({ day, turns: 0 })) : activity;
	return (
		<div className="space-y-4 p-6">
			<ActivityHeatmap days={days} />
			<label className="flex items-center gap-2 text-[length:var(--kit-text-label)]">
				<input
					type="checkbox"
					checked={zeroTurns}
					onChange={(event) => setZeroTurns(event.currentTarget.checked)}
					className="accent-[var(--kit-accent)]"
				/>
				全部日期为 0 回合
			</label>
		</div>
	);
}

export const PLAZA_CARD_CODE = `import { PlazaCard } from "@openagentpack/kit-chat-ui";
import type { PlazaEntry } from "@openagentpack/kit-sdk/protocol";

export function AgentCard({
  entry,
  openAgent,
}: {
  entry: PlazaEntry;
  openAgent: (slug: string) => void;
}) {
  return <PlazaCard entry={entry} onOpen={openAgent} />;
}`;

export const CATEGORY_TABS_CODE = `import { CategoryTabs, type PlazaTabId } from "@openagentpack/kit-chat-ui";
import type { PlazaView } from "@openagentpack/kit-sdk/protocol";
import { useState } from "react";

export function AgentCategories({ view }: { view: PlazaView }) {
  const [active, setActive] = useState<PlazaTabId>("featured");
  const agents = view.agents.filter((agent) =>
    active === "featured" ? view.featured.includes(agent.slug) : agent.category === active
  );

  return (
    <>
      <CategoryTabs categories={view.categories} active={active} onChange={setActive} />
      <ul>
        {agents.map((agent) => <li key={agent.slug}>{agent.display_name}</li>)}
      </ul>
    </>
  );
}`;

export const METER_BAR_CODE = `import { MeterBar } from "@openagentpack/kit-chat-ui";

export function UsageProgress({
  used,
  limit,
  unlimited,
}: {
  used: number;
  limit: number;
  unlimited?: boolean;
}) {
  return (
    <>
      <p>已用 {used} / {unlimited ? "不限量" : limit}</p>
      <MeterBar value={used} max={limit} unlimited={unlimited} />
    </>
  );
}`;

export const ACTIVITY_HEATMAP_CODE = `import { ActivityHeatmap } from "@openagentpack/kit-chat-ui";
import { useQuota } from "@openagentpack/kit-sdk/usage/hooks";

export function RecentActivity() {
  const { quota } = useQuota();
  return quota ? <ActivityHeatmap days={quota.daily} /> : null;
}`;
