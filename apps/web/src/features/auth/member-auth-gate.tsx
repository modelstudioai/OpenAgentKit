import type { MemberAuthController } from "@openagentkit/sdk/auth";
import { useMemberAuth } from "@openagentkit/sdk/auth/hooks";
import type { MemberView } from "@openagentkit/sdk/protocol";
import type { ChatProvider } from "@openagentkit/sdk/providers";
import { KitProvider } from "@openagentkit/sdk/providers/kit/react";
import { EmptyState, ErrorState } from "@openagentpack/kit-chat-ui";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveServerErrorMessage } from "../../i18n/server-error.ts";
import { MemberLoginForm } from "./member-login-form.tsx";

export interface MemberAccountProps {
	member: MemberView | null;
	onLogout: () => Promise<void>;
	/** 账号菜单底部附加控件（如语言切换），由宿主布局注入。 */
	languageControl?: ReactNode;
}

export interface MemberExperienceProps extends MemberAccountProps {
	chatProvider: ChatProvider;
}

/** 身份改变时整棵业务视图重新挂载；旧会话、草稿、附件与用量不进入新身份。 */
export function MemberAuthGate({
	controller,
	children,
}: {
	controller: MemberAuthController;
	children: (account: MemberExperienceProps) => ReactNode;
}) {
	const { t } = useTranslation("auth");
	const auth = useMemberAuth(controller);
	if (auth.status === "checking") {
		return (
			<main className="flex min-h-full min-w-0 items-center justify-center">
				<EmptyState title={t("restoring")} loading />
			</main>
		);
	}
	if (auth.client && (auth.status === "signed-in" || auth.status === "anonymous")) {
		if (!auth.chatProvider) return <ErrorState message={t("missingProvider")} />;
		return (
			<KitProvider key={auth.generation} client={auth.client}>
				{children({ member: auth.member, onLogout: auth.logout, chatProvider: auth.chatProvider })}
			</KitProvider>
		);
	}
	const error = auth.errorDetail ? (resolveServerErrorMessage(auth.errorDetail) ?? auth.error) : auth.error;
	return (
		<MemberLoginForm
			pending={auth.pending}
			error={error}
			onLogin={controller.passwordLogin ? auth.login : undefined}
			onOidcLogin={controller.mode === "oidc" ? controller.loginWithOidc : undefined}
			onRetry={auth.retry}
		/>
	);
}

/** 账号区：头像旁常驻展示用户名，hover（桌面）或点击头像（触屏/键盘）展开浮层展示用户名与退出登录。 */
export function MemberAccount({ member, onLogout, languageControl }: MemberAccountProps) {
	const { t } = useTranslation("auth");
	const [open, setOpen] = useState(false);
	return (
		<div className="group relative flex min-h-10 min-w-0 items-center justify-end">
			<button
				type="button"
				aria-label={member ? t("accountAria", { name: member.display_name }) : t("accountInfo")}
				aria-expanded={open}
				className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border border-[var(--kit-border)] bg-[var(--kit-surface)] text-[var(--kit-fg-muted)] transition-colors hover:bg-[var(--kit-nav-active)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
				onClick={() => setOpen((value) => !value)}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					className="h-5 w-5"
				>
					<circle cx="12" cy="8" r="3.5" />
					<path d="M5 20v-1a7 7 0 0 1 14 0v1" strokeLinecap="round" />
				</svg>
			</button>
			{member ? (
				<span
					className="ml-2 min-w-0 max-w-40 truncate whitespace-nowrap text-[length:var(--kit-text-label)] font-medium"
					title={member.username}
				>
					{member.display_name}
				</span>
			) : null}
			{/* 账号区在侧栏页脚左侧：浮层 left-0 从头像向右展开（right-0 会探出侧栏左边界）、
			 * bottom-full 向上展开（向下开会被视口裁掉）；8px 透明桥接区让鼠标从头像滑入浮层
			 * 全程保持 hover，不会中途收起。 */}
			<div
				className={`absolute left-0 bottom-full z-20 pb-2 transition-[opacity,transform,visibility] duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] ${
					open
						? "visible translate-y-0 opacity-100"
						: "pointer-events-none invisible translate-y-1 opacity-0 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
				}`}
			>
				<div className="flex min-w-40 flex-col items-stretch gap-2 rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-3 shadow-[var(--kit-shadow)]">
					<span
						className="min-w-0 truncate whitespace-nowrap text-[length:var(--kit-text-label)] font-medium"
						title={member?.username}
					>
						{member?.display_name ?? t("defaultUser")}
					</span>
					{languageControl ? (
						<div className="border-t border-[var(--kit-border-subtle)] pt-2">{languageControl}</div>
					) : null}
					{member ? (
						<button
							type="button"
							onClick={() => {
								setOpen(false);
								void onLogout().catch(() => undefined);
							}}
							className="flex items-center gap-2 rounded-[var(--kit-radius-sm)] px-2 py-1.5 text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)] transition-colors hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]"
						>
							<svg
								aria-hidden="true"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="h-4 w-4"
							>
								<path d="M10 4H5v16h5M9 12h11m-4-4 4 4-4 4" />
							</svg>
							{t("logout")}
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
}
