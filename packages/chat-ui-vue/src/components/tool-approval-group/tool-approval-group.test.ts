// @vitest-environment jsdom
import type { ChatToolApproval } from "@openagentkit/sdk/chat";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { ToolApprovalGroup } from "./index.ts";

const base = {
	batch_id: "b1",
	request_event_id: null,
	tool_type: "function",
	actionable: true,
	status: "pending" as const,
};
const approvals: ChatToolApproval[] = [
	{ ...base, call_id: "c1", name: "write_file", arguments: { path: "a.ts" } },
	{ ...base, call_id: "c2", name: "bash", arguments: { command: "ls" } },
];

describe("ToolApprovalGroup（Vue）", () => {
	it("多张审批用翻页切换", async () => {
		const wrapper = mount(ToolApprovalGroup, {
			props: { approvals, onDecision: async () => undefined, onRefresh: async () => undefined },
		});
		expect(wrapper.text()).toContain("1 / 2");
		expect(wrapper.text()).toContain("write_file");
		await wrapper.get("button[aria-label='下一个审批']").trigger("click");
		expect(wrapper.text()).toContain("2 / 2");
		expect(wrapper.text()).toContain("bash");
	});
});
