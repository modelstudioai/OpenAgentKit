import type { RootContent } from "hast";
import { common, createLowlight } from "lowlight";
import { computed, defineComponent, h, ref, type VNode } from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { slotText } from "../slot-text.ts";
import codeHighlighterStrings, { type CodeHighlighterStrings } from "./strings.ts";

export { type CodeHighlighterStrings, codeHighlighterStrings };

const highlighter = createLowlight(common);
const maxHighlightLength = 50_000;

function tokenClass(names: unknown): string | undefined {
	if (!Array.isArray(names)) return undefined;
	if (names.some((name) => /comment|quote/.test(String(name)))) return "text-[var(--kit-fg-muted)] italic";
	if (names.some((name) => /string|regexp|addition/.test(String(name)))) return "text-[var(--kit-code-string)]";
	if (names.some((name) => /deletion/.test(String(name)))) return "text-[var(--kit-danger)]";
	if (names.some((name) => /keyword|selector|title|name|built_in/.test(String(name)))) {
		return "text-[var(--kit-code-keyword)]";
	}
	if (names.some((name) => /number|literal|attr|symbol|meta/.test(String(name)))) {
		return "text-[var(--kit-code-number)]";
	}
	return undefined;
}

function renderTokens(nodes: RootContent[]): Array<VNode | string> {
	const out: Array<VNode | string> = [];
	for (const node of nodes) {
		if (node.type === "text") out.push(node.value);
		else if (node.type === "element") {
			out.push(h("span", { class: tokenClass(node.properties?.className) }, renderTokens(node.children)));
		}
	}
	return out;
}

/** 只渲染语法树与原文；未知语言保留为纯文本，不执行代码或插入 HTML。 */
export const CodeHighlighter = defineComponent({
	name: "CodeHighlighter",
	props: {
		lang: { type: String, default: undefined },
		header: { type: [String, Boolean], default: undefined },
		copyable: { type: Boolean, default: true },
		showLineNumbers: { type: Boolean, default: false },
		className: { type: String, default: undefined },
		strings: { type: Object as () => Partial<CodeHighlighterStrings>, default: undefined },
	},
	setup(props, { slots }) {
		const strings = computed(() => resolveStrings(codeHighlighterStrings, useKitLocale(), props.strings));
		const copyState = ref<"" | "success" | "error">("");
		const copy = async (code: string) => {
			try {
				await navigator.clipboard.writeText(code);
				copyState.value = "success";
			} catch {
				copyState.value = "error";
			}
		};

		const renderHeader = (code: string, label: string) => {
			if (props.header === false) return null;
			return h(
				"div",
				{
					class:
						"flex items-center justify-between gap-2 border-b border-[var(--kit-border-subtle)] bg-[var(--kit-surface)] px-3 py-2 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]",
				},
				[
					h("div", { class: "min-w-0 truncate", title: label }, label),
					props.copyable
						? h("div", { class: "shrink-0" }, [
								h(
									"button",
									{
										type: "button",
										"aria-label": strings.value.copyCode,
										class:
											"rounded-[var(--kit-radius-xs)] px-2 py-1 hover:bg-[var(--kit-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]",
										onClick: () => void copy(code),
									},
									strings.value.copyCode,
								),
								h(
									"span",
									{ role: "status", class: "sr-only" },
									copyState.value === "success" ? "✓" : copyState.value === "error" ? "×" : "",
								),
							])
						: null,
				],
			);
		};

		const renderBody = (code: string, language: string, highlighted: Array<VNode | string> | string) =>
			h(
				"pre",
				{
					role: "region",
					"aria-label": strings.value.contentAria,
					tabindex: 0,
					class:
						"m-0 flex overflow-x-auto rounded-none border-0 bg-[var(--kit-bg-subtle)] p-3 font-mono text-[length:var(--kit-text-base)] leading-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--kit-focus)]",
				},
				[
					props.showLineNumbers
						? h(
								"span",
								{
									"aria-hidden": "true",
									class:
										"mr-3 shrink-0 select-none border-r border-[var(--kit-border-subtle)] pr-3 text-right text-[var(--kit-fg-muted)]",
								},
								Array.from({ length: code.split("\n").length }, (_, index) => index + 1).join("\n"),
							)
						: null,
					h(
						"code",
						{
							"data-language": language,
							class: "block min-w-0 flex-1 whitespace-pre rounded-none border-0 bg-transparent p-0 text-inherit",
						},
						Array.isArray(highlighted) ? highlighted : [highlighted],
					),
				],
			);

		return () => {
			const code = slotText(slots.default?.());
			const language = props.lang?.trim().toLowerCase() || "text";
			const highlighted =
				code.length > maxHighlightLength || !highlighter.registered(language)
					? code
					: (() => {
							try {
								return renderTokens(highlighter.highlight(language, code).children);
							} catch {
								return code;
							}
						})();
			const label = typeof props.header === "string" ? props.header : language;
			return h(
				"section",
				{
					"data-code-highlighter": "",
					"aria-label": strings.value.blockAria,
					class: `my-2 min-w-0 overflow-hidden rounded-[var(--kit-radius)] border border-[var(--kit-border-subtle)] bg-[var(--kit-bg-subtle)] text-[var(--kit-fg)] ${props.className ?? ""}`,
				},
				[renderHeader(code, label), renderBody(code, language, highlighted)],
			);
		};
	},
});
