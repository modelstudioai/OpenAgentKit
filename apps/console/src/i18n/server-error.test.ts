import { KitError } from "@openagentpack/kit-sdk/protocol";
import i18n from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { resolveServerErrorMessage } from "./server-error.ts";

describe("server 错误文案兜底", () => {
	afterEach(async () => {
		await i18n.changeLanguage("zh-CN");
	});

	it("中文保留 server 原文", async () => {
		await i18n.changeLanguage("zh-CN");
		expect(resolveServerErrorMessage(new KitError("conflict", "用户名已存在"))).toBeUndefined();
	});

	it("英文按错误 code 兜底，非中文 message 不覆盖", async () => {
		await i18n.changeLanguage("en");
		expect(resolveServerErrorMessage(new KitError("conflict", "用户名已存在"))).toBe(
			"The state changed. Refresh and try again.",
		);
		expect(resolveServerErrorMessage(new KitError("provider_error", "upstream timeout"))).toBeUndefined();
	});
});
