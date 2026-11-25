import { computed, defineComponent, h, onMounted, onUnmounted, type PropType, ref } from "vue";
import { format, resolveStrings, useKitLocale } from "../kit-i18n/index.ts";
import attachmentsStrings, { type AttachmentsStrings } from "./strings.ts";

export { type AttachmentsStrings, attachmentsStrings };

export interface AttachmentItem {
	uid: string;
	name: string;
	size?: number;
	type?: string;
	status?: "uploading" | "done" | "error";
	percent?: number;
	thumbUrl?: string;
	description?: string;
}

export interface AttachmentsPlaceholder {
	title?: string;
	description?: string;
}

export const AttachmentFileCard = defineComponent({
	name: "AttachmentFileCard",
	props: {
		item: { type: Object as () => AttachmentItem, required: true },
		onRemove: { type: Function as PropType<(item: AttachmentItem) => void>, default: undefined },
		disabled: { type: Boolean, default: false },
		className: { type: String, default: undefined },
		strings: { type: Object as () => Partial<AttachmentsStrings>, default: undefined },
	},
	setup(props) {
		const strings = computed(() => resolveStrings(attachmentsStrings, useKitLocale(), props.strings));
		const badge = computed(() => {
			const extension = props.item.name.includes(".") ? (props.item.name.split(".").pop()?.toUpperCase() ?? "") : "";
			if (props.item.type?.startsWith("image/") || ["PNG", "JPG", "JPEG", "GIF", "WEBP", "SVG"].includes(extension))
				return "IMG";
			if (props.item.type?.startsWith("video/")) return "VID";
			if (props.item.type === "application/pdf" || extension === "PDF") return "PDF";
			if (["XLS", "XLSX", "CSV"].includes(extension)) return "XLS";
			return extension.slice(0, 4) || "FILE";
		});
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 卡片状态与说明按展示顺序平铺，拆分反而割裂阅读顺序
		return () => {
			const uploading = props.item.status === "uploading";
			const failed = props.item.status === "error";
			const removable = Boolean(props.onRemove) && !uploading && !props.disabled;
			return h(
				"div",
				{
					class: `relative w-56 max-w-full shrink-0 ${failed ? "[&>div]:border-[var(--kit-danger)]" : ""} ${props.className ?? ""}`,
				},
				[
					h(
						"div",
						{
							class: `flex w-56 max-w-full items-center gap-2.5 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-bg-subtle)] p-2 ${props.disabled ? "opacity-50" : ""} ${removable ? "pr-8" : ""}`,
						},
						[
							props.item.thumbUrl
								? h("img", { src: props.item.thumbUrl, alt: "", class: "h-9 w-9 shrink-0 rounded object-cover" })
								: h(
										"span",
										{
											"aria-hidden": "true",
											class:
												"grid h-9 w-9 shrink-0 place-items-center rounded bg-[var(--kit-surface)] text-[9px] font-semibold text-[var(--kit-fg-muted)]",
										},
										badge.value,
									),
							h("div", { class: "flex min-w-0 flex-1 flex-col" }, [
								h(
									"span",
									{
										title: props.item.name,
										class: "min-w-0 truncate text-[length:var(--kit-text-label)] text-[var(--kit-fg)]",
									},
									props.item.name,
								),
								uploading
									? h(
											"span",
											{ class: "flex flex-col text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
											[
												props.item.percent === undefined
													? strings.value.uploading
													: format(strings.value.uploadingPercent, { percent: Math.round(props.item.percent) }),
												h("progress", {
													"aria-label": format(strings.value.progressAria, { name: props.item.name }),
													max: 100,
													value: props.item.percent,
													class:
														"mt-1 h-1 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-[var(--kit-accent)] [&::-webkit-progress-bar]:bg-[var(--kit-border)] [&::-webkit-progress-value]:bg-[var(--kit-accent)]",
												}),
											],
										)
									: failed
										? h(
												"span",
												{ class: "truncate text-[length:var(--kit-text-caption)] text-[var(--kit-danger)]" },
												props.item.description || strings.value.uploadFailed,
											)
										: props.item.description
											? h(
													"span",
													{ class: "truncate text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
													props.item.description,
												)
											: null,
							]),
						],
					),
					removable
						? h(
								"button",
								{
									type: "button",
									"aria-label": format(strings.value.removeAria, { name: props.item.name }),
									onClick: () => props.onRemove?.(props.item),
									class:
										"absolute top-1 right-1 grid size-7 place-items-center rounded-[var(--kit-radius-sm)] text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)] hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)]",
								},
								"✕",
							)
						: null,
				],
			);
		};
	},
});

/** 附件选择与展示：上传、扫描和发送提交由调用方持有。 */
export const Attachments = defineComponent({
	name: "Attachments",
	props: {
		items: { type: Array as () => AttachmentItem[], default: () => [] },
		onSelectFiles: { type: Function as PropType<(files: File[]) => void>, default: undefined },
		onPick: { type: Function as PropType<() => void>, default: undefined },
		onRemove: { type: Function as PropType<(item: AttachmentItem) => void>, default: undefined },
		accept: { type: String, default: undefined },
		multiple: { type: Boolean, default: true },
		maxCount: { type: Number, default: undefined },
		disabled: { type: Boolean, default: false },
		overflow: { type: String as () => "wrap" | "scrollX" | "scrollY", default: "wrap" },
		placeholder: {
			type: [Object, Function] as PropType<
				AttachmentsPlaceholder | ((type: "inline" | "drop") => AttachmentsPlaceholder)
			>,
			default: undefined,
		},
		className: { type: String, default: undefined },
		strings: { type: Object as () => Partial<AttachmentsStrings>, default: undefined },
	},
	setup(props, { expose }) {
		const strings = computed(() => resolveStrings(attachmentsStrings, useKitLocale(), props.strings));
		const root = ref<HTMLDivElement | null>(null);
		const input = ref<HTMLInputElement | null>(null);
		const dragging = ref(false);
		let depth = 0;
		const remaining = computed(() =>
			props.maxCount === undefined ? 99 : Math.max(0, props.maxCount - props.items.length),
		);
		const accepting = computed(
			() => !props.disabled && remaining.value > 0 && Boolean(props.onPick || props.onSelectFiles),
		);
		const placeholder = (type: "inline" | "drop"): AttachmentsPlaceholder => {
			const custom = typeof props.placeholder === "function" ? props.placeholder(type) : props.placeholder;
			if (custom) return custom;
			return type === "inline"
				? { title: strings.value.inlineTitle, description: strings.value.inlineDescription }
				: { title: strings.value.dropTitle };
		};
		const select = () => {
			if (!accepting.value) return;
			if (props.onPick) props.onPick();
			else input.value?.click();
		};
		const receive = (files: File[]) => {
			if (!accepting.value) return;
			const picked = files.slice(0, props.multiple ? remaining.value : Math.min(1, remaining.value));
			if (picked.length > 0) props.onSelectFiles?.(picked);
		};
		const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
		const onDragEnter = (event: DragEvent) => {
			if (!hasFiles(event) || !accepting.value) return;
			depth += 1;
			dragging.value = true;
		};
		const onDragOver = (event: DragEvent) => {
			if (hasFiles(event) && accepting.value) event.preventDefault();
		};
		const onDragLeave = () => {
			depth = Math.max(0, depth - 1);
			if (depth === 0) dragging.value = false;
		};
		const onDrop = (event: DragEvent) => {
			if (!hasFiles(event) || !accepting.value) return;
			event.preventDefault();
			depth = 0;
			dragging.value = false;
			receive(Array.from(event.dataTransfer?.files ?? []));
		};
		onMounted(() => {
			const element = root.value;
			if (!element) return;
			element.addEventListener("dragenter", onDragEnter);
			element.addEventListener("dragover", onDragOver);
			element.addEventListener("dragleave", onDragLeave);
			element.addEventListener("drop", onDrop);
		});
		onUnmounted(() => {
			const element = root.value;
			if (!element) return;
			element.removeEventListener("dragenter", onDragEnter);
			element.removeEventListener("dragover", onDragOver);
			element.removeEventListener("dragleave", onDragLeave);
			element.removeEventListener("drop", onDrop);
		});
		expose({ select, nativeElement: root });

		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 空态、列表、拖放覆盖层按状态平铺，拆分反而割裂阅读顺序
		return () => {
			const inline = placeholder("inline");
			return h("div", { ref: root, class: `relative min-w-0 ${props.className ?? ""}` }, [
				props.onPick
					? null
					: h("input", {
							ref: input,
							type: "file",
							hidden: true,
							tabIndex: -1,
							accept: props.accept,
							multiple: props.multiple,
							onChange: (event: Event) => {
								const target = event.target as HTMLInputElement;
								const files = Array.from(target.files ?? []);
								target.value = "";
								receive(files);
							},
						}),
				props.items.length === 0
					? h(
							"button",
							{
								type: "button",
								disabled: !accepting.value,
								onClick: select,
								class:
									"flex w-full flex-col items-center gap-1 rounded-[var(--kit-radius-sm)] border border-dashed border-[var(--kit-border)] bg-[var(--kit-bg-subtle)] px-4 py-5 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] enabled:hover:border-[var(--kit-accent)] disabled:cursor-not-allowed disabled:opacity-50",
							},
							[
								inline.title
									? h(
											"span",
											{ class: "text-[length:var(--kit-text-label)] font-medium text-[var(--kit-fg)]" },
											inline.title,
										)
									: null,
								inline.description
									? h(
											"span",
											{ class: "text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" },
											inline.description,
										)
									: null,
							],
						)
					: h(
							"div",
							{
								class: `flex min-w-0 gap-2 ${props.overflow === "scrollX" ? "overflow-x-auto overscroll-x-contain p-1" : "flex-wrap"} ${props.overflow === "scrollY" ? "max-h-40 overflow-y-auto" : ""}`,
							},
							[
								...props.items.map((item) =>
									h(AttachmentFileCard, { key: item.uid, item, onRemove: props.onRemove, disabled: props.disabled }),
								),
								accepting.value
									? h(
											"button",
											{
												type: "button",
												"aria-label": strings.value.addFile,
												onClick: select,
												class:
													"grid w-14 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] border border-dashed border-[var(--kit-border)] text-[length:var(--kit-text-title)] text-[var(--kit-fg-muted)] hover:border-[var(--kit-accent)] hover:text-[var(--kit-accent)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--kit-focus)]",
											},
											"＋",
										)
									: null,
							],
						),
				dragging.value
					? h(
							"div",
							{
								class:
									"pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-[inherit] border-2 border-dashed border-[var(--kit-accent)] bg-[var(--kit-surface)]/90",
							},
							[h("span", { class: "text-[length:var(--kit-text-label)] font-medium" }, placeholder("drop").title)],
						)
					: null,
			]);
		};
	},
});
