import { KitLocaleProvider, Sender } from "@openagentpack/kit-chat-ui";

// 宿主一处设定组件语言；strings 对单个组件覆盖具体措辞，与语言无关。
export function Composer({ en }: { en: boolean }) {
	return (
		<KitLocaleProvider locale={en ? "en" : "zh-CN"}>
			<Sender strings={en ? undefined : { placeholderPlain: "想聊点什么…" }} />
		</KitLocaleProvider>
	);
}
