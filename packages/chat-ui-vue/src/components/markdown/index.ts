import type { Element, Root, RootContent } from "hast";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { defineComponent, h, type VNode } from "vue";
import { CodeHighlighter } from "../code-highlighter/index.ts";
import { useKitStrings } from "../kit-i18n/index.ts";
import { Mermaid } from "../mermaid/index.ts";
import { slotText } from "../slot-text.ts";
import markdownStrings from "./strings.ts";

export { type MarkdownStrings, markdownStrings } from "./strings.ts";

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeSanitize, defaultSchema);

const TAG_CLASS: Record<string, string> = {
	h1: "mt-8 mb-4 text-[length:var(--kit-text-prose-title)] font-semibold leading-snug",
	h2: "mt-6 mb-3 text-[length:var(--kit-text-prose-heading)] font-semibold leading-snug",
	h3: "mt-5 mb-2 text-[length:var(--kit-text-prose-subheading)] font-semibold leading-snug",
	h4: "mt-4 mb-2 text-[length:var(--kit-text-heading)] font-semibold leading-snug",
	h5: "mt-4 mb-2 font-semibold",
	h6: "mt-4 mb-2 font-semibold text-[var(--kit-fg-muted)]",
	strong: "font-semibold",
	blockquote:
		"my-4 border-l-2 border-[var(--kit-border)] pl-4 text-[var(--kit-fg-muted)] [&>:first-child]:mt-0 [&>:last-child]:mb-0",
	hr: "my-6 border-0 border-t border-[var(--kit-border-subtle)]",
	th: "border border-[var(--kit-border)] bg-[var(--kit-bg-subtle)] px-3 py-2 text-left font-semibold",
	td: "border border-[var(--kit-border)] px-3 py-2 align-top",
	p: "my-3 leading-[var(--kit-leading-body)]",
	ul: "my-3 list-disc space-y-1 pl-6 marker:text-[var(--kit-fg-muted)]",
	ol: "my-3 list-decimal space-y-1 pl-6 marker:text-[var(--kit-fg-muted)]",
	li: "pl-1 [&>ol]:my-2 [&>ul]:my-2 [&>p]:my-2 [&.task-list-item]:list-none [&>input[type=checkbox]]:mr-2 [&>input[type=checkbox]]:accent-[var(--kit-accent)]",
	code: "rounded-[var(--kit-radius-xs)] bg-[var(--kit-bg-subtle)] px-1 py-0.5 font-mono text-[length:var(--kit-text-base)] [overflow-wrap:anywhere]",
	a: "rounded-[var(--kit-radius-xs)] text-[var(--kit-accent)] underline decoration-[var(--kit-border)] underline-offset-4 [overflow-wrap:anywhere] hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]",
};

const TABLE_WRAP =
	"my-4 max-w-full overflow-x-auto rounded-[var(--kit-radius-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]";
const TABLE = "w-max min-w-full border-collapse text-[length:var(--kit-text-label)]";

/** 解析 Markdown：gfm + sanitize，代码与 Mermaid 围栏复用反馈组件。 */
export function parseMarkdown(source: string): Root {
	return processor.runSync(processor.parse(source)) as Root;
}

function hasClosingFence(source: string, quoted: boolean) {
	const lines = source.split(/\r?\n/);
	const opening = lines[0]?.match(/^\s*(`{3,}|~{3,})/);
	const lastLine = quoted ? lines.at(-1)?.replace(/^(?:\s*>\s*)+/, "") : lines.at(-1);
	const closing = lastLine?.match(/^\s*(`{3,}|~{3,})\s*$/);
	return Boolean(
		lines.length > 1 &&
			opening &&
			closing &&
			opening[1]?.[0] === closing[1]?.[0] &&
			closing[1]!.length >= opening[1]!.length,
	);
}

export { hasClosingFence };

function textOf(element: Element): string {
	return element.children
		.map((child) => (child.type === "text" ? child.value : child.type === "element" ? textOf(child) : ""))
		.join("");
}

function propsOf(element: Element): Record<string, unknown> {
	const props: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(element.properties ?? {})) {
		if (key === "className") props.class = Array.isArray(value) ? value.join(" ") : String(value ?? "");
		else if (value !== null && value !== undefined) props[key] = value;
	}
	return props;
}

function withClass(props: Record<string, unknown>, extra: string | undefined) {
	if (!extra) return props;
	const current = typeof props.class === "string" ? props.class : "";
	return { ...props, class: `${extra} ${current}`.trim() };
}

function renderChildren(nodes: RootContent[], source: string, tableLabel: string): Array<VNode | string> {
	const out: Array<VNode | string> = [];
	for (const node of nodes) {
		if (node.type === "text") out.push(node.value);
		else if (node.type === "element") out.push(...renderElement(node, source, tableLabel));
	}
	return out;
}

function renderElement(element: Element, source: string, tableLabel: string): Array<VNode | string> {
	const tag = element.tagName;
	const props = propsOf(element);
	const children = renderChildren(element.children, source, tableLabel);

	if (tag === "pre") return renderPre(element, source, children);
	if (tag === "table") {
		return [
			h("section", { "aria-label": tableLabel, tabindex: 0, class: TABLE_WRAP }, [
				h("table", { ...props, class: TABLE }, children),
			]),
		];
	}
	if (tag === "a") {
		return [h("a", { ...props, class: TAG_CLASS.a, target: "_blank", rel: "noreferrer noopener" }, children)];
	}
	return [h(tag, withClass(props, TAG_CLASS[tag]), children)];
}

function renderPre(element: Element, source: string, fallback: Array<VNode | string>): Array<VNode | string> {
	const code = element.children.find((child): child is Element => child.type === "element" && child.tagName === "code");
	if (!code) return [h("pre", propsOf(element), fallback)];
	const classes = code.properties?.className;
	const lang = Array.isArray(classes)
		? classes
				.map(String)
				.find((name) => name.startsWith("language-"))
				?.slice(9)
		: undefined;
	const value = textOf(code).replace(/\n$/, "");
	if (lang?.toLowerCase() !== "mermaid") return [h(CodeHighlighter, { lang }, () => value)];
	const start = element.position?.start.offset ?? 0;
	const end = element.position?.end.offset ?? 0;
	const block = source.slice(start, end);
	const linePrefix = source.slice(source.lastIndexOf("\n", start - 1) + 1, start);
	return [h(Mermaid, { code: value, streaming: !hasClosingFence(block, linePrefix.includes(">")) })];
}

/** Markdown 渲染：默认插槽放原文；gfm + sanitize，代码和完整 Mermaid 围栏复用反馈组件。 */
export const Markdown = defineComponent({
	name: "Markdown",
	setup(_props, { slots }) {
		const strings = useKitStrings(markdownStrings);
		return () => {
			const source = slotText(slots.default?.());
			const tree = parseMarkdown(source);
			return h(
				"div",
				{
					class:
						"min-w-0 text-[length:var(--kit-text-body)] leading-[var(--kit-leading-body)] [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0",
				},
				renderChildren(tree.children, source, strings.value.table),
			);
		};
	},
});
