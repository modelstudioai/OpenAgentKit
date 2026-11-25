// @vitest-environment jsdom
import type { ChatToolApproval } from "@openagentkit/sdk/chat";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ToolApprovalCard } from "./index.ts";

const approval: ChatToolApproval = {
	batch_id: "b1",
	call_id: "c1",
	request_event_id: null,
	name: "write_file",
	arguments: { path: "src/app.ts" },
	tool_type: "function",
	actionable: true,
	status: "pending",
};

describe("ToolApprovalCard（Vue）", () => {
	it("点击允许提交 allow 决策", async () => {
		const onDecision = vi.fn(async () => undefined);
		const wrapper = mount(ToolApprovalCard, {
			props: { approval, onDecision, onRefresh: async () => undefined },
		});
		await wrapper.get("button:last-of-type").trigger("click");
		expect(onDecision).toHaveBeenCalledWith({ batch_id: "b1", call_id: "c1", result: "allow" });
	});

	it("展示工具名与参数摘要", () => {
		const wrapper = mount(ToolApprovalCard, {
			props: { approval, onDecision: async () => undefined, onRefresh: async () => undefined },
		});
		expect(wrapper.text()).toContain("write_file");
		expect(wrapper.text()).toContain("path: src/app.ts");
	});
});
