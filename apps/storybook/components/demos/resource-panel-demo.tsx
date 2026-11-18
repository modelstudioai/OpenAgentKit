"use client";

import { AgentHeader, Chat, FileCard, Layout, StatusIndicator, SubAgentPanel } from "@openagentpack/kit-chat-ui";
import type { ChatMultiAgent } from "@openagentpack/kit-sdk/chat";
import type { ChatMessage } from "@openagentpack/kit-sdk/messages";
import { type ReactNode, useRef, useState } from "react";
import { ArrowRight, Book, Database, Terminal } from "../icons.tsx";
import { CONTROL_CLASS } from "./general-demo.tsx";
import { AGENT } from "./layout-demo.tsx";

const agent = { ...AGENT, display_name: "方案助手", description: "检索参考资料，整理方案与评审建议。" };
const artifact = { name: "方案评审.md", type: "text/markdown" };
const multiAgent: ChatMultiAgent = {
	selectedThreadId: null,
	threads: [
		{
			id: "sthr_resource_research",
			name: "资料研究员",
			task: "整理方案的参考资料",
			status: "idle",
			createdAt: "2026-11-18T01:00:00.000Z",
			endedAt: "2026-11-18T01:00:36.000Z",
			messages: [
				{
					id: "resource-research-answer",
					role: "assistant",
					status: "done",
					parts: [
						{
							id: "resource-research-answer:text",
							type: "text",
							text: "已整理三项参考依据，并补充方案的风险与验收条件。",
						},
					],
				},
			],
			loading: false,
			error: null,
			nextPageToken: null,
			historyAvailable: true,
			loaded: true,
		},
	],
	loading: false,
	error: null,
	selectThread: () => undefined,
	refreshThreads: async () => undefined,
	loadThreadEvents: async () => undefined,
};

function ResourceSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<details open className="kit-collapse group/resource min-w-0">
			<summary className="-mx-2 flex cursor-pointer list-none items-center gap-2 rounded-[var(--kit-radius-sm)] px-2 py-1 text-[length:var(--kit-text-label)] font-medium text-[var(--kit-fg-muted)] transition-colors duration-[var(--kit-duration-fast)] ease-[var(--kit-ease-out)] select-none hover:bg-[var(--kit-bg-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--kit-focus)] motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
				{title}
				<ArrowRight className="ml-auto size-3.5 shrink-0 transition-transform duration-[var(--kit-duration-fast)] group-open/resource:rotate-90 motion-reduce:transition-none" />
			</summary>
			<div className="mt-1.5 text-[length:var(--kit-text-label)] text-[var(--kit-fg)]">{children}</div>
		</details>
	);
}

