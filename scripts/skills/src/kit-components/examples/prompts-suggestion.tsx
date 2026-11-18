import {
	Prompts,
	Sender,
	type SenderRef,
	type SenderSelection,
	SkillGlyph,
	Suggestion,
} from "@openagentpack/kit-chat-ui";
import { useRef, useState } from "react";

const promptText: Record<string, string> = {
	summary: "总结当前报告。",
	compare: "比较这两个方案。",
};

export function PromptComposer({ onSend, canSend }: { onSend: (text: string) => Promise<void>; canSend: boolean }) {
	const [draft, setDraft] = useState("");
	const [selection, setSelection] = useState<SenderSelection>({ start: 0, end: 0 });
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const sender = useRef<SenderRef>(null);
	const sending = useRef(false);

	const send = async (text: string) => {
		if (!canSend || sending.current || !text.trim()) return;
		sending.current = true;
		setSubmitting(true);
		setError(null);
		try {
			await onSend(text);
			setDraft((current) => (current === text ? "" : current));
		} catch {
			setError("发送失败，已保留草稿。");
		} finally {
			sending.current = false;
			setSubmitting(false);
		}
	};

	return (
		<div className="flex flex-col gap-3" data-kit-appearance="workspace">
			<Prompts
				title="试着问一个问题"
				wrap
				items={[
					{ key: "summary", label: "总结", description: "提取主要内容。" },
					{ key: "compare", label: "比较", description: "分析两个可选方案。" },
				]}
				onItemClick={({ data }) => {
					setDraft(promptText[data.key] ?? "");
					sender.current?.focus();
				}}
			/>
			<Suggestion
				block
				items={[
					{ value: "summary", label: "总结报告", icon: <SkillGlyph className="size-4" /> },
					{ value: "compare", label: "比较方案", icon: <SkillGlyph className="size-4" /> },
				]}
				value={draft}
				caret={selection.end}
				trigger="/"
				onSelect={(_, item, context) => {
					if (!context) return;
					sender.current?.replaceRange(context.start, context.end, promptText[item.value] ?? "");
					sender.current?.focus();
				}}
			>
				{({ onKeyDown, inputProps }) => (
					<Sender
						variant="workspace"
						ref={sender}
						value={draft}
						placeholder="输入 / 选择命令"
						onChange={setDraft}
						onSelectionChange={setSelection}
						onKeyDown={onKeyDown}
						inputProps={inputProps}
						submitDisabled={!canSend || submitting}
						onSubmit={(text) => void send(text)}
						suffix={(_origin, { components }) => <components.SendButton>发送</components.SendButton>}
					/>
				)}
			</Suggestion>
			{error ? <p role="alert">{error}</p> : null}
		</div>
	);
}
