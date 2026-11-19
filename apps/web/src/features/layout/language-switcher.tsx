import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, setLocale } from "../../i18n/index.ts";

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]";

/** 账号菜单内的语言胶囊：两种语言并列一键可达；移动端侧栏抽屉即等效入口（方案 §4.3、UI 红线 6）。 */
export function LanguageSwitcher() {
	const { t, i18n } = useTranslation();
	const isEn = i18n.resolvedLanguage === "en";
	return (
		<fieldset
			aria-label={t("languageSwitcher.label")}
			data-testid="language-switcher"
			className="grid w-full shrink-0 grid-cols-2 gap-0.5 rounded-full border border-[var(--kit-border)] bg-[var(--kit-bg-subtle)] p-0.5"
		>
			{SUPPORTED_LOCALES.map((locale) => {
				const active = isEn ? locale === "en" : locale === "zh-CN";
				return (
					<button
						key={locale}
						type="button"
						aria-pressed={active}
						onClick={() => void setLocale(locale)}
						className={`cursor-pointer rounded-full px-2 py-1.5 text-center text-[length:var(--kit-text-label)] transition-[background-color,color,box-shadow] duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] motion-reduce:transition-none ${FOCUS_RING} ${
							active
								? "bg-[var(--kit-accent)] font-semibold text-[var(--kit-accent-fg)] shadow-[0_1px_2px_rgb(0_0_0/0.14)]"
								: "font-medium text-[var(--kit-fg-muted)] hover:bg-[var(--kit-surface)] hover:text-[var(--kit-fg)]"
						}`}
					>
						{locale === "zh-CN" ? t("languageSwitcher.zh") : t("languageSwitcher.en")}
					</button>
				);
			})}
		</fieldset>
	);
}