/** Layout 管理右栏与移动覆盖层，各业务分区通过公开组件组合。 */
export function ResourcePanelDemo() {
	const [asideOpen, setAsideOpen] = useState(true);
	const [note, setNote] = useState("");
	const [messages, setMessages] = useState<ChatMessage[]>([
		{
			id: "resource-main-answer",
			role: "assistant",
			status: "done",
			parts: [{ id: "resource-main-answer:text", type: "text", text: "资料整理完成，已生成方案评审.md。" }],
		},
	]);
	const sequence = useRef(0);
	return (
		<Layout
			data-kit-appearance="workspace"
			className="flex-1"
			header={() => (
				<AgentHeader
					agent={agent}
					compact
					actions={
						<>
							<StatusIndicator variant="badge" connected turnRunning={false} connection="connected" phase="idle" />
							<button
								type="button"
								className={CONTROL_CLASS}
								aria-label={asideOpen ? "收起资源面板" : "展开资源面板"}
								aria-pressed={asideOpen}
								onClick={() => setAsideOpen((open) => !open)}
							>
								资源
							</button>
						</>
					}
				/>
			)}
			asideOpen={asideOpen}
			onAsideOpenChange={setAsideOpen}
			aside={({ closeButton }) => (
				<div className="flex min-h-0 flex-1 flex-col">
					{closeButton ? (
						<div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--kit-border-subtle)] px-4">
							<span className="flex-1 text-[length:var(--kit-text-label)] font-medium">资源</span>
							{closeButton}
						</div>
					) : null}
					<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:py-5">
						<ResourceSection title="Agent 信息">
							<p className="font-medium">{agent.display_name}</p>
							<p className="mt-1 leading-6 text-[var(--kit-fg-muted)]">{agent.description}</p>
						</ResourceSection>
						<SubAgentPanel multiAgent={multiAgent} />
						<div className="mt-6 space-y-6">
							<ResourceSection title="技能与 MCP">
								<ul className="space-y-3">
									<li className="flex items-center gap-2">
										<Book className="size-3.5 shrink-0 text-[var(--kit-fg-muted)]" />
										资料整理
									</li>
									<li className="flex items-center gap-2">
										<Database className="size-3.5 shrink-0 text-[var(--kit-fg-muted)]" />
										文档检索服务
									</li>
								</ul>
							</ResourceSection>
							<ResourceSection title="工具">
								<div className="flex items-center gap-2">
									<Terminal className="size-3.5 shrink-0 text-[var(--kit-fg-muted)]" />
									<span>write_file</span>
									<span className="ml-auto text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
										每次询问
									</span>
								</div>
							</ResourceSection>
							<ResourceSection title="记忆库">
								<p>团队知识</p>
								<p className="mt-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
									产品术语与评审规范
								</p>
							</ResourceSection>
							<ResourceSection title="产物">
								<FileCard
									{...artifact}
									onClick={() => setNote("已触发预览回调，方案评审.md（本地演示）")}
									onDownload={() => setNote("已触发下载回调，方案评审.md（本地演示）")}
								/>
								<p role="status" className="mt-2 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
									{note}
								</p>
							</ResourceSection>
						</div>
					</div>
				</div>
			)}
		>
			<Chat
				variant="workspace"
				messages={messages}
				onSend={(text) => {
					sequence.current += 1;
					const id = `resource-message-${sequence.current}`;
					setMessages((current) => [
						...current,
						{ id, role: "user", status: "done", parts: [{ id: `${id}:text`, type: "text", text }] },
					]);
				}}
			/>
		</Layout>
	);
}

export const RESOURCE_PANEL_CODE = `import { AgentHeader, Chat, FileCard, Layout, StatusIndicator, SubAgentPanel } from "@openagentpack/kit-chat-ui";
import { useState } from "react";

const [resourcesOpen, setResourcesOpen] = useState(true);

<Layout
  data-kit-appearance="workspace"
  className="h-dvh"
  header={() => (
    <AgentHeader
      agent={agent}
      compact
      actions={(
        <>
          <StatusIndicator variant="badge" connected={chat.connection === "connected"}
            turnRunning={chat.turnRunning} connection={chat.connection} phase={chat.phase} />
          <button type="button" aria-pressed={resourcesOpen}
            onClick={() => setResourcesOpen((open) => !open)}>
            资源
          </button>
        </>
      )}
    />
  )}
  asideOpen={resourcesOpen}
  onAsideOpenChange={setResourcesOpen}
  aside={({ closeButton }) => (
    <div className="flex min-h-0 flex-1 flex-col">
      {closeButton ? (
        <div className="flex min-h-14 items-center justify-between px-4">
          资源{closeButton}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:py-5">
        <details open className="kit-collapse">
          <summary>Agent 信息</summary>
          <p>{agent.display_name}</p>
          <p>{agent.description}</p>
        </details>
        <SubAgentPanel multiAgent={chat.multiAgent} />
        {resourceSections}
        {chat.artifacts.map((file) => (
          <FileCard key={file.file_id}
            name={file.filename ?? file.file_id} type={file.content_type}
            onClick={() => openArtifact(file.file_id, file.content_type)}
            onDownload={() => downloadArtifact(file.file_id)} />
        ))}
      </div>
    </div>
  )}
>
  <Chat variant="workspace" messages={chat.messages}
    canSend={chat.canSend} turnRunning={chat.turnRunning}
    onSend={(text, skills) => chat.send(text, { skills })} onStop={chat.stop} />
</Layout>
// resourceSections 由业务页面渲染技能、MCP、工具和记忆库。
// openArtifact 与 downloadArtifact 由调用方接入文件预览和下载。`;
