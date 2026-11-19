import i18n from "i18next";

import zhTemplates from "./locales/zh-CN/templates.ts";

/** 纯函数经全局 i18n 实例取文案；Node 测试需预载默认语言，避免未初始化时返回空串。 */
await i18n.init({
	lng: "zh-CN",
	fallbackLng: "zh-CN",
	defaultNS: "templates",
	resources: { "zh-CN": { templates: zhTemplates } },
});
