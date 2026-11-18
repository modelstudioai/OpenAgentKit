import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import messageListSkeletonStrings, { type MessageListSkeletonStrings } from "./strings.ts";

const BLOCK =
	"relative overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:content-[''] after:-translate-x-full after:bg-linear-to-r after:from-transparent after:via-[var(--kit-skeleton-sheen)] after:to-transparent after:animate-(--kit-animate-skeleton)";

const CARD =
	"flex w-[78%] max-w-[78ch] flex-col gap-2.5 rounded-[var(--kit-radius)] bg-[var(--kit-skeleton-card)] px-4 py-3";

/** 会话切换骨架屏：占位真实消息布局（用户气泡右、助手卡左）；骨架无可见文案，
 * 状态语义由 role="status" + aria-label 提供给辅助技术。 */
export function MessageListSkeleton({
	className = "",
	strings: stringsOverride,
}: {
	className?: string;
	/** 覆盖内置文案（键见 strings.ts）；语言由 KitLocaleProvider 提供，缺省 zh-CN。 */
	strings?: Partial<MessageListSkeletonStrings>;
}) {
	const strings = resolveStrings(messageListSkeletonStrings, useKitLocale(), stringsOverride);
	return (
		<div
			role="status"
			aria-label={strings.loading}
			className={`w-full animate-(--kit-animate-overlay-in) ${className}`}
		>
			<div className="flex flex-col gap-6">
				<div className="flex justify-end">
					<div className={`${BLOCK} h-[38px] w-[38%] rounded-[var(--kit-radius)] bg-[var(--kit-skeleton)]`} />
				</div>
				<div className={CARD}>
					<div className={`${BLOCK} h-3 w-[92%] rounded-full bg-[var(--kit-skeleton-bar)]`} />
					<div className={`${BLOCK} h-3 w-[78%] rounded-full bg-[var(--kit-skeleton-bar)]`} />
					<div className={`${BLOCK} h-3 w-[46%] rounded-full bg-[var(--kit-skeleton-bar)]`} />
				</div>
				<div className="flex justify-end">
					<div className={`${BLOCK} h-[38px] w-[30%] rounded-[var(--kit-radius)] bg-[var(--kit-skeleton)]`} />
				</div>
				<div className={CARD}>
					<div className={`${BLOCK} h-3 w-[85%] rounded-full bg-[var(--kit-skeleton-bar)]`} />
					<div className={`${BLOCK} h-3 w-[52%] rounded-full bg-[var(--kit-skeleton-bar)]`} />
				</div>
			</div>
		</div>
	);
}
