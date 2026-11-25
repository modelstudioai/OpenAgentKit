import { defineComponent, h, type PropType } from "vue";

const DOT = "size-2 shrink-0 rounded-full";

function dotTone(state: "idle" | "done" | "failed"): string {
	return state === "done"
		? "bg-[var(--kit-success)]"
		: state === "failed"
			? "bg-[var(--kit-danger)]"
			: "bg-[var(--kit-border)]";
}

/** 运行指示环：仅允许动态效果时旋转。 */
export const ProcessSpinner = defineComponent({
	name: "ProcessSpinner",
	props: { className: { type: String, default: "" } },
	setup(props) {
		return () =>
			h(
				"svg",
				{
					viewBox: "0 0 24 24",
					fill: "none",
					"aria-hidden": "true",
					class: `motion-safe:animate-spin ${props.className}`,
				},
				[
					h("circle", { cx: "12", cy: "12", r: "9", stroke: "currentColor", "stroke-width": "3", opacity: "0.2" }),
					h("path", {
						d: "M21 12a9 9 0 0 0-9-9",
						stroke: "currentColor",
						"stroke-width": "3",
						"stroke-linecap": "round",
					}),
				],
			);
	},
});

/** 运行中文案后的动态省略号。 */
export const ProcessDots = defineComponent({
	name: "ProcessDots",
	setup() {
		return () =>
			h(
				"span",
				{ "aria-hidden": "true", class: "inline-flex tracking-[0.1em]" },
				[0, 160, 320].map((delay) =>
					h("span", { key: delay, class: "motion-safe:animate-pulse", style: { animationDelay: `${delay}ms` } }, "."),
				),
			);
	},
});

function StepMarker(state: "idle" | "running" | "done" | "failed", className = "") {
	if (state === "running")
		return h(ProcessSpinner, { className: `size-3.5 shrink-0 text-[var(--kit-accent)] ${className}` });
	if (state === "done" || state === "failed")
		return h(
			"svg",
			{
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				"stroke-width": "2.5",
				"aria-hidden": "true",
				class: `size-3.5 shrink-0 ${state === "done" ? "text-[var(--kit-success)]" : "text-[var(--kit-danger)]"} ${className}`,
			},
			[
				state === "done"
					? h("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "m5 13 4 4L19 7" })
					: h("path", { "stroke-linecap": "round", d: "M6 6l12 12M18 6 6 18" }),
			],
		);
	return h("span", { "aria-hidden": "true", class: `${DOT} ${dotTone(state)} ${className}` });
}

/** 执行过程的时间线步骤行：状态图标 + 动词 + 预览 + 状态，默认收起。 */
export const ProcessStep = defineComponent({
	name: "ProcessStep",
	props: {
		verb: { type: String, default: "" },
		preview: { type: String, default: undefined },
		status: { type: String, default: undefined },
		state: { type: String as PropType<"idle" | "running" | "done" | "failed">, default: "idle" },
		ariaLabel: { type: String, required: true },
		className: { type: String, default: "" },
		contentMaxHeight: { type: String, default: "max-h-80" },
	},
	setup(props, { slots }) {
		return () =>
			h(
				"details",
				{
					"aria-label": props.ariaLabel,
					class: `kit-collapse group/step min-w-0 text-[length:var(--kit-text-label)] animate-[var(--kit-animate-in)] ${props.className}`,
				},
				[
					h(
						"summary",
						{
							class:
								"flex min-w-0 cursor-pointer list-none items-center gap-2.5 rounded-[var(--kit-radius-sm)] px-2 py-1.5 text-[var(--kit-fg-muted)] transition-colors select-none hover:bg-[var(--kit-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] [&::-webkit-details-marker]:hidden",
						},
						[
							StepMarker(props.state),
							h("span", { class: "min-w-0 text-[var(--kit-fg)] [overflow-wrap:anywhere]" }, props.verb),
							props.preview
								? h(
										"span",
										{
											class:
												"flex min-w-0 flex-1 items-baseline gap-1.5 font-mono text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]",
										},
										[
											h("span", { "aria-hidden": "true" }, "·"),
											h("span", { class: "min-w-0 flex-1 truncate" }, props.preview),
										],
									)
								: null,
							props.status
								? h(
										"span",
										{
											class: `inline-flex shrink-0 items-center gap-1 text-[length:var(--kit-text-caption)] ${props.state === "failed" ? "text-[var(--kit-danger)]" : ""} ${props.preview ? "" : "ml-auto"}`,
										},
										[props.status, props.state === "running" ? h(ProcessDots) : null],
									)
								: null,
							h(
								"svg",
								{
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									"stroke-width": "1.5",
									"aria-hidden": "true",
									class: `size-4 shrink-0 transition-transform group-open/step:rotate-90 ${props.preview ? "" : "ml-auto"}`,
								},
								[h("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "m9 6 6 6-6 6" })],
							),
						],
					),
					h(
						"div",
						{
							class: `group-open/step:animate-[var(--kit-animate-expand)] mt-1.5 mb-2 ${props.contentMaxHeight} min-w-0 overflow-y-auto border-l border-[var(--kit-border)] py-1 pr-2 pl-4 ml-8`,
						},
						[slots.default?.()],
					),
				],
			);
	},
});

export const ProcessValue = defineComponent({
	name: "ProcessValue",
	props: { label: { type: String, required: true } },
	setup(props, { slots }) {
		return () =>
			h("section", { class: "min-w-0" }, [
				h("p", { class: "mb-1.5 text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]" }, props.label),
				slots.default?.(),
			]);
	},
});

export const ProcessValueCode = defineComponent({
	name: "ProcessValueCode",
	props: { text: { type: String, required: true } },
	setup(props) {
		return () =>
			h(
				"pre",
				{
					class:
						"font-mono text-[length:var(--kit-text-caption)] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap",
				},
				props.text,
			);
	},
});
