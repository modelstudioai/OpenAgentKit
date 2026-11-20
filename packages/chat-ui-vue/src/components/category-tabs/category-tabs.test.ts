// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { CategoryTabs } from "./index.ts";

describe("CategoryTabs（Vue）", () => {
	it("点击分类回传新 id", async () => {
		const onChange = vi.fn();
		const wrapper = mount(CategoryTabs, {
			props: {
				categories: [{ id: "writing", name: "写作", count: 2 }],
				active: "featured",
				onChange,
			},
		});
		await wrapper.findAll("button").at(1)?.trigger("click");
		expect(onChange).toHaveBeenCalledWith("writing");
	});
});
