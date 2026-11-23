import { afterEach, describe, expect, it, vi } from "vitest";
import { type LocaleEnv, readBrowserLocaleEnv, resolveLocale } from "./index.ts";

const bare: LocaleEnv = { stored: null, urlParam: null, navigatorLanguage: undefined };

describe("resolveLocale", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("存储读取失败时仍返回 URL 参数，不阻断启动", () => {
		vi.stubGlobal("window", { location: { search: "?lang=en" } });
		vi.stubGlobal("localStorage", {
			getItem() {
				throw new DOMException("blocked", "SecurityError");
			},
		});
		vi.stubGlobal("navigator", { language: "zh-CN" });
		expect(readBrowserLocaleEnv()).toEqual({ stored: null, urlParam: "en", navigatorLanguage: "zh-CN" });
	});

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
