import type { ChatMultiAgent } from "@openagentkit/sdk/chat";
import type { ChatMessage, MessagePart } from "@openagentkit/sdk/messages";
import { parseSkillDirective } from "@openagentkit/sdk/protocol";
import { computed, defineComponent, h, type PropType, type VNode } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { Markdown } from "../markdown/index.ts";
import { ExecutionGroup, isProcessPart, type ProcessPart } from "../process/execution-group/index.ts";
import { SubAgentCard } from "../process/sub-agent-card/index.ts";
import { ProcessingIndicator } from "../processing-indicator/index.ts";
import { SkillGlyph } from "../sender/index.ts";
import messageStrings, { type MessageStrings } from "./strings.ts";

export { type MessageStrings, messageStrings };

function displayValue(value: unknown, fallback: string): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return fallback;
	}
}

function copyableText(message: ChatMessage): string {
	return message.parts
		.filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
		.map((part) => part.text)
		.join("");
}

/** 用户气泡正文：按已知技能名解析协议 token，在原位穿插还原技能 chip。 */
function renderUserText(text: string, skills: string[] | undefined): VNode {
	const segments = skills?.length ? parseSkillDirective(text, skills) : null;
	if (!segments || segments.every((segment) => segment.kind === "text")) {
		return h("div", { class: "whitespace-pre-wrap" }, text);
	}
	const counters = new Map<string, number>();
	const nodes: VNode[] = [];
	for (const segment of segments) {
		const base = segment.kind === "skill" ? `skill:${segment.name}` : `text:${segment.value}`;
		const occurrence = counters.get(base) ?? 0;
		counters.set(base, occurrence + 1);
		nodes.push(
			segment.kind === "skill"
				? h(
						"span",
						{
							key: `${base}#${occurrence}`,
							class:
								"inline-flex items-center gap-1 rounded-[var(--kit-radius-chip)] bg-[var(--kit-skill-chip-bg)] px-2 py-0.5 align-baseline text-[length:var(--kit-text-label)] font-medium text-[var(--kit-skill-chip-fg)]",
						},
						[h(SkillGlyph, { className: "size-3.5" }), segment.name],
					)
				: h("span", { key: `${base}#${occurrence}` }, segment.value),
		);
	}
	return h("div", { class: "whitespace-pre-wrap" }, nodes);
}

