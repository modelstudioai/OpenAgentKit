// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { CodeHighlighter } from "./index.ts";

describe("CodeHighlighter（Vue）", () => {
	it("按语言高亮并暴露语义属性", () => {
		const wrapper = mount(CodeHighlighter, {
			props: { lang: "ts" },
			slots: { default: "const value: number = 1;" },
		});
		expect(wrapper.find("[data-code-highlighter]").exists()).toBe(true);
		expect(wrapper.find("code").attributes("data-language")).toBe("ts");
		expect(wrapper.find("code span").exists()).toBe(true);
	});

	it("未知语言保留纯文本", () => {
		const wrapper = mount(CodeHighlighter, {
			props: { lang: "not-a-language" },
			slots: { default: "plain text" },
		});
		expect(wrapper.find("code").text()).toBe("plain text");
	});
});
