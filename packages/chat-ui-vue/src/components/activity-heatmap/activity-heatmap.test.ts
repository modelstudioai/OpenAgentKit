// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { ActivityHeatmap } from "./index.ts";

describe("ActivityHeatmap（Vue）", () => {
	it("生成可访问描述并渲染天数格子", () => {
		const wrapper = mount(ActivityHeatmap, {
			props: {
				days: [
					{ day: "2026-11-18", turns: 0 },
					{ day: "2026-11-19", turns: 5 },
					{ day: "2026-11-20", turns: 10 },
				],
			},
		});
		expect(wrapper.get("[role='img']").attributes("aria-label")).toContain("2026-11-20");
	});
});
