import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Attachments } from "./index.ts";

describe("Attachments（Vue）", () => {
	it("渲染附件状态并在可移除时回传条目", async () => {
		const onRemove = vi.fn();
		const wrapper = mount(Attachments, {
			props: {
				items: [
					{ uid: "f1", name: "report.pdf", status: "done" },
					{ uid: "f2", name: "scan.txt", status: "uploading" },
				],
				onRemove,
			},
		});
		expect(wrapper.text()).toContain("report.pdf");
		expect(wrapper.text()).toContain("上传中");
		await wrapper.get('button[aria-label="移除 report.pdf"]').trigger("click");
		expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ uid: "f1" }));
		expect(wrapper.find('button[aria-label="移除 scan.txt"]').exists()).toBe(false);
	});

	it("空列表显示选择入口", () => {
		const wrapper = mount(Attachments, { props: { onSelectFiles: vi.fn() } });
		expect(wrapper.text()).toContain("上传文件");
		expect(wrapper.get("button").attributes("disabled")).toBeUndefined();
	});
});
