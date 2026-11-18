import { Segmented } from "antd";
import { useTranslation } from "react-i18next";
import { type KitLocale, SUPPORTED_LOCALES, setLocale } from "../../i18n/index.ts";

/** 管理端语言分段控件：antd Segmented（管理控件优先 antd，ADR-0015）；登录页与顶栏共用。 */
export function LanguageSwitcher() {
	const { t, i18n } = useTranslation();
	const current: KitLocale = i18n.resolvedLanguage === "en" ? "en" : "zh-CN";
	return (
		<fieldset aria-label={t("languageSwitcher.label")} data-testid="language-switcher" className="contents">
			<Segmented
				size="small"
				value={current}
				onChange={(value) => void setLocale(value as KitLocale)}
				options={SUPPORTED_LOCALES.map((locale) => ({
					value: locale,
					label: locale === "zh-CN" ? t("languageSwitcher.zh") : t("languageSwitcher.en"),
				}))}
			/>
		</fieldset>
	);
}
