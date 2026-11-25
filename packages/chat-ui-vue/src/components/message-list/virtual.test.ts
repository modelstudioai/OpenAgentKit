import type { ChatMessage } from "@openagentkit/sdk/messages";
import { describe, expect, it } from "vitest";
import { rowOffsets, windowSlice } from "./index.ts";

const message = (id: string): ChatMessage => ({ id, role: "user", status: "done", parts: [] });

describe("MessageList 虚拟窗口", () => {
	it("行顶偏移按实测行高与 gap 累加", () => {
		const messages = [message("a"), message("b"), message("c")];
		const heights = new Map([
			["a", 100],
			["b", 200],
		]);
		expect(rowOffsets(messages, heights, 10)).toEqual([0, 110, 320, 490]);
	});

	it("窗口覆盖视口并带上下 overscan", () => {
		const offsets = Array.from({ length: 41 }, (_, index) => index * 100);
		const slice = windowSlice(offsets, 1000, 600);
		expect(slice.start).toBe(4);
		expect(slice.end).toBeGreaterThanOrEqual(16);
	});

	it("空列表返回空窗口", () => {
		expect(windowSlice([0], 0, 600)).toEqual({ start: 0, end: 0 });
	});
});
