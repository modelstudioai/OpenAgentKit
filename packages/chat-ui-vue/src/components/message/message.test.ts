// @vitest-environment jsdom
import type { ChatMessage } from "@openagentkit/sdk/messages";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { Message } from "./index.ts";

describe("Message（Vue）", () => {
	it("用户消息把协议 token 还原成技能 chip", () => {
		const message: ChatMessage = {
			id: "u1",
			role: "user",
			status: "done",
			parts: [{ type: "text", text: "[使用 Skill:review] 排查一下" }],
		};
		const wrapper = mount(Message, { props: { message, skills: ["review"] } });
		expect(wrapper.find("svg").exists()).toBe(true);
		expect(wrapper.text()).toContain("review");
		expect(wrapper.text()).toContain("排查一下");
	});

	it("助手消息渲染 Markdown", () => {
		const message: ChatMessage = {
			id: "a1",
			role: "assistant",
			status: "done",
			parts: [{ type: "text", text: "## 结论\n\n- 第一条" }],
		};
		const wrapper = mount(Message, { props: { message } });
		expect(wrapper.find("h2").text()).toBe("结论");
	});
});
