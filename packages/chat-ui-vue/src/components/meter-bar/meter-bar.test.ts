// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { MeterBar } from "./index.ts";

describe("MeterBar（Vue）", () => {
	it("按比例渲染并暴露进度语义", () => {
		const wrapper = mount(MeterBar, { props: { value: 30, max: 100 } });
		const bar = wrapper.get("[role='progressbar']");
		expect(bar.attributes("aria-valuenow")).toBe("30");
	});

	it("不限量只渲染轨道", () => {
		const wrapper = mount(MeterBar, { props: { value: 0, max: 0, unlimited: true } });
		expect(wrapper.findAll("div").length).toBe(1);
	});
});
