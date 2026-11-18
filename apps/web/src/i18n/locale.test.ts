import { describe, expect, it } from "vitest";
import { type LocaleEnv, resolveLocale } from "./index.ts";

const bare: LocaleEnv = { stored: null, urlParam: null, navigatorLanguage: undefined };

describe("resolveLocale", () => {
	it("用户显式选择优先于 URL 与浏览器语言", () => {
		expect(resolveLocale({ stored: "en", urlParam: "zh-CN", navigatorLanguage: "zh-CN" })).toBe("en");
	});
	it("无存储选择时 URL ?lang= 次之", () => {
		expect(resolveLocale({ ...bare, urlParam: "en" })).toBe("en");
	});
	it("浏览器语言按前缀映射到支持的语种", () => {
		expect(resolveLocale({ ...bare, navigatorLanguage: "en-US" })).toBe("en");
		expect(resolveLocale({ ...bare, navigatorLanguage: "zh-TW" })).toBe("zh-CN");
	});
	it("未识别输入回落默认 zh-CN", () => {
		expect(resolveLocale({ ...bare, navigatorLanguage: "ja" })).toBe("zh-CN");
		expect(resolveLocale(bare)).toBe("zh-CN");
	});
});
