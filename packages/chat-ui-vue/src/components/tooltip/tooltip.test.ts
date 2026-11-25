import { describe, expect, it } from "vitest";
import { resolveTransform } from "./index.ts";

describe("Tooltip 摆位", () => {
	it("顶部居中对齐锚点", () => {
		expect(resolveTransform("top", { left: 200, top: 100 }, 80, 40, 800, 600)).toBe("translate(-40px, -48px)");
	});

	it("贴左边缘时夹回安全区", () => {
		expect(resolveTransform("left", { left: 10, top: 300 }, 100, 40, 800, 600)).toBe("translate(-2px, -20px)");
	});
});
