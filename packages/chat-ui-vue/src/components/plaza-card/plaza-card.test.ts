import { describe, expect, it } from "vitest";
import { isIconImageSource, relativeUsedLabel } from "./index.ts";
import plazaCardStrings from "./strings.ts";

describe("PlazaCard 纯逻辑", () => {
	it("使用时间按本地日历日差", () => {
		const now = new Date(2026, 10, 20, 12);
		expect(relativeUsedLabel("2026-11-20T08:00:00Z", plazaCardStrings["zh-CN"], now)).toBe(
			plazaCardStrings["zh-CN"].usedToday,
		);
		expect(relativeUsedLabel("2026-11-18T08:00:00Z", plazaCardStrings["zh-CN"], now)).toBe(
			plazaCardStrings["zh-CN"].usedDaysAgo.replace("{{days}}", "2"),
		);
	});

	it("图标来源判定", () => {
		expect(isIconImageSource("https://x/y.png")).toBe(true);
		expect(isIconImageSource("./icon.svg")).toBe(true);
		expect(isIconImageSource("✍️")).toBe(false);
	});
});