function formatMessageTime(date: Date): string {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderStatus(status: ChatMessage["status"], role: ChatMessage["role"], strings: MessageStrings): VNode | null {
	if (status === "pending")
		return h("span", { class: "text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" }, strings.sending);
	if (status === "failed")
		return h(
			"span",
			{ class: "text-[length:var(--kit-text-caption)] text-[var(--kit-danger)]" },
			role === "user" ? strings.sendFailed : strings.generationFailed,
		);
	if (status === "interrupted")
		return h(
			"span",
			{ class: "text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
			strings.interrupted,
		);
	return null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 分片渲染按协议类型平铺，与 React 版保持同一顺序
function renderPart(
	part: MessagePart,
	role: ChatMessage["role"],
	skills: string[] | undefined,
	strings: MessageStrings,
	slots: Record<string, ((props: Record<string, unknown>) => VNode[]) | undefined>,
	multiAgent?: ChatMultiAgent,
	onArtifactOpen?: (fileId: string, contentType?: string) => void,
	onArtifactDownload?: (fileId: string) => void,
): VNode[] {
	if (part.type === "text")
		return [role === "user" ? renderUserText(part.text, skills) : h(Markdown, null, () => part.text)];
	if (part.type === "sub-agent") {
		const slot = slots["sub-agent"];
		if (slot) return slot({ part });
		if (!multiAgent) return [];
		return [
			h(SubAgentCard, {
				threadId: part.threadId,
				multiAgent,
				onArtifactOpen,
				onArtifactDownload,
			}),
		];
	}
	if (part.type === "attachment" || part.type === "artifact") {
		const slot = slots[part.type];
		if (slot) return slot({ part });
		const label =
			part.type === "artifact"
				? (part.artifact.filename ?? part.artifact.file_id)
				: (part.file.filename ?? part.file.file_id);
		return [
			h(
				"div",
				{
					class:
						"my-1.5 inline-flex max-w-full items-center rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] px-2 py-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]",
				},
				label,
			),
		];
	}
	if (part.type === "unknown")
		return [
			h("details", { class: "my-2 text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)]" }, [
				h("summary", { class: "cursor-pointer" }, [strings.unrecognizedPrefix, part.label]),
				h(
					"pre",
					{ class: "mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]" },
					displayValue(part.value, strings.serializeFallback),
				),
			]),
		];
	if (part.type === "status")
		return [h("div", { class: "my-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" }, part.text)];
	return [];
}

function surfaceClass(variant: "default" | "workspace", role: ChatMessage["role"]): string {
	if (variant === "workspace") {
		return role === "user"
			? "max-w-[85%] rounded-[var(--kit-radius)] bg-[var(--kit-user-bubble)] px-4 py-3 sm:max-w-[75%]"
			: "w-full";
	}
	return `max-w-[78ch] rounded-[var(--kit-radius)] border border-[var(--kit-border)] px-4 py-3 ${
		role === "user" ? "bg-[var(--kit-user-bubble)]" : "bg-[var(--kit-assistant-bubble)]"
	}`;
}

type RenderItem = { kind: "part"; part: MessagePart } | { kind: "run"; parts: ProcessPart[]; ended: boolean };

/** 连续的思考/工具分片折成一个执行容器；正文与其他分片打断分组。 */
function groupProcessRuns(parts: MessagePart[]): RenderItem[] {
	const items: RenderItem[] = [];
	let run: Extract<RenderItem, { kind: "run" }> | null = null;
	for (const part of parts) {
		if (isProcessPart(part)) {
			if (!run) {
				run = { kind: "run", parts: [], ended: false };
				items.push(run);
			}
			run.parts.push(part);
		} else {
			if (run) run.ended = true;
			run = null;
			items.push({ kind: "part", part });
		}
	}
	return items;
}

function renderActions(
	message: ChatMessage,
	text: string,
	strings: MessageStrings,
	onCopy: ((text: string) => void | Promise<void>) | undefined,
): VNode | null {
	if (message.role !== "assistant" || message.status !== "done" || !text.trim()) return null;
	return h("div", { class: "mt-2 flex items-center gap-2" }, [
		h(
			"button",
			{
				type: "button",
				"aria-label": strings.actionsAriaLabel,
				class:
					"rounded-[var(--kit-radius-xs)] px-1.5 py-0.5 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-bg-subtle)]",
				onClick: () => void onCopy?.(text),
			},
			"复制",
		),
		message.createdAt
			? h(
					"time",
					{ datetime: message.createdAt, class: "text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
					formatMessageTime(new Date(message.createdAt)),
				)
			: null,
	]);
}

/** 消息：文本 + Markdown；附件、产物、子 Agent 与执行过程通过同名插槽交给上层。 */
export const Message = defineComponent({
	name: "Message",
	props: {
		message: { type: Object as () => ChatMessage, required: true },
		variant: { type: String as () => "default" | "workspace", default: "default" },
		onCopy: { type: Function as PropType<(text: string) => void | Promise<void>>, default: undefined },
		skills: { type: Array as () => string[], default: undefined },
		strings: { type: Object as () => Partial<MessageStrings>, default: undefined },
		multiAgent: { type: Object, default: undefined },
		onArtifactDownload: { type: Function as PropType<(fileId: string) => void>, default: undefined },
		onArtifactOpen: {
			type: Function as PropType<(fileId: string, contentType?: string) => void>,
			default: undefined,
		},
	},
	setup(props, { slots }) {
		const strings = computed(() => resolveStrings(messageStrings, useKitLocale(), props.strings));
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 消息组合按 DOM 结构平铺，拆分反而割裂阅读顺序
		return () => {
			const message = props.message;
			const text = copyableText(message);
			const streaming = message.status === "streaming";
			const showsStatus = message.status !== "done" && !streaming;
			const status = renderStatus(message.status, message.role, strings.value);
			const nodes: VNode[] = [];
			if (showsStatus && status) nodes.push(h("div", { class: "mb-2" }, [status]));
			for (const item of groupProcessRuns(message.parts)) {
				if (item.kind === "run") {
					if (slots.process) nodes.push(...slots.process({ parts: item.parts, ended: item.ended, streaming }));
					else
						nodes.push(
							h(ExecutionGroup, {
								parts: item.parts,
								createdAt: message.createdAt,
								messageStreaming: streaming,
								ended: item.ended,
							}),
						);
				} else {
					nodes.push(
						...renderPart(
							item.part,
							message.role,
							props.skills,
							strings.value,
							slots as never,
							props.multiAgent as ChatMultiAgent | undefined,
							props.onArtifactOpen,
							props.onArtifactDownload,
						),
					);
				}
			}
			if (streaming && message.role === "assistant") {
				nodes.push(h(ProcessingIndicator, { className: "mt-1" }));
			}
			const surface = surfaceClass(props.variant, message.role);
			const actions = renderActions(message, text, strings.value, props.onCopy);
			return h(
				"div",
				{
					class: `group/message relative flex min-w-0 ${props.variant === "workspace" ? "" : "my-2"} ${message.role === "user" ? "justify-end" : "justify-start"}`,
				},
				[
					h(
						"div",
						{
							class: `min-w-0 text-[length:var(--kit-text-body)] leading-[var(--kit-leading-body)] [overflow-wrap:anywhere] ${surface}`,
						},
						[...nodes, actions],
					),
				],
			);
		};
	},
});
