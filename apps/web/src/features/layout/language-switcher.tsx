import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, setLocale } from "../../i18n/index.ts";

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]";

/** 侧栏语言分段控件：两种语言并列一键可达；移动端侧栏抽屉即等效入口（方案 §4.3、UI 红线 6）。 */
export function LanguageSwitcher() {
	const { t, i18n } = useTranslation();
	const isEn = i18n.resolvedLanguage === "en";
	return (
		<fieldset
			aria-label={t("languageSwitcher.label")}
			data-testid="language-switcher"
			className="flex w-full shrink-0 items-center rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] p-0.5"
		>
			{SUPPORTED_LOCALES.map((locale) => {
				const active = isEn ? locale === "en" : locale === "zh-CN";
				return (
					<button
						key={locale}
						type="button"
						aria-pressed={active}
						onClick={() => void setLocale(locale)}
						className={`flex-1 cursor-pointer rounded-[var(--kit-radius-sm)] px-2 py-1 text-[length:var(--kit-text-label)] transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none ${FOCUS_RING} ${
							active
								? "bg-[var(--kit-nav-active)] text-[var(--kit-fg)]"
								: "text-[var(--kit-fg-muted)] hover:bg-[var(--kit-nav-active)] hover:text-[var(--kit-fg)]"
						}`}
					>
						{locale === "zh-CN" ? t("languageSwitcher.zh") : t("languageSwitcher.en")}
					</button>
				);
			})}
		</fieldset>
	);
}
