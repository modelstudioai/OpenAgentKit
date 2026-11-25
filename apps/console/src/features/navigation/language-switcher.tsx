import { useTranslation } from "react-i18next";
import { type KitLocale, SUPPORTED_LOCALES, setLocale } from "../../i18n/index.ts";
import styles from "./language-switcher.module.less";

/** 管理端语言胶囊：登录页紧凑展示，侧栏底部可铺满；选中态使用 antd 主色。 */
export function LanguageSwitcher({ block = false }: { block?: boolean }) {
	const { t, i18n } = useTranslation();
	const current: KitLocale = i18n.resolvedLanguage === "en" ? "en" : "zh-CN";
	return (
		<fieldset
			aria-label={t("languageSwitcher.label")}
			data-testid="language-switcher"
			className={block ? `${styles.root} ${styles.block}` : styles.root}
		>
			{SUPPORTED_LOCALES.map((locale) => (
				<button
					key={locale}
					type="button"
					aria-pressed={current === locale}
					className={current === locale ? `${styles.option} ${styles.active}` : styles.option}
					onClick={() => void setLocale(locale)}
				>
					{locale === "zh-CN" ? t("languageSwitcher.zh") : t("languageSwitcher.en")}
				</button>
			))}
		</fieldset>
	);
}
