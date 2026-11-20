import { describe, expect, it } from "vitest";
import { toolSummary } from "./index.ts";

describe("工具摘要", () => {
	it("已知工具给出动词与文件名徽标", () => {
		expect(toolSummary({ name: "read_file", input: { path: "src/app.ts" } })).toEqual({
			verb: "读取文件",
			badge: "app.ts",
		});
	});

	it("命令类工具截断长命令", () => {
		const summary = toolSummary({ name: "bash", input: { command: "pnpm --filter web test --watch=false" } });
		expect(summary.verb).toBe("执行命令");
		expect(summary.badge).toContain("pnpm --filter web");
	});

	it("未知工具回退工具名与参数首值", () => {
		expect(toolSummary({ name: "custom_tool", input: { query: "abc" } })).toEqual({
			verb: "custom_tool",
			badge: "abc",
		});
	});
});
