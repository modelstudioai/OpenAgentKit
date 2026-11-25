import { type ErrorCode, KitError } from "@openagentkit/sdk/protocol";
import i18n from "i18next";

const HAN = /\p{Script=Han}/u;

function serverErrorText(code: ErrorCode): string {
	switch (code) {
		case "invalid_request":
			return i18n.t("serverErrors.invalid_request");
		case "unauthorized":
			return i18n.t("serverErrors.unauthorized");
		case "forbidden":
			return i18n.t("serverErrors.forbidden");
		case "not_found":
			return i18n.t("serverErrors.not_found");
		case "conflict":
			return i18n.t("serverErrors.conflict");
		case "confirmation_required":
			return i18n.t("serverErrors.confirmation_required");
		case "rate_limited":
			return i18n.t("serverErrors.rate_limited");
		case "quota_exceeded":
			return i18n.t("serverErrors.quota_exceeded");
		case "request_pending":
			return i18n.t("serverErrors.request_pending");
		case "provider_error":
			return i18n.t("serverErrors.provider_error");
		case "not_implemented":
			return i18n.t("serverErrors.not_implemented");
		case "internal":
			return i18n.t("serverErrors.internal");
	}
}

/** 中文保留 server 具体提示；其他语言优先 message_key，缺键时按稳定 code 兜底。 */
export function resolveServerErrorMessage(error: unknown): string | undefined {
	if (!(error instanceof KitError)) return undefined;
	const language = i18n.resolvedLanguage ?? i18n.language;
	if (language?.toLowerCase().startsWith("zh")) return undefined;
	if (error.messageKey === "serverErrors.invalidCredentials") return i18n.t("serverErrors.invalidCredentials");
	if (error.messageKey && i18n.exists(error.messageKey)) {
		const translate = i18n.getFixedT(null, "common") as unknown as (
			key: string,
			options?: Record<string, unknown>,
		) => string;
		return translate(error.messageKey, error.messageParams);
	}
	if (!HAN.test(error.message)) return undefined;
	return serverErrorText(error.code);
}
