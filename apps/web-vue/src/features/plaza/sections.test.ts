import type { PlazaEntry, PlazaView } from "@openagentkit/sdk/protocol";
import { describe, expect, it } from "vitest";
import { sectionsOf } from "./sections.ts";

const t = (key: string) => key;

function entry(slug: string, overrides: Partial<PlazaEntry> = {}): PlazaEntry {
	return {
		slug,
		display_name: slug,
		suggested_prompts: [],
		capabilities: { streaming: true, fileUpload: true, artifacts: true, threads: true, reasoning: true },
		category: "general",
		featured: false,
		stats: { mine: false, turns_30d: 0 },
		...overrides,
	};
}

function view(agents: PlazaEntry[], featured: string[], popular: string[]): PlazaView {
	return {
		agents,
		featured,
		popular,
		categories: [{ id: "coding", name: "编程", count: agents.length }],
	};
}

describe("广场分区派生", () => {
	it("精选主网格优先，热门与我的分区按 slug 去重", () => {
		const a = entry("a");
		const b = entry("b", { featured: true, stats: { mine: true, turns_30d: 4 } });
		const result = sectionsOf(view([a, b], ["b"], ["a", "b"]), "featured", false, t);
		expect(result.main.map((item) => item.slug)).toEqual(["b"]);
		expect(result.popular.map((item) => item.slug)).toEqual(["a"]);
		expect(result.mine).toEqual([]);
		expect(result.mainTitle).toBe("featured");
	});

	it("没有精选时回落全部已上架，并给出提示", () => {
		const a = entry("a");
		const result = sectionsOf(view([a], [], ["a"]), "featured", false, t);
		expect(result.main.map((item) => item.slug)).toEqual(["a"]);
		expect(result.popular).toEqual([]);
		expect(result.mainTitle).toBe("allAgents");
		expect(result.mainHint).toBe("featuredHint");
	});

	it("分类或搜索命中时隐藏分区，主网格标题跟随状态", () => {
		const a = entry("a");
		const result = sectionsOf(view([a], ["a"], ["a"]), "coding", true, t);
		expect(result.main.map((item) => item.slug)).toEqual(["a"]);
		expect(result.popular).toEqual([]);
		expect(result.mine).toEqual([]);
		expect(result.mainTitle).toBe("searchResults");
	});
});
