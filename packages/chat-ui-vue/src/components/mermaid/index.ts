import { computed, defineComponent, h, onMounted, onUnmounted, type PropType, ref, type VNode, watch } from "vue";
import { CodeHighlighter } from "../code-highlighter/index.ts";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import { slotText } from "../slot-text.ts";
import mermaidStrings, { type MermaidStrings } from "./strings.ts";

export { type MermaidStrings, mermaidStrings };

let renderQueue: Promise<void> = Promise.resolve();
let renderSequence = 0;

export function hasResourceSyntax(source: string) {
	const decoded = source
		.replace(/\\([\da-f]{1,6})\s?/gi, (_, code: string) =>
			String.fromCodePoint(Math.min(Number.parseInt(code, 16), 0x10ffff)),
		)
		.replace(/\\([^\r\n])/g, "$1")
		.replace(/&#(x[\da-f]+|\d+);?/gi, (_, code: string) => {
			const value = code[0]?.toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
			return String.fromCodePoint(Math.min(value, 0x10ffff));
		})
		.replace(/&lt;/gi, "<");
	return /@\s*\{|!\[|<\s*(?:img|image|svg|iframe|object|embed|link|style)\b|\b(?:url|image|image-set|cross-fade)\s*\(|@(?:import|font-face)\b/i.test(
		decoded,
	);
}

function themeVariables(element: HTMLElement) {
	const style = getComputedStyle(element);
	const token = (name: string) => style.getPropertyValue(`--kit-${name}`).trim();
	return Object.fromEntries(
		Object.entries({
			background: token("bg"),
			primaryColor: token("bg-subtle"),
			primaryTextColor: token("fg"),
			primaryBorderColor: token("border"),
			lineColor: token("fg-muted"),
			secondaryColor: token("user-bubble"),
			tertiaryColor: token("bg"),
			edgeLabelBackground: token("bg"),
			fontFamily: style.fontFamily,
		}).filter(([, value]) => value),
	);
}

async function renderDiagram(source: string, element: HTMLElement): Promise<string> {
	const { default: mermaid } = await import("mermaid");
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: "strict",
		suppressErrorRendering: true,
		htmlLabels: false,
		theme: "base",
		themeVariables: themeVariables(element),
		secure: Object.keys(mermaid.mermaidAPI.getConfig()),
		flowchart: { htmlLabels: false },
	});
	const container = document.createElement("div");
	container.className = "pointer-events-none fixed left-0 top-0 -z-10 opacity-0";
	container.setAttribute("aria-hidden", "true");
	document.body.append(container);
	try {
		const { svg } = await mermaid.render(`kit-mermaid-${++renderSequence}`, source, container);
		return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	} finally {
		container.remove();
	}
}

interface RenderResult {
	source: string;
	revision: number;
	image?: string;
	error?: boolean;
}

