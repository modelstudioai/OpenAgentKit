import { useChat } from "@openagentkit/sdk/chat/hooks";
import { KitError } from "@openagentkit/sdk/protocol";
import type { ChatProvider } from "@openagentkit/sdk/providers";
import { Chat, Sender } from "@openagentpack/kit-chat-ui";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ApprovalList } from "./approval-list.tsx";

// 应用提供稳定的 Provider 实例和 createSession 函数。
// createSession 调用应用后端，返回真实的会话 ID。
export function CustomChat({
	provider,
	createSession,
}: {
	provider: ChatProvider;
	createSession: () => Promise<string>;
}) {
	const binding = useMemo(() => ({ provider, createSession }), [provider, createSession]);
	const [selection, setSelection] = useState<{ binding: typeof binding; id: string } | null>(null);
	const sessionId = selection?.binding === binding ? selection.id : null;
	const [draft, setDraft] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const sending = useRef<object | null>(null);
	const chat = useChat({ sessionId, provider });
	const active = useRef<typeof binding | null>(binding);
	useLayoutEffect(() => {
		active.current = binding;
		sending.current = null;
		setBusy(false);
		setError(null);
		return () => {
			active.current = null;
		};
	}, [binding]);
	const report = (cause: unknown) => {
		if (active.current === binding) setError(cause instanceof KitError ? cause.message : "请求失败，已保留草稿。");
	};
	const finish = (operation: object) => {
		// 旧请求结束时不能清理新后端的待处理状态。
		if (sending.current !== operation) return;
		sending.current = null;
		if (active.current === binding) setBusy(false);
	};

	async function send(text: string) {
		if (!text.trim() || sending.current || (sessionId !== null && !chat.canSend)) return;
		const operation = {};
		sending.current = operation;
		setBusy(true);
		setError(null);
		try {
			const target = sessionId ?? (await createSession());
			if (active.current !== binding) return;
			setSelection({ binding, id: target });
			// React 可能尚未提交新的会话选择，因此显式传入目标 ID。
			await chat.send(text.trim(), { sessionId: target });
			if (active.current === binding) setDraft((current) => (current === text ? "" : current));
		} catch (cause) {
			report(cause);
		} finally {
			finish(operation);
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col" data-kit-appearance="workspace">
			{(error || chat.streamError) && <p role="alert">{error ?? chat.streamError?.message}</p>}
			<Chat
				variant="workspace"
				messages={chat.messages}
				multiAgent={chat.multiAgent}
				scrollKey={sessionId}
				turnRunning={chat.turnRunning}
				approvals={chat.approvals.length > 0 ? <ApprovalList chat={chat} /> : null}
				onStop={() => chat.stop().catch(report)}
				sender={
					<Sender
						variant="workspace"
						value={draft}
						onChange={setDraft}
						loading={chat.turnRunning}
						submitDisabled={busy || (sessionId !== null && !chat.canSend)}
						onSubmit={(text) => void send(text)}
						onCancel={() => void chat.stop().catch(report)}
						placeholder={sessionId ? "发送消息" : "输入第一条消息以创建会话"}
					/>
				}
			/>
		</div>
	);
}
