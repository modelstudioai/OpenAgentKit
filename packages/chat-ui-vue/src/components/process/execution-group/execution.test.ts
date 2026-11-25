// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { ExecutionGroup, type ProcessPart } from "./index.ts";

const parts: ProcessPart[] = [
	{ type: "reasoning", id: "r1", text: "先确认事件流是否已经就绪。", status: "done" },
	{
		type: "tool",
		id: "t1",
		toolId: "call_1",
		name: "read_file",
		status: "done",
		input: { path: "src/app.ts" },
		output: { ok: true },
	},
];

describe("ExecutionGroup（Vue）", () => {
	it("汇总步骤数并渲染每一条过程", async () => {
		const wrapper = mount(ExecutionGroup, { props: { parts } });
		expect(wrapper.text()).toContain("2 步");
		expect(wrapper.text()).toContain("已执行");
		const steps = wrapper.findAll("details");
		expect(steps.length).toBe(3);
		expect(wrapper.text()).toContain("读取文件");
	});
});
