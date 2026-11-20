import {
	SKILL_INPUT_PREFIX,
	type SkillInputMarker,
	skillInputMarkerRanges,
	skillInputTokens,
} from "@openagentkit/sdk/protocol";
import {
	computed,
	defineComponent,
	h,
	type InjectionKey,
	inject,
	nextTick,
	onMounted,
	onScopeDispose,
	type PropType,
	provide,
	reactive,
	ref,
	type VNode,
	watch,
} from "vue";
import { resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import senderStrings, { type SenderStrings } from "./strings.ts";

export { type SenderStrings, senderStrings };

export type SenderSubmitType = "enter" | "shiftEnter" | false;
export type SenderSemantic = "root" | "prefix" | "input" | "suffix" | "footer";

export interface SenderSkill {
	name: string;
	description?: string;
}

export interface SenderSelection {
	start: number;
	end: number;
}

export interface BackspaceReplacement {
	value: string;
	caret: number;
}

interface SenderState {
	variant: "default" | "workspace";
	value: string;
	disabled: boolean;
	loading: boolean;
	submitDisabled: boolean;
	clear: () => void;
	cancel: () => void;
	strings: SenderStrings;
}

const SenderKey: InjectionKey<SenderState> = Symbol("kit-sender");

function cx(...names: Array<string | false | undefined>): string {
	return names.filter(Boolean).join(" ");
}

const ACTION =
	"inline-flex shrink-0 items-center justify-center text-[length:var(--kit-text-base)] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50";

const SenderActionIcon = defineComponent({
	name: "SenderActionIcon",
	props: { action: { type: String as () => "send" | "stop", required: true } },
	setup(props) {
		const state = inject(SenderKey)!;
		return () =>
			h("span", { class: "inline-flex items-center gap-1" }, [
				h("span", { class: "sr-only" }, props.action === "send" ? state.strings.send : state.strings.stop),
				h(
					"svg",
					{
						"aria-hidden": "true",
						viewBox: "0 0 24 24",
						class: "size-5",
						fill: "none",
						stroke: "currentColor",
						"stroke-width": "2",
					},
					[
						props.action === "send"
							? h("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "M12 19V5m-6 6 6-6 6 6" })
							: h("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2", fill: "currentColor", stroke: "none" }),
					],
				),
			]);
	},
});

export const SendButton = defineComponent({
	name: "SendButton",
	setup(_props, { slots }) {
		const state = inject(SenderKey)!;
		return () =>
			h(
				"button",
				{
					type: "submit",
					disabled: state.disabled || state.loading || state.submitDisabled || !state.value.trim(),
					class: cx(
						ACTION,
						"bg-[var(--kit-accent)] font-semibold text-[var(--kit-accent-fg)] enabled:hover:opacity-80",
						state.variant === "workspace"
							? "h-10 min-w-10 rounded-full px-2.5"
							: "rounded-[var(--kit-radius-sm)] px-4 py-2",
					),
				},
				slots.default?.() ??
					(state.variant === "workspace" ? [h(SenderActionIcon, { action: "send" })] : [state.strings.send]),
			);
	},
});

export const LoadingButton = defineComponent({
	name: "LoadingButton",
	setup(_props, { slots }) {
		const state = inject(SenderKey)!;
		return () =>
			h(
				"button",
				{
					type: "button",
					onClick: state.cancel,
					class: cx(
						ACTION,
						state.variant === "workspace"
							? "h-10 min-w-10 rounded-full bg-[var(--kit-accent)] px-2.5 text-[var(--kit-accent-fg)] hover:opacity-80"
							: "rounded-[var(--kit-radius-sm)] bg-[var(--kit-danger)] px-4 py-2 font-semibold text-[var(--kit-danger-fg)]",
					),
				},
				slots.default?.() ??
					(state.variant === "workspace" ? [h(SenderActionIcon, { action: "stop" })] : [state.strings.stop]),
			);
	},
});

export const ClearButton = defineComponent({
	name: "ClearButton",
	setup(_props, { slots }) {
		const state = inject(SenderKey)!;
		return () =>
			h(
				"button",
				{
					type: "button",
					onClick: state.clear,
					disabled: state.disabled || !state.value,
					class: cx(
						ACTION,
						"rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] px-4 py-2 text-[var(--kit-fg-muted)]",
					),
				},
				slots.default?.() ?? [state.strings.clear],
			);
	},
});

const COMPONENTS = { SendButton, LoadingButton, ClearButton };
const EMPTY_SKILL_NAMES: string[] = [];

const CHIP_CLASS =
	"inline-flex select-none items-center gap-1 rounded-[var(--kit-radius-chip)] bg-[var(--kit-skill-chip-bg)] px-2 py-0.5 align-baseline text-[length:var(--kit-text-label)] font-medium text-[var(--kit-skill-chip-fg)]";
const SVG_NS = "http://www.w3.org/2000/svg";
const GLYPH_PATHS = ["M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z", "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"];

function makeChipNode(name: string): HTMLElement {
	const chip = document.createElement("span");
	chip.dataset.skill = name;
	chip.contentEditable = "false";
	chip.className = CHIP_CLASS;
	const glyph = document.createElementNS(SVG_NS, "svg");
	glyph.setAttribute("aria-hidden", "true");
	glyph.setAttribute("viewBox", "0 0 24 24");
	glyph.setAttribute("fill", "none");
	glyph.setAttribute("stroke", "currentColor");
	glyph.setAttribute("stroke-width", "1.5");
	glyph.setAttribute("class", "size-3.5 shrink-0");
	for (const d of GLYPH_PATHS) {
		const path = document.createElementNS(SVG_NS, "path");
		path.setAttribute("stroke-linecap", "round");
		path.setAttribute("stroke-linejoin", "round");
		path.setAttribute("d", d);
		glyph.append(path);
	}
	const label = document.createElement("span");
	label.textContent = name;
	chip.append(glyph, label);
	return chip;
}

function isSkillChip(node: Node): node is HTMLElement {
	return node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset?.skill !== undefined;
}

function nodeTextLength(node: Node): number {
	if (isSkillChip(node)) return SKILL_INPUT_PREFIX.length + (node.dataset.skill?.length ?? 0) + 1;
	return node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : 0;
}

function forEachFlow(root: HTMLElement, visit: (node: Node) => boolean | undefined): void {
	const walk = (node: Node): boolean => {
		for (const child of Array.from(node.childNodes)) {
			if (isSkillChip(child) || child.nodeType === Node.TEXT_NODE || child.nodeName === "BR") {
				if (visit(child) === true) return true;
			} else if (child.nodeType === Node.ELEMENT_NODE && walk(child)) {
				return true;
			}
		}
		return false;
	};
	walk(root);
}

/** 编辑区 DOM → 草稿文本：chip 还原为 `/name ` 标记，br 还原为换行。 */
export function serializeEditable(root: HTMLElement): string {
	let out = "";
	const walk = (node: Node) => {
		for (const child of Array.from(node.childNodes)) {
			if (isSkillChip(child)) out += `${SKILL_INPUT_PREFIX}${child.dataset.skill} `;
			else if (child.nodeName === "BR") out += "\n";
			else if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? "";
			else walk(child);
		}
	};
	walk(root);
	return /^\n*$/.test(out) ? "" : out;
}

/** 草稿文本 → 编辑区 DOM：已知技能标记渲染成 chip 节点，其余为文本节点。 */
export function renderValueInto(root: HTMLElement, value: string, names: readonly string[]): void {
	root.textContent = "";
	let cursor = 0;
	for (const marker of skillInputMarkerRanges(value, names)) {
		if (marker.start > cursor) root.append(document.createTextNode(value.slice(cursor, marker.start)));
		root.append(makeChipNode(value.slice(marker.start + SKILL_INPUT_PREFIX.length, marker.end)));
		cursor = marker.end + (value[marker.end] === " " ? 1 : 0);
	}
	if (cursor < value.length) root.append(document.createTextNode(value.slice(cursor)));
}

function textOffsetAt(root: HTMLElement, container: Node, offsetInContainer: number): number {
	let total = 0;
	let found: number | null = null;
	forEachFlow(root, (node) => {
		if (node === container) {
			found = total + offsetInContainer;
			return true;
		}
		total += nodeTextLength(node);
		return false;
	});
	if (found !== null) return found;
	if (container === root) {
		let index = 0;
		let acc = 0;
		let boundary: number | null = null;
		forEachFlow(root, (node) => {
			if (index >= offsetInContainer) {
				boundary = acc;
				return true;
			}
			acc += nodeTextLength(node);
			index++;
			return false;
		});
		return boundary ?? acc;
	}
	return total;
}

/** 当前选区在 value 文本中的 [start, end]（未聚焦时 0,0）。 */
export function selectionOffsets(root: HTMLElement): { start: number; end: number } {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return { start: 0, end: 0 };
	const range = selection.getRangeAt(0);
	if (!root.contains(range.startContainer)) return { start: 0, end: 0 };
	const start = textOffsetAt(root, range.startContainer, range.startOffset);
	const end = textOffsetAt(root, range.endContainer, range.endOffset);
	return { start: Math.min(start, end), end: Math.max(start, end) };
}

function setCaretAtTextOffset(root: HTMLElement, offset: number): void {
	const selection = window.getSelection();
	if (!selection) return;
	const active = document.activeElement;
	if (active !== root && !(active && root.contains(active))) return;
	const range = document.createRange();
	let total = 0;
	let done = false;
	forEachFlow(root, (node) => {
		const len = nodeTextLength(node);
		if (node.nodeType === Node.TEXT_NODE && total + len >= offset) {
			range.setStart(node, offset - total);
			done = true;
			return true;
		}
		if (isSkillChip(node) && total === offset) {
			range.setStart(node, 0);
			done = true;
			return true;
		}
		total += len;
		return false;
	});
	if (!done) range.setStart(root, root.childNodes.length);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

/** 技能标记整体删除（ADR-0016）。 */
export function atomicBackspace(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	markers: readonly SkillInputMarker[],
): BackspaceReplacement | null {
	const start = Math.min(selectionStart, selectionEnd);
	const end = Math.max(selectionStart, selectionEnd);
	for (const marker of markers) {
		const wholeEnd = marker.end + (value[marker.end] === " " ? 1 : 0);
		const intersectsSelection = start !== end && start < wholeEnd && end > marker.start;
		const caretInside = start === end && start > marker.start && start <= marker.end;
		if (caretInside || intersectsSelection)
			return { value: value.slice(0, marker.start) + value.slice(wholeEnd), caret: marker.start };
	}
	return null;
}

function submitKeyDown(event: KeyboardEvent, submitType: SenderSubmitType): boolean {
	if (event.key !== "Enter" || submitType === false) return false;
	const shouldSubmit = submitType === "enter" ? !event.shiftKey : event.shiftKey;
	event.preventDefault();
	if (!shouldSubmit) document.execCommand("insertLineBreak");
	return true;
}

function canSubmit(state: {
	disabled: boolean;
	readOnly: boolean;
	loading: boolean;
	submitDisabled: boolean;
	value: string;
}): boolean {
	return !state.disabled && !state.readOnly && !state.loading && !state.submitDisabled && state.value.trim().length > 0;
}

function rowRange(autoSize: boolean | { minRows?: number; maxRows?: number } | undefined): [number, number] {
	if (autoSize === false) return [1, 1];
	if (autoSize === true || autoSize === undefined) return [1, 6];
	return [autoSize.minRows ?? 1, autoSize.maxRows ?? 6];
}

/** 输入框：contenteditable 是编辑态源，value 是其序列化投影（与 React 版一致）。 */
export const Sender = defineComponent({
	name: "Sender",
	props: {
		variant: { type: String as () => "default" | "workspace", default: "default" },
		value: { type: String, default: undefined },
		defaultValue: { type: String, default: "" },
		loading: { type: Boolean, default: false },
		submitDisabled: { type: Boolean, default: false },
		disabled: { type: Boolean, default: false },
		readOnly: { type: Boolean, default: false },
		placeholder: { type: String, default: undefined },
		skills: { type: Array as () => SenderSkill[], default: undefined },
		submitType: { type: [String, Boolean] as PropType<SenderSubmitType>, default: "enter" },
		autoSize: {
			type: [Boolean, Object] as PropType<boolean | { minRows?: number; maxRows?: number }>,
			default: true,
		},
		inputProps: { type: Object as () => Record<string, unknown>, default: undefined },
		className: { type: String, default: undefined },
		classNames: { type: Object as () => Partial<Record<SenderSemantic, string>>, default: () => ({}) },
		suffix: { type: Boolean, default: true },
		strings: { type: Object as () => Partial<SenderStrings>, default: undefined },
	},
	emits: ["update:value", "change", "submit", "cancel", "selection-change", "paste-file"],
	setup(props, { slots, emit, expose }) {
		const strings = computed(() => resolveStrings(senderStrings, useKitLocale(), props.strings));
		const innerValue = ref(props.defaultValue);
		const currentValue = computed(() => props.value ?? innerValue.value);
		const rootRef = ref<HTMLFormElement | null>(null);
		const inputRef = ref<HTMLDivElement | null>(null);
		const pendingCaret = ref<number | null>(null);
		const skillNames = computed(() => props.skills?.map((skill) => skill.name) ?? EMPTY_SKILL_NAMES);
		const editable = computed(() => !props.disabled && !props.readOnly);
		const placeholder = computed(
			() =>
				props.placeholder ??
				(props.submitType === "enter"
					? strings.value.placeholderEnter
					: props.submitType === "shiftEnter"
						? strings.value.placeholderShiftEnter
						: strings.value.placeholderPlain),
		);

		const update = (next: string) => {
			if (props.value === undefined) innerValue.value = next;
			emit("update:value", next);
			emit("change", next);
		};
		const emitSelection = (caret: number) => emit("selection-change", { start: caret, end: caret });
		const commit = (next: string, caret: number | null = null) => {
			pendingCaret.value = caret;
			update(next);
		};

		const syncDom = () => {
			const element = inputRef.value;
			if (!element) return;
			const stale =
				serializeEditable(element) !== currentValue.value || (currentValue.value === "" && element.firstChild !== null);
			if (!stale) {
				pendingCaret.value = null;
				return;
			}
			renderValueInto(element, currentValue.value, skillNames.value);
			const caret = pendingCaret.value ?? (currentValue.value === "" ? 0 : null);
			pendingCaret.value = null;
			if (caret !== null) {
				setCaretAtTextOffset(element, caret);
				emitSelection(caret);
			}
		};
		onMounted(syncDom);
		watch([currentValue, skillNames], syncDom, { flush: "post" });

		const submit = () => {
			if (!canSubmit({ ...props, value: currentValue.value })) return;
			const skills = skillInputTokens(currentValue.value, skillNames.value);
			emit("submit", currentValue.value, skills.length ? skills : undefined);
		};
		const reportSelection = () => {
			if (inputRef.value) emit("selection-change", selectionOffsets(inputRef.value));
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			// 输入法合成中的回车用于确认候选词；Safari 合成结束后会补发 keyCode 229。
			if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
			if (event.key === "Backspace" && editable.value) {
				const element = inputRef.value;
				if (element) {
					const { start, end } = selectionOffsets(element);
					const atomic = atomicBackspace(
						currentValue.value,
						start,
						end,
						skillInputMarkerRanges(currentValue.value, skillNames.value),
					);
					if (atomic) {
						event.preventDefault();
						commit(atomic.value, atomic.caret);
						return;
					}
				}
			}
			if (submitKeyDown(event, props.submitType)) submit();
		};

		const handleInput = () => {
			const element = inputRef.value;
			if (!element) return;
			update(serializeEditable(element));
			reportSelection();
		};

		const handlePaste = (event: ClipboardEvent) => {
			if (!editable.value) return;
			const files = Array.from(event.clipboardData?.files ?? []);
			if (files.length > 0) {
				event.preventDefault();
				emit("paste-file", files);
				return;
			}
			const text = event.clipboardData?.getData("text/plain");
			if (text) {
				event.preventDefault();
				document.execCommand("insertText", false, text);
			}
		};

		const insert = (text: string) => {
			const element = inputRef.value;
			if (!element) return update(currentValue.value + text);
			const { start, end } = selectionOffsets(element);
			update(currentValue.value.slice(0, start) + text + currentValue.value.slice(end));
		};
		const replaceRange = (start: number, end: number, text: string) => {
			commit(currentValue.value.slice(0, start) + text + currentValue.value.slice(end), start + text.length);
		};

		expose({
			get nativeElement() {
				return rootRef.value;
			},
			get inputElement() {
				return inputRef.value;
			},
			focus: () => inputRef.value?.focus(),
			blur: () => inputRef.value?.blur(),
			clear: () => update(""),
			insert,
			replaceRange,
		});

		const state: SenderState = reactive({
			get variant() {
				return props.variant;
			},
			get value() {
				return currentValue.value;
			},
			get disabled() {
				return !editable.value;
			},
			get loading() {
				return props.loading;
			},
			get submitDisabled() {
				return props.submitDisabled;
			},
			clear: () => update(""),
			cancel: () => emit("cancel"),
			get strings() {
				return strings.value;
			},
		});
		provide(SenderKey, state);

		let rowObserver: ResizeObserver | null = null;
		watch(
			() => [props.autoSize, inputRef.value] as const,
			async () => {
				rowObserver?.disconnect();
				rowObserver = null;
				const element = inputRef.value;
				if (!element) return;
				await nextTick();
				const [minRows, maxRows] = rowRange(props.autoSize);
				const resize = () => {
					if (element.clientWidth === 0) return;
					const style = getComputedStyle(element);
					const line = Number.parseFloat(style.lineHeight);
					if (!Number.isFinite(line) || line <= 0) return;
					const pad = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
					element.style.minHeight = `${minRows * line + pad}px`;
					element.style.maxHeight = Number.isFinite(maxRows) ? `${maxRows * line + pad}px` : "";
				};
				resize();
				if (typeof ResizeObserver === "undefined") return;
				rowObserver = new ResizeObserver(resize);
				rowObserver.observe(element);
			},
			{ immediate: true },
		);
		onScopeDispose(() => rowObserver?.disconnect());

		const renderInput = () =>
			h("div", {
				ref: inputRef,
				contenteditable: editable.value ? "true" : "false",
				role: "textbox",
				"aria-multiline": "true",
				"aria-label": strings.value.inputLabel,
				"aria-disabled": editable.value ? undefined : "true",
				"data-placeholder": placeholder.value,
				"data-empty": currentValue.value ? undefined : "true",
				spellcheck: false,
				...props.inputProps,
				onInput: handleInput,
				onKeydown: handleKeyDown,
				onKeyup: reportSelection,
				onSelect: reportSelection,
				onMouseup: reportSelection,
				onFocus: reportSelection,
				onPaste: handlePaste,
				class: cx(
					"w-full overflow-y-auto whitespace-pre-wrap break-words p-2 text-[length:var(--kit-text-heading)] leading-[var(--kit-leading-body)] text-[var(--kit-fg)] caret-[var(--kit-fg)] outline-none disabled:cursor-not-allowed md:text-[length:var(--kit-text-body)]",
					"data-[empty=true]:before:pointer-events-none data-[empty=true]:before:content-[attr(data-placeholder)] data-[empty=true]:before:text-[var(--kit-fg-muted)]",
					props.classNames.input,
				),
			});

		const renderSuffix = () =>
			props.suffix
				? h("div", { class: cx("flex shrink-0 items-center gap-2", props.classNames.suffix) }, [
						slots.suffix?.({ components: COMPONENTS }) ?? (props.loading ? [h(LoadingButton)] : [h(SendButton)]),
					])
				: null;

		const renderLayout = (editor: VNode) =>
			props.variant === "workspace"
				? [
						h("div", { class: "flex min-w-0 px-3 pt-3" }, [editor]),
						h("div", { class: "flex min-w-0 items-center justify-between gap-3 px-3 pb-3 pt-2" }, [
							h("div", { class: cx("flex min-w-0 flex-1 flex-wrap items-center gap-2", props.classNames.prefix) }, [
								slots.prefix?.(),
							]),
							renderSuffix(),
						]),
					]
				: [
						h("div", { class: "flex min-w-0 items-end gap-2 p-2" }, [
							slots.prefix
								? h("div", { class: cx("flex h-10 shrink-0 items-center", props.classNames.prefix) }, [slots.prefix()])
								: null,
							editor,
							renderSuffix(),
						]),
					];

		return () => {
			const rootClass = cx(
				"relative flex min-w-0 flex-col border border-[var(--kit-border)] shadow-[var(--kit-shadow)] transition-[border-color,box-shadow] focus-within:border-[var(--kit-focus)] focus-within:ring-2 focus-within:ring-[var(--kit-focus)]/15",
				props.variant === "workspace" ? "rounded-[var(--kit-radius-composer)]" : "rounded-[var(--kit-radius)]",
				props.disabled ? "bg-[var(--kit-bg-subtle)]" : "bg-[var(--kit-surface)]",
				props.className,
				props.classNames.root,
			);
			const editor = h("div", { class: "relative min-w-0 flex-1" }, [renderInput()]);
			return h(
				"form",
				{
					ref: rootRef,
					class: rootClass,
					onSubmit: (event: Event) => {
						event.preventDefault();
						submit();
					},
				},
				[
					slots.header?.(),
					...renderLayout(editor),
					slots.footer
						? h("div", { class: cx("border-t border-[var(--kit-border)] px-3 py-2", props.classNames.footer) }, [
								slots.footer({ components: COMPONENTS }),
							])
						: null,
				],
			);
		};
	},
});

export const SenderHeader = defineComponent({
	name: "SenderHeader",
	props: {
		title: { type: String, default: undefined },
		open: { type: Boolean, default: false },
		closable: { type: Boolean, default: true },
		className: { type: String, default: undefined },
	},
	emits: ["update:open"],
	setup(props, { slots, emit }) {
		const strings = computed(() => resolveStrings(senderStrings, useKitLocale()));
		return () => {
			if (!props.open) return null;
			return h("div", { class: cx("min-w-0 border-b border-[var(--kit-border-subtle)]", props.className) }, [
				props.title || props.closable
					? h(
							"div",
							{
								class:
									"flex items-center justify-between gap-2 px-3 pt-2.5 text-[length:var(--kit-text-label)] font-medium text-[var(--kit-fg)]",
							},
							[
								h("span", null, props.title),
								props.closable
									? h(
											"button",
											{
												type: "button",
												"aria-label": strings.value.collapseLabel,
												onClick: () => emit("update:open", false),
												class:
													"rounded px-1 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)] hover:text-[var(--kit-fg)]",
											},
											"✕",
										)
									: null,
							],
						)
					: null,
				h(
					"div",
					{
						class:
							"max-h-[min(var(--kit-composer-pane-max-height),calc(var(--kit-viewport-height,100dvh)/5))] overflow-y-auto overscroll-contain p-3",
					},
					[slots.default?.()],
				),
			]);
		};
	},
});
