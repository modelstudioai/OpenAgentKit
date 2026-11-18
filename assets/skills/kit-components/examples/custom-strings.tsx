import {
	formatKitStrings,
	resolveStrings,
	senderStrings,
	useKitLocale,
	useKitStrings,
} from "@openagentpack/kit-chat-ui";

// 自定义文案：读取当前语言与词典，再叠加调用方的局部覆盖。
export function SendLabel() {
	const locale = useKitLocale();
	const strings = useKitStrings(senderStrings);
	const merged = resolveStrings(senderStrings, locale, { send: `${strings.send} →` });
	return <span title={formatKitStrings("{{count}} 个草稿", { count: 2 })}>{merged.send}</span>;
}
