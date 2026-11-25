import { describe, expect, it } from "vitest";
import { hasClosingFence } from "../markdown/index.ts";
import { hasResourceSyntax } from "./index.ts";

describe("Mermaid 围栏与资源语法", () => {
	it("完整围栏与未闭合围栏", () => {
		expect(hasClosingFence("```mermaid\nflowchart TD\nA-->B\n```", false)).toBe(true);
		expect(hasClosingFence("```mermaid\nflowchart TD\nA-->B", false)).toBe(false);
	});

	it("引用块里的围栏也能识别闭合", () => {
		expect(hasClosingFence("```mermaid\nA-->B\n```", true)).toBe(true);
	});

	it("检出图片与资源语法", () => {
		expect(hasResourceSyntax("flowchart TD\nA[<img src=x>]-->B")).toBe(true);
		expect(hasResourceSyntax("flowchart TD\nA-->B")).toBe(false);
	});
});
