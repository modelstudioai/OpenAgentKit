import { ErrorState } from "@openagentpack/kit-chat-ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { setLocale } from "../../i18n/index.ts";

const fieldClass =
	"mt-2 block min-h-11 w-full min-w-0 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-bg-subtle)] px-3 py-2.5 text-[length:var(--kit-text-heading)] transition-colors focus-visible:border-[var(--kit-focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:opacity-50";
const buttonClass =
	"flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--kit-radius-sm)] px-4 py-2.5 text-[length:var(--kit-text-base)] font-medium transition-opacity enabled:hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass = `${buttonClass} bg-[var(--kit-accent)] text-[var(--kit-accent-fg)]`;

export function MemberLoginForm({
	pending,
	error,
	onLogin,
	onOidcLogin,
	onRetry,
}: {
	pending: boolean;
	error: string | null;
	onLogin?: (input: { username: string; password: string }) => Promise<void>;
	onOidcLogin?: () => Promise<void>;
	onRetry: () => Promise<void>;
}) {
	const { t, i18n } = useTranslation(["auth", "common"]);
	const isEn = i18n.resolvedLanguage === "en";
	const nextLocale = isEn ? "zh-CN" : "en";
	const nextLabel = isEn ? t("common:languageSwitcher.zh") : t("common:languageSwitcher.en");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const description = t(onOidcLogin ? (onLogin ? "dualIntro" : "oidcIntro") : "intro");
	return (
		<main className="grid min-h-full min-w-0 place-items-center px-4 py-8 sm:px-6">
			<form
				aria-labelledby="member-login-heading"
				className="relative w-full min-w-0 max-w-sm space-y-6 rounded-[var(--kit-radius)] border border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] p-6 shadow-[var(--kit-shadow)] sm:p-8"
				onSubmit={(event) => {
					event.preventDefault();
					if (pending || !onLogin) return;
					void onLogin({ username: username.trim(), password })
						.catch(() => undefined)
						.finally(() => {
							setPassword("");
						});
				}}
			>
				<button
					type="button"
					aria-label={t("common:languageSwitcher.switchTo", { language: nextLabel })}
					onClick={() => void setLocale(nextLocale)}
					className="absolute top-3 right-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)] transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] motion-reduce:transition-none"
				>
					<svg
						aria-hidden="true"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						className="size-3.5"
					>
						<circle cx="12" cy="12" r="9" />
						<path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
					</svg>
					<span>{nextLabel}</span>
				</button>
				<header className="text-center">
					<p className="mb-3 text-[length:var(--kit-text-caption)] font-medium text-[var(--kit-fg-muted)]">
						Managed Agent
					</p>
					<h1 id="member-login-heading" className="text-[length:var(--kit-text-display)] font-medium leading-snug">
						{t("heading")}
					</h1>
					<p className="mt-3 text-[length:var(--kit-text-label)] leading-6 text-[var(--kit-fg-muted)]">{description}</p>
				</header>
				{error && (
					<ErrorState message={error} onRetry={pending ? undefined : () => void onRetry().catch(() => undefined)} />
				)}
				<fieldset disabled={pending} className="min-w-0 space-y-5">
					<legend className="sr-only">{t("legend")}</legend>
					{onLogin && (
						<>
							<div>
								<label htmlFor="login-username" className="text-[length:var(--kit-text-label)] font-medium">
									{t("username")}
								</label>
								<input
									id="login-username"
									name="username"
									autoComplete="username"
									required
									maxLength={32}
									value={username}
									onChange={(event) => setUsername(event.target.value)}
									className={fieldClass}
								/>
							</div>
							<div>
								<label htmlFor="login-password" className="text-[length:var(--kit-text-label)] font-medium">
									{t("password")}
								</label>
								<input
									id="login-password"
									name="password"
									type="password"
									autoComplete="current-password"
									required
									maxLength={128}
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									className={fieldClass}
								/>
							</div>
							<button type="submit" aria-busy={pending} className={primaryButtonClass}>
								{t(pending ? "processing" : onOidcLogin ? "passwordSubmit" : "submit")}
							</button>
						</>
					)}
					{onOidcLogin && (
						<button
							type="button"
							aria-busy={pending}
							className={
								onLogin ? `${buttonClass} border border-[var(--kit-border)] text-[var(--kit-fg)]` : primaryButtonClass
							}
							onClick={() => void onOidcLogin().catch(() => undefined)}
						>
							{t("oidcSubmit")}
						</button>
					)}
				</fieldset>
			</form>
		</main>
	);
}
