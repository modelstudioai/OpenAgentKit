import type { ChatMessage, MessagePart } from "@openagentkit/sdk/messages";
import {
	Actions,
	ActionsCopy,
	ActionsFeedback,
	type ActionsFeedbackValue,
	ArtifactCard,
	AttachmentFileCard,
	type AttachmentItem,
	Attachments,
	CodeHighlighter,
	FileCard,
	Markdown,
	Mermaid,
	Message,
	MessageList,
	ReasoningBlock,
	SenderHeader,
	ToolCallCard,
} from "@openagentpack/kit-chat-ui";
import { useState } from "react";

export interface ContentExamplesProps {
	messages: ChatMessage[];
	tool: Extract<MessagePart, { type: "tool" }>;
	attachment: AttachmentItem;
	onDownload: (fileId: string) => void;
	onCopy: (text: string) => Promise<void>;
}

// 在高度有界的容器内渲染消息列表。
export function ContentExamples({ messages, tool, attachment, onDownload, onCopy }: ContentExamplesProps) {
	const [feedback, setFeedback] = useState<ActionsFeedbackValue>("default");
	const message = messages[0];
	return (
		<div className="flex flex-col gap-3" data-kit-appearance="workspace">
			{message ? (
				<Message variant="workspace" message={message} onArtifactDownload={onDownload} onCopy={onCopy} />
			) : null}
			<div className="flex h-full min-h-0 flex-col">
				<MessageList
					variant="workspace"
					messages={messages}
					autoScroll={false}
					onArtifactDownload={onDownload}
					onCopy={onCopy}
					empty={<p>暂无消息</p>}
				/>
			</div>
			<ReasoningBlock text="先比较已获得的证据，再给出回答。" status="done" />
			<ToolCallCard part={tool} />
			<ArtifactCard
				filename="report.pdf"
				contentType="application/pdf"
				onDownload={() => onDownload("output-report")}
			/>
			<FileCard name="notes.txt" onDownload={() => onDownload("notes")} />
			<Markdown>
				{"## 结果\n\n下面是经过**净化**的 Markdown 表格。\n\n| 项目 | 状态 |\n| --- | --- |\n| 报告 | 已就绪 |"}
			</Markdown>
			<CodeHighlighter lang="typescript" header="示例代码" showLineNumbers>
				{'const status: string = "ready";'}
			</CodeHighlighter>
			<Mermaid header="请求流程" defaultRenderType="image">
				{"flowchart LR\n  User[用户] --> Backend[后端]\n  Backend --> Agent[智能体]"}
			</Mermaid>
			<Actions
				aria-label="回复操作"
				items={[{ key: "download", label: "下载报告", onItemClick: () => onDownload("output-report") }]}
			>
				<Actions.Copy text="报告已完成。" onCopy={onCopy} label="复制回答" />
				<Actions.Feedback value={feedback} onChange={setFeedback} />
			</Actions>
			{/* 按需导入时也可使用等效的独立导出。 */}
			<ActionsCopy text="另一段摘录。" onCopy={onCopy} label="复制摘录" />
			<ActionsFeedback value={feedback} onChange={setFeedback} />
			<SenderHeader title="已准备的文件" open closable={false}>
				<Attachments.FileCard item={attachment} />
				<AttachmentFileCard item={attachment} />
			</SenderHeader>
			<p role="status">当前反馈为 {feedback}。持久化由调用方负责。</p>
		</div>
	);
}
