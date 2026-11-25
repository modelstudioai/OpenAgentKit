import { describe, expect, it } from "vitest";
import { activeTriggerQuery } from "./index.ts";

describe("Suggestion 触发词", () => {
	it("光标前的 / 触发查询", () => {
		expect(activeTriggerQuery("帮我 /rev", 8, "/")).toEqual({ start: 3, query: "rev" });
	});

	it("词中斜杠与跨空白不触发", () => {
		expect(activeTriggerQuery("a/b", 3, "/")).toBeNull();
		expect(activeTriggerQuery("/rev ", 5, "/")).toBeNull();
	});
});
