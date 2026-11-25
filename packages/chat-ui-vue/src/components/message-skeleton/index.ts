import { computed, defineComponent, h } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import messageListSkeletonStrings, { type MessageListSkeletonStrings } from "./strings.ts";

export { type MessageListSkeletonStrings, messageListSkeletonStrings };

const BLOCK =
	"relative overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:content-[''] after:-translate-x-full after:bg-linear-to-r after:from-transparent after:via-[var(--kit-skeleton-sheen)] after:to-transparent after:animate-(--kit-animate-skeleton)";

const CARD =
	"flex w-[78%] max-w-[78ch] flex-col gap-2.5 rounded-[var(--kit-radius)] bg-[var(--kit-skeleton-card)] px-4 py-3";

const bar = (className: string) =>
	h("div", { class: `${BLOCK} ${className} rounded-full bg-[var(--kit-skeleton-bar)]` });

/** 会话切换骨架屏：占位真实消息布局（用户气泡右、助手卡左）；状态语义由 role=status 提供。 */
export const MessageListSkeleton = defineComponent({
	name: "MessageListSkeleton",
	props: {
		className: { type: String, default: "" },
		strings: { type: Object as () => Partial<MessageListSkeletonStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(messageListSkeletonStrings, useKitLocale(), props.strings));
		return () =>
			h(
				"div",
				{
					role: "status",
					"aria-label": strings.value.loading,
					class: `w-full animate-(--kit-animate-overlay-in) ${props.className}`,
				},
				[
					h("div", { class: "flex flex-col gap-6" }, [
						h("div", { class: "flex justify-end" }, [
							h("div", {
								class: `${BLOCK} h-[38px] w-[38%] rounded-[var(--kit-radius)] bg-[var(--kit-skeleton)]`,
							}),
						]),
						h("div", { class: CARD }, [bar("h-3 w-[92%]"), bar("h-3 w-[78%]"), bar("h-3 w-[46%]")]),
						h("div", { class: "flex justify-end" }, [
							h("div", {
								class: `${BLOCK} h-[38px] w-[30%] rounded-[var(--kit-radius)] bg-[var(--kit-skeleton)]`,
							}),
						]),
						h("div", { class: CARD }, [bar("h-3 w-[85%]"), bar("h-3 w-[52%]")]),
					]),
				],
			);
	},
});
