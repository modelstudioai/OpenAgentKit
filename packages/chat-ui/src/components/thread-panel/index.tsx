import type { ChatMessage } from "@openagentkit/sdk/messages";
import { format, resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { Message } from "../message/index.tsx";
import threadPanelStrings, { type ThreadPanelStrings } from "./strings.ts";

export function ThreadPanel({
	threads,
	onArtifactDownload,
	onCopy,
	strings: stringsOverride,
}: {
	threads: Record<string, ChatMessage[]>;
	onArtifactDownload?: (fileId: string) => void;
	onCopy?: (text: string) => void | Promise<void>;
	/** 覆盖内置文案（键见 strings.ts）；语言由 KitLocaleProvider 提供，缺省 zh-CN。 */
	strings?: Partial<ThreadPanelStrings>;
}) {
	const strings = resolveStrings(threadPanelStrings, useKitLocale(), stringsOverride);
	const ids = Object.keys(threads);
	if (ids.length === 0) return null;
	return (
		<div className="rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-bg-subtle)] p-3">
			<strong className="text-[length:var(--kit-text-label)]">{format(strings.title, { count: ids.length })}</strong>
			{ids.map((id) => (
				<details key={id} className="mt-1.5 text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)]">
					<summary className="cursor-pointer">{id}</summary>
					<div className="pt-1.5">
						{(threads[id] ?? []).map((message) => (
							<Message key={message.id} message={message} onArtifactDownload={onArtifactDownload} onCopy={onCopy} />
						))}
					</div>
				</details>
			))}
		</div>
	);
}
