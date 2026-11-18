import { isIconImageSource } from "@openagentpack/kit-chat-ui";

// 自定义图标布局时，复用统一的图片或文本判断规则。
export function AgentIcon({ icon }: { icon?: string }) {
	return <span aria-hidden>{isIconImageSource(icon) ? <img src={icon} alt="" /> : (icon ?? "🤖")}</span>;
}
