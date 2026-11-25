import i18n from "i18next";

import enCommon from "./locales/en/common.ts";
import zhAuth from "./locales/zh-CN/auth.ts";
import zhBranding from "./locales/zh-CN/branding.ts";
import zhCatalog from "./locales/zh-CN/catalog.ts";
import zhCommon from "./locales/zh-CN/common.ts";
import zhEval from "./locales/zh-CN/eval.ts";
import zhMembers from "./locales/zh-CN/members.ts";
import zhNavigation from "./locales/zh-CN/navigation.ts";
import zhOperations from "./locales/zh-CN/operations.ts";
import zhPresetPacks from "./locales/zh-CN/presetPacks.ts";
import zhTemplates from "./locales/zh-CN/templates.ts";
import zhUsage from "./locales/zh-CN/usage.ts";

/** 纯函数经全局 i18n 实例取文案；Node 测试需预载默认语言，避免未初始化时返回空串。 */
await i18n.init({
	lng: "zh-CN",
	fallbackLng: "zh-CN",
	defaultNS: "common",
	resources: {
		en: { common: enCommon },
		"zh-CN": {
			common: zhCommon,
			auth: zhAuth,
			navigation: zhNavigation,
			members: zhMembers,
			usage: zhUsage,
			operations: zhOperations,
			branding: zhBranding,
			presetPacks: zhPresetPacks,
			catalog: zhCatalog,
			templates: zhTemplates,
			eval: zhEval,
		},
	},
});
