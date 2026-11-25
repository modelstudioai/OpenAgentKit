import { useChat } from "@openagentkit/sdk/chat/hooks";
import {
	AgentSummarySchema,
	type CreateTemplateDebugSessionRequest,
	type ToolApprovalDecision,
} from "@openagentkit/sdk/protocol";
import { createKitChatProvider } from "@openagentkit/sdk/providers/kit";
import {
	AgentHeader,
	Chat,
	EmptyState,
	ErrorState,
	Prompts,
	Sender,
	StatusIndicator,
	Suggestion,
	ToolApprovalCard,
} from "@openagentpack/kit-chat-ui";
import { Button } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAdminMutation } from "../../lib/admin/use-admin-mutation.ts";
import { useAdminQuery } from "../../lib/admin/use-admin-query.ts";
import { getAdminClient } from "../../lib/api.ts";
import type { AgentPresentation } from "../catalog/agent-presentation-fields.tsx";
import type { RemoteAgent } from "../catalog/use-remote-agents.ts";
import { enqueueTemplateDebugCleanup } from "./template-debug-cleanup.ts";
import { createTemplateDebugSessionOwner } from "./template-debug-session-owner.ts";
import styles from "./template-pages.module.less";

export interface TemplateDebugPreviewProps {
	input: CreateTemplateDebugSessionRequest;
	agent: RemoteAgent;
	name: string;
	presentation: AgentPresentation;
	onBusyChange?: (busy: boolean) => void;
}

/** 调用方按运行时配置保持实例；进入时创建，实例释放时清理自建临时会话。 */
export function TemplateDebugPreview({ input, agent, name, presentation, onBusyChange }: TemplateDebugPreviewProps) {
	const { t } = useTranslation("templates");
	const model = useTemplateDebug(input, onBusyChange);
	const { sessionId, identity, canWrite, create, send, stop, download, approve, chat } = model;
	const displayAgent = useMemo(
		() =>
			AgentSummarySchema.parse({
				...presentation,
				slug: agent.agent_id,
				display_name: name.trim(),
				capabilities: {},
			}),
		[agent.agent_id, name, presentation],
	);
	const error = identity.error || create.error || send.error || stop.error || download.error || approve.error;
	return (
		<section aria-label={t("debug.aria")} className={styles.pageStack}>
			<div className={styles.rowBetween}>
				<div className={`${styles.shrinkRoot} ${styles.fieldStack}`}>
					<h3 className={styles.sectionTitle}>{t("debug.title")}</h3>
					<p className={styles.metaAny}>{sessionId ? t("debug.session", { id: sessionId }) : t("debug.createHint")}</p>
				</div>
				{!sessionId && create.error ? (
					<Button
						type="primary"
						disabled={!canWrite || create.pending}
						onClick={() => {
							void create.run().catch(() => undefined);
						}}
					>
						{t("debug.retryCreate")}
					</Button>
				) : null}
			</div>
			{error ? (
				<ErrorState message={error} onRetry={identity.error ? () => void identity.refresh() : undefined} />
			) : null}
			<div data-kit-appearance="workspace" className={styles.debugShell}>
				<AgentHeader
					agent={displayAgent}
					actions={
						sessionId ? (
							<StatusIndicator
								variant="badge"
								connected={chat.connected}
								connection={chat.connection}
								turnRunning={chat.turnRunning}
								phase={chat.phase}
								error={chat.streamError}
							/>
						) : null
					}
				/>
				<Chat
					variant="workspace"
					messages={chat.messages}
					multiAgent={chat.multiAgent}
					turnRunning={chat.turnRunning}
					scrollKey={sessionId}
					onStop={canWrite ? stop.run : undefined}
					onArtifactDownload={(fileId) => {
						void download.run(fileId).catch(() => undefined);
					}}
					empty={<DebugEmptyState model={model} presentation={presentation} />}
					approvals={chat.approvals.length ? <DebugApprovals model={model} /> : null}
					sender={<DebugComposer model={model} prompts={presentation.suggested_prompts} />}
				/>
			</div>
		</section>
	);
}

type DebugModel = ReturnType<typeof useTemplateDebug>;

function DebugEmptyState({ model, presentation }: { model: DebugModel; presentation: AgentPresentation }) {
	const { t } = useTranslation("templates");
	const { sessionId, create, canWrite, setDraft } = model;
	return (
		<div className={`${styles.pageStack} ${styles.preWrap}`}>
			<EmptyState
				title={
					create.pending
						? t("debug.creating")
						: (presentation.opening_remarks ?? (sessionId ? t("debug.startChat") : t("debug.prepare")))
				}
				hint={sessionId ? t("debug.sessionHint") : t("debug.prepareHint")}
				loading={create.pending}
			/>
			<Prompts
				wrap
				classNames={{ list: "justify-center" }}
				items={[...new Set(presentation.suggested_prompts)].map((prompt) => ({
					key: prompt,
					label: prompt,
					disabled: !canWrite || create.pending,
				}))}
				onItemClick={({ data }) => setDraft(data.key)}
			/>
		</div>
	);
}

