// @vitest-environment jsdom
import { skillInputMarkerRanges } from "@openagentkit/sdk/protocol";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { atomicBackspace, Sender, serializeEditable } from "./index.ts";

describe("Sender（Vue）", () => {
	it("atomicBackspace 删除完整技能标记与尾随空格", () => {
		const value = "/review 帮我看下";
		const markers = skillInputMarkerRanges(value, ["review"]);
		expect(atomicBackspace(value, 4, 4, markers)).toEqual({ value: "帮我看下", caret: 0 });
	});

	it("渲染 chip 并能序列化回原文", async () => {
		const wrapper = mount(Sender, {
			props: { defaultValue: "/review 帮我看下", skills: [{ name: "review" }] },
			attachTo: document.body,
		});
		await nextTick();
		expect(wrapper.find("[data-skill='review']").exists()).toBe(true);
		const input = wrapper.find("[role='textbox']").element as HTMLElement;
		expect(serializeEditable(input)).toBe("/review 帮我看下");
		wrapper.unmount();
	});

	it("提交时派生技能名单", async () => {
		const wrapper = mount(Sender, {
			props: { defaultValue: "/review 帮我看看", skills: [{ name: "review" }] },
		});
		await nextTick();
		await wrapper.find("form").trigger("submit");
		expect(wrapper.emitted("submit")?.[0]).toEqual(["/review 帮我看看", ["review"]]);
	});

	it("Enter 提交、空草稿不提交", async () => {
		const wrapper = mount(Sender, { props: { defaultValue: "hello" } });
		await nextTick();
		await wrapper.find("[role='textbox']").trigger("keydown", { key: "Enter" });
		expect(wrapper.emitted("submit")?.length).toBe(1);

		const empty = mount(Sender);
		await nextTick();
		await empty.find("form").trigger("submit");
		expect(empty.emitted("submit")).toBeUndefined();
	});
});
