<script setup lang="ts">
import {
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogOverlay,
	DialogPortal,
	DialogRoot,
	DialogTitle,
} from "reka-ui";
import { computed, ref } from "vue";
import { useTranslation } from "../../i18n/index.ts";

export interface ApplyCreditsValues {
	requestedCredits: number;
	reason: string;
}

const props = defineProps<{
	onSubmit: (values: ApplyCreditsValues) => Promise<string | null>;
}>();
const emit = defineEmits<{ close: [completed: boolean] }>();
const { t } = useTranslation("usage");

const credits = ref("");
const reason = ref("");
const submitting = ref(false);
const formError = ref<string | null>(null);
const completed = ref(false);
let returnFocus: HTMLElement | null = null;

const requested = computed(() => Number.parseInt(credits.value, 10));
const valid = computed(() => Number.isInteger(requested.value) && requested.value >= 1 && requested.value <= 1_000_000);

function close(asCompleted = false) {
	if (submitting.value) return;
	completed.value = asCompleted;
	emit("close", asCompleted);
}

function onOpenChange(open: boolean) {
	if (!open) close(false);
}

async function submitForm() {
	if (!valid.value || submitting.value) return;
	submitting.value = true;
	formError.value = null;
	const failure = await props.onSubmit({ requestedCredits: requested.value, reason: reason.value.trim() });
	submitting.value = false;
	if (failure) {
		formError.value = failure;
		return;
	}
	close(true);
}

function onOpenAutoFocus() {
	returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function onCloseAutoFocus(event: Event) {
	event.preventDefault();
	// 申请成功后入口会禁用，焦点回到同一额度卡；取消则回到申请按钮。
	const target =
		completed.value || returnFocus?.matches(":disabled")
			? returnFocus?.closest<HTMLElement>('[tabindex="-1"]')
			: returnFocus;
	target?.focus({ preventScroll: true });
}
</script>

<template>
	<DialogRoot :open="true" @update:open="onOpenChange">
		<DialogPortal to="body">
			<DialogOverlay class="fixed inset-x-0 top-0 z-50 grid h-[var(--kit-viewport-height,100dvh)] place-items-center bg-[var(--kit-overlay)] p-4">
				<DialogContent
					as-child
					@escape-key-down="(event: Event) => submitting && event.preventDefault()"
					@interact-outside="(event: Event) => submitting && event.preventDefault()"
					@open-auto-focus="onOpenAutoFocus"
					@close-auto-focus="onCloseAutoFocus"
				>
					<form
						data-testid="usage-apply-dialog"
						class="relative max-h-[calc(var(--kit-viewport-height,100dvh)-var(--kit-space-4)*2)] w-full min-w-0 max-w-md overflow-y-auto overscroll-contain rounded-[var(--kit-radius)] border border-[var(--kit-border)] bg-[var(--kit-surface)] p-5 shadow-[var(--kit-shadow)] [overflow-wrap:anywhere] md:p-6"
						@submit.prevent="submitForm"
					>
						<div class="flex items-center justify-between gap-3">
							<DialogTitle class="text-[length:var(--kit-text-heading)] font-semibold">
								{{ t("dialog.title") }}
							</DialogTitle>
							<DialogClose as-child>
								<button
									type="button"
									:aria-label="t('dialog.close')"
									:disabled="submitting"
									class="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--kit-radius-sm)] text-[var(--kit-fg-muted)] transition-colors hover:bg-[var(--kit-bg-subtle)] hover:text-[var(--kit-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50"
								>
									<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4">
										<path stroke-linecap="round" d="m6 6 12 12M6 18 18 6" />
									</svg>
								</button>
							</DialogClose>
						</div>
						<DialogDescription class="mt-2 text-[length:var(--kit-text-caption)] leading-relaxed text-[var(--kit-fg-muted)]">
							{{ t("dialog.note") }}
						</DialogDescription>
						<label class="mt-4 block">
							<span class="mb-1 block text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
								{{ t("dialog.creditsLabel") }}
							</span>
							<input
								v-model="credits"
								type="number"
								min="1"
								step="1"
								:placeholder="t('dialog.creditsPlaceholder')"
								:aria-label="t('dialog.creditsAria')"
								data-testid="usage-apply-credits"
								class="min-h-11 w-full min-w-0 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] px-3 py-2 text-[length:var(--kit-text-heading)] placeholder:text-[var(--kit-fg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] md:text-[length:var(--kit-text-label)]"
							/>
						</label>
						<label class="mt-3 block">
							<span class="mb-1 block text-[length:var(--kit-text-caption)] text-[var(--kit-fg-muted)]">
								{{ t("dialog.reasonLabel") }}
							</span>
							<textarea
								v-model="reason"
								rows="3"
								maxlength="400"
								:placeholder="t('dialog.reasonPlaceholder')"
								:aria-label="t('dialog.reasonAria')"
								data-testid="usage-apply-reason"
								class="w-full min-w-0 resize-none rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] bg-[var(--kit-surface)] px-3 py-2 text-[length:var(--kit-text-heading)] placeholder:text-[var(--kit-fg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] md:text-[length:var(--kit-text-label)]"
							/>
						</label>
						<p
							v-if="formError"
							role="alert"
							data-testid="usage-apply-error"
							class="mt-3 text-[length:var(--kit-text-caption)] text-[var(--kit-danger)]"
						>
							{{ formError }}
						</p>
						<div class="mt-5 flex flex-wrap justify-end gap-2">
							<DialogClose as-child>
								<button
									type="button"
									:disabled="submitting"
									class="min-h-10 rounded-[var(--kit-radius-sm)] border border-[var(--kit-border)] px-4 py-2 text-[length:var(--kit-text-label)] font-medium transition-colors hover:bg-[var(--kit-bg-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50"
								>
									{{ t("dialog.cancel") }}
								</button>
							</DialogClose>
							<button
								type="submit"
								data-testid="usage-apply-submit"
								:disabled="!valid || submitting"
								class="min-h-10 rounded-[var(--kit-radius-sm)] bg-[var(--kit-accent)] px-4 py-2 text-[length:var(--kit-text-label)] font-medium text-[var(--kit-accent-fg)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--kit-focus)] disabled:cursor-not-allowed disabled:opacity-50"
							>
								{{ submitting ? t("dialog.submitting") : t("dialog.submit") }}
							</button>
						</div>
					</form>
				</DialogContent>
			</DialogOverlay>
		</DialogPortal>
	</DialogRoot>
</template>
