import i18n from "i18next";

interface ValidationIssueLike {
	code?: string;
	message?: string;
}

/**
 * SDK zod 校验消息只有中文；中文界面保留服务端原文的具体提示，
 * 其他语言按稳定的 issue code 映射为通用文案，避免混入中文。
 */
export function localizedValidationMessage(issue: ValidationIssueLike): string {
	const language = i18n.resolvedLanguage ?? i18n.language;
	if (language?.toLowerCase().startsWith("zh") && issue.message) return issue.message;
	switch (issue.code) {
		case "invalid_type":
			return i18n.t("validation.invalidType");
		case "too_small":
			return i18n.t("validation.tooSmall");
		case "too_big":
			return i18n.t("validation.tooBig");
		case "invalid_value":
			return i18n.t("validation.invalidValue");
		case "invalid_format":
			return i18n.t("validation.invalidFormat");
		case "unrecognized_keys":
			return i18n.t("validation.unrecognizedKeys");
		default:
			return i18n.t("validation.invalid");
	}
}
