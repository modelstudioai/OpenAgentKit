// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { Markdown } from "./index.ts";

describe("Markdown（Vue）", () => {
	it("渲染 GFM 表格并包在可聚焦区域里", () => {
		const wrapper = mount(Markdown, {
			slots: { default: () => "| 字段 | 说明 |\n| --- | --- |\n| event_id | 游标 |" },
		});
		expect(wrapper.find("table").exists()).toBe(true);
		expect(wrapper.find("section[aria-label='表格']").attributes("tabindex")).toBe("0");
	});

	it("代码围栏交给 CodeHighlighter，并保留语言", () => {
		const wrapper = mount(Markdown, {
			slots: { default: () => "```ts\nconst value = 1;\n```" },
		});
		expect(wrapper.find("[data-code-highlighter]").exists()).toBe(true);
		expect(wrapper.find("code[data-language='ts']").exists()).toBe(true);
	});

	it("原始 HTML 与脚本被丢弃，不进入 DOM", () => {
		const wrapper = mount(Markdown, {
			slots: { default: () => '<script>alert("xss")</script><img src="x" onerror="alert(1)" />' },
		});
		expect(wrapper.find("script").exists()).toBe(false);
		expect(wrapper.find("img").exists()).toBe(false);
	});
});