/** 严格模式的图表/源码双视图。流式未完成时展示源码，更新后自动恢复渲染。 */
export const Mermaid = defineComponent({
	name: "Mermaid",
	props: {
		code: { type: String, default: undefined },
		header: { type: [String, Boolean], default: undefined },
		className: { type: String, default: undefined },
		defaultRenderType: { type: String as () => "image" | "code", default: "image" },
		copyable: { type: Boolean, default: true },
		streaming: { type: Boolean, default: false },
		onRenderTypeChange: {
			type: Function as PropType<(value: "image" | "code") => void>,
			default: undefined,
		},
		strings: { type: Object as () => Partial<MermaidStrings>, default: undefined },
	},
	setup(props, { slots }) {
		const strings = computed(() => resolveStrings(mermaidStrings, useKitLocale(), props.strings));
		const root = ref<HTMLElement | null>(null);
		const panelId = `kit-mermaid-panel-${Math.random().toString(36).slice(2, 8)}`;
		const renderType = ref<"image" | "code">(props.defaultRenderType);
		const revision = ref(0);
		const result = ref<RenderResult | undefined>(undefined);
		const copyState = ref<"" | "success" | "error">("");
		const source = computed(() => props.code ?? slotText(slots.default?.()));
		const hasResources = computed(() => hasResourceSyntax(source.value));
		let generation = 0;
		let observer: MutationObserver | null = null;

		function schedule() {
			const element = root.value;
			if (!element || props.streaming || hasResources.value || renderType.value === "code") return;
			const turn = ++generation;
			const current = source.value;
			const rev = revision.value;
			result.value = undefined;
			renderQueue = renderQueue.then(async () => {
				if (turn !== generation) return;
				try {
					const image = await renderDiagram(current, element);
					if (turn === generation) result.value = { source: current, revision: rev, image };
				} catch {
					if (turn === generation) result.value = { source: current, revision: rev, error: true };
				}
			});
		}

		watch([source, () => props.streaming, renderType, revision, hasResources], () => schedule());
		onMounted(() => {
			observer = new MutationObserver(() => {
				revision.value += 1;
			});
			for (let parent = root.value?.parentElement; parent; parent = parent.parentElement) {
				observer.observe(parent, { attributes: true, attributeFilter: ["data-kit-theme", "class", "style"] });
			}
			schedule();
		});
		onUnmounted(() => {
			generation += 1;
			observer?.disconnect();
		});

		const copy = async () => {
			try {
				await navigator.clipboard.writeText(source.value);
				copyState.value = "success";
			} catch {
				copyState.value = "error";
			}
		};

		const renderHeader = () => {
			if (props.header === false) return null;
			const label = typeof props.header === "string" ? props.header : strings.value.header;
			const toggles = (["image", "code"] as const).map((type) =>
				h(
					"button",
					{
						type: "button",
						"aria-pressed": renderType.value === type,
						"aria-controls": panelId,
						class:
							"rounded-[var(--kit-radius-sm)] px-2 py-1 text-[var(--kit-fg-muted)] hover:bg-[var(--kit-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-accent)] aria-pressed:bg-[var(--kit-bg)] aria-pressed:text-[var(--kit-accent)]",
						onClick: () => {
							renderType.value = type;
							props.onRenderTypeChange?.(type);
						},
					},
					type === "image" ? strings.value.chart : strings.value.source,
				),
			);
			return h("div", { class: "flex flex-wrap items-center justify-between gap-2 px-1 text-xs" }, [
				h("div", { class: "min-w-0 truncate text-[var(--kit-fg-muted)]" }, label),
				h("div", { class: "flex items-center gap-1" }, [
					...toggles,
					props.copyable
						? h(
								"button",
								{
									type: "button",
									"aria-label": strings.value.copySource,
									class:
										"rounded-[var(--kit-radius-sm)] px-2 py-1 text-[var(--kit-fg-muted)] hover:bg-[var(--kit-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-accent)]",
									onClick: () => void copy(),
								},
								strings.value.copySource,
							)
						: null,
					h("span", { role: "status", class: "sr-only" }, copyState.value === "success" ? "✓" : ""),
				]),
			]);
		};

		const renderError = () =>
			h("div", { role: "alert", class: "mb-2 flex flex-wrap items-center gap-2 text-sm text-[var(--kit-fg-muted)]" }, [
				h("span", null, strings.value.renderError),
				h(
					"button",
					{
						type: "button",
						class: "text-[var(--kit-accent)] underline underline-offset-2",
						onClick: () => {
							revision.value += 1;
						},
					},
					strings.value.rerender,
				),
			]);

		const renderPanel = (current: RenderResult | undefined, showSource: boolean) => {
			const notices = [
				hasResources.value
					? h("p", { role: "status", class: "mb-2 text-sm text-[var(--kit-fg-muted)]" }, strings.value.resourceNotice)
					: null,
				props.streaming
					? h("p", { role: "status", class: "mb-2 text-sm text-[var(--kit-fg-muted)]" }, strings.value.streamingNotice)
					: null,
				current?.error && renderType.value === "image" && !props.streaming ? renderError() : null,
			];
			let content: VNode | null;
			if (showSource) content = h(CodeHighlighter, { lang: "mermaid", header: false }, () => source.value);
			else if (current?.image)
				content = h("div", { class: "overflow-x-auto" }, [
					h("img", { src: current.image, alt: strings.value.header, class: "mx-auto block max-w-full" }),
				]);
			else content = h("p", { role: "status", class: "text-sm text-[var(--kit-fg-muted)]" }, strings.value.rendering);
			return h("div", { id: panelId, class: "p-3" }, [...notices, content]);
		};

		return () => {
			const current =
				result.value?.source === source.value && result.value.revision === revision.value ? result.value : undefined;
			const showSource = renderType.value === "code" || props.streaming || hasResources.value || current?.error;
			return h(
				"section",
				{
					ref: root,
					"data-mermaid": "",
					"aria-label": strings.value.header,
					class: `my-2 min-w-0 overflow-hidden rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-bg)] text-[var(--kit-fg)] ${props.className ?? ""}`,
				},
				[
					h(
						"div",
						{
							class:
								"flex flex-wrap items-center justify-between gap-2 border-b border-[var(--kit-border)] bg-[var(--kit-bg-subtle)] px-3 py-1.5 ",
						},
						[renderHeader()],
					),
					renderPanel(current, Boolean(showSource)),
				],
			);
		};
	},
});
