import type { PlazaCategory, PlazaEntry, PlazaView } from "@openagentkit/sdk/protocol";
import type { PlazaTabId } from "@openagentpack/kit-chat-ui-vue";

export type PlazaTranslate = (key: string) => string;

export interface PlazaSections {
	popular: PlazaEntry[];
	mine: PlazaEntry[];
	main: PlazaEntry[];
	mainTitle: string;
	mainHint?: string;
}

export function plazaCategoryName(t: PlazaTranslate, id: PlazaCategory): string {
	switch (id) {
		case "general":
			return t("categories.general");
		case "writing":
			return t("categories.writing");
		case "coding":
			return t("categories.coding");
		case "data":
			return t("categories.data");
		case "other":
			return t("categories.other");
	}
}

/** 按 slug 列表取条目：popular / featured 是服务端给的 slug 序，要映射回 entry 才能渲染卡片。 */
export function pick(agents: PlazaEntry[], slugs: string[]): PlazaEntry[] {
	const bySlug = new Map(agents.map((entry) => [entry.slug, entry]));
	return slugs.flatMap((slug) => {
		const entry = bySlug.get(slug);
		return entry ? [entry] : [];
	});
}

/**
 * 分区与主网格的派生规则（纯函数，方便推理）：
 * - 只有「精选 tab + 无关键词」才出「同学们都在用 / 我的 Agent」两个分区；
 * - 精选 tab 的主网格 = featured 条目，featured 为空时回落全部已上架（标题跟着变）；
 * - 分类 tab / 搜索时主网格 = 服务端已过滤的 agents。
 */
export function sectionsOf(view: PlazaView, tab: PlazaTabId, searching: boolean, t: PlazaTranslate): PlazaSections {
	const agents = view.agents;
	const onFeatured = tab === "featured";
	const featured = pick(agents, view.featured);
	const useFeatured = onFeatured && !searching && featured.length > 0;
	const showSections = onFeatured && !searching;
	const main = useFeatured ? featured : agents;
	/*
	 * 同一个 slug 在一页里只渲染一张卡：主网格优先，分区剔除已出现的条目。
	 * popular 在全员零用量时会回落到「全部已上架」，不去重就会和精选主网格重复。
	 */
	const shown = new Set(main.map((entry) => entry.slug));
	const takeUnique = (list: PlazaEntry[]): PlazaEntry[] => {
		const unique: PlazaEntry[] = [];
		for (const entry of list) {
			if (shown.has(entry.slug)) continue;
			shown.add(entry.slug);
			unique.push(entry);
		}
		return unique;
	};
	let mainTitle = t("allAgents");
	if (searching) mainTitle = t("searchResults");
	else if (onFeatured) mainTitle = useFeatured ? t("featured") : t("allAgents");
	else mainTitle = plazaCategoryName(t, tab as PlazaCategory);
	return {
		popular: showSections ? takeUnique(pick(agents, view.popular)) : [],
		mine: showSections ? takeUnique(agents.filter((entry) => entry.stats.mine)) : [],
		main,
		mainTitle,
		...(showSections && !useFeatured ? { mainHint: t("featuredHint") } : {}),
	};
}