function DebugApprovals({ model }: { model: DebugModel }) {
	const { t } = useTranslation("templates");
	const { sessionId, canWrite, chat, approve, stop } = model;
	return (
		<div className={styles.stack2}>
			{chat.approvals.map((approval) =>
				canWrite ? (
					<ToolApprovalCard
						key={`${sessionId}:${approval.batch_id}:${approval.call_id}`}
						approval={approval}
						onDecision={approve.run}
						onRefresh={chat.refreshApprovals}
						onStop={() => {
							void stop.run().catch(() => undefined);
						}}
					/>
				) : (
					<p key={`${approval.batch_id}:${approval.call_id}`} className={styles.body13}>
						{t("debug.approval", { name: approval.name, status: approval.status })}
					</p>
				),
			)}
		</div>
	);
}

function DebugComposer({ model, prompts }: { model: DebugModel; prompts: string[] }) {
	const { t } = useTranslation("templates");
	const { sessionId, identity, canWrite, create, send, stop, approve, chat, draft, setDraft } = model;
	if (!canWrite)
		return <p className={styles.formNote}>{identity.loading ? t("debug.verifying") : t("debug.readOnlyComposer")}</p>;
	const items = [...new Set(prompts)].map((prompt) => ({ label: prompt, value: prompt }));
	return (
		<Suggestion items={items} block onSelect={setDraft}>
			{({ onTrigger, onKeyDown, inputProps }) => (
				<Sender
					variant="workspace"
					autoSize={{ minRows: 2, maxRows: 6 }}
					value={draft}
					onChange={(value) => {
						setDraft(value);
						onTrigger(value === "/" ? undefined : false);
					}}
					onKeyDown={onKeyDown}
					inputProps={inputProps}
					loading={chat.turnRunning}
					disabled={!sessionId || create.pending}
					submitDisabled={!chat.canSend || send.pending || stop.pending || approve.pending}
					onSubmit={(text) => {
						onTrigger(false);
						void send.run(text).catch(() => undefined);
					}}
					onCancel={() => {
						void stop.run().catch(() => undefined);
					}}
					prefix={
						items.length ? (
							<Button size="small" disabled={!sessionId || create.pending} onClick={() => onTrigger()}>
								{t("debug.examplePrompts")}
							</Button>
						) : null
					}
				/>
			)}
		</Suggestion>
	);
}

function useTemplateDebug(input: CreateTemplateDebugSessionRequest, onBusyChange?: (busy: boolean) => void) {
	const { t } = useTranslation("templates");
	const client = useMemo(getAdminClient, []);
	const identity = useAdminQuery("templates:debug:identity", (signal) => client.identity(signal));
	const canWrite = identity.data?.role === "admin";
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	// 父级按运行时 key 重建本组件；仅展示文案变化时保持同一 owner 与会话。
	const [owner] = useState(() =>
		createTemplateDebugSessionOwner({
			create: () => client.debug.createTemplateSession(input),
			cleanup: (id) => enqueueTemplateDebugCleanup(client, id),
		}),
	);
	useEffect(() => owner.acquire(), [owner]);
	const provider = useMemo(() => createKitChatProvider(client.debug), [client]);
	const chat = useChat({ sessionId, provider });
	const create = useAdminMutation(async () => {
		if (!canWrite) throw new Error(t("debug.errors.readOnly"));
		const id = await owner.create();
		if (id) setSessionId(id);
	});
	useEffect(() => {
		if (!canWrite) return;
		let cancelled = false;
		// 等待 StrictMode 的模拟卸载结束，防止启动已被 dispose 的 mutation。
		queueMicrotask(() => {
			if (!cancelled) void create.run().catch(() => undefined);
		});
		return () => {
			cancelled = true;
		};
	}, [canWrite, create.run]);
	const send = useAdminMutation(async (text: string) => {
		if (!canWrite) throw new Error(t("debug.errors.readOnly"));
		if (!sessionId) throw new Error(t("debug.errors.noSession"));
		if (!text.trim()) return;
		await chat.send(text.trim());
		setDraft((current) => (current === text ? "" : current));
	});
	const stop = useAdminMutation(async () => {
		if (!canWrite) throw new Error(t("debug.errors.readOnly"));
		await chat.stop();
	});
	const approve = useAdminMutation(async (decision: ToolApprovalDecision) => {
		if (!canWrite) throw new Error(t("debug.errors.readOnly"));
		await chat.submitApproval(decision);
	});
	const download = useAdminMutation(async (fileId: string) => {
		if (!sessionId) return;
		const response = await client.debug.downloadFile(fileId, sessionId);
		const url = URL.createObjectURL(await response.blob());
		try {
			const link = document.createElement("a");
			link.href = url;
			link.download = chat.artifacts.find((artifact) => artifact.file_id === fileId)?.filename ?? fileId;
			link.click();
		} finally {
			URL.revokeObjectURL(url);
		}
	});
	const busy = create.pending || send.pending || stop.pending || approve.pending || chat.turnRunning;
	useEffect(() => {
		onBusyChange?.(busy);
		return () => onBusyChange?.(false);
	}, [busy, onBusyChange]);
	return { sessionId, identity, canWrite, create, send, stop, download, approve, chat, draft, setDraft };
}
