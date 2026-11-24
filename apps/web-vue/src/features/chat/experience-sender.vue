<script setup lang="ts">
import { skillInputTokens } from "@openagentkit/sdk/protocol";
import {
	type AttachmentItem,
	Attachments,
	Menu,
	MenuContent,
	MenuItem,
	MenuTrigger,
	Sender,
	SenderHeader,
	type SenderSelection,
	SkillGlyph,
	Suggestion,
} from "@openagentpack/kit-chat-ui-vue";
import { computed, h, ref, watch } from "vue";
import { useTranslation } from "../../i18n/index.ts";

const props = defineProps<{
	items: AttachmentItem[];
	skills?: { name: string; description?: string }[];
	turnRunning: boolean;
	sending: boolean;
	canSend: boolean;
	disabled: boolean;
	processing: boolean;
	/** 会话/新会话作用域变化时清空草稿；不重挂组件，避免打断技能选择。 */
	resetKey: number;
	onDrop: (files: File[]) => void | Promise<void>;
	onPickFile?: (accept?: string) => void;
	onRemove: (fileId: string) => void;
	onSend: (text: string, skills?: string[]) => Promise<boolean>;
	onStop: () => void;
}>();
const { t } = useTranslation("chat");

const value = ref("");
watch(
	() => props.resetKey,
	() => {
		value.value = "";
		selection.value = { start: 0, end: 0 };
	},
);
const selection = ref<SenderSelection>({ start: 0, end: 0 });
const senderRef = ref<{
	replaceRange: (start: number, end: number, text: string) => void;
} | null>(null);
const skillNames = computed(() => props.skills?.map((skill) => skill.name) ?? []);
const skillItems = computed(() =>
	(props.skills ?? []).map((skill) => ({
		label: skill.name,
		value: skill.name,
		...(skill.description ? { description: skill.description } : {}),
		icon: h(SkillGlyph, { className: "size-4 shrink-0 text-[var(--kit-accent)]" }),
	})),
);

function pickFile(accept?: string) {
	if (props.disabled || props.items.some((item) => item.status === "uploading")) return;
	props.onPickFile?.(accept);
}

function chooseSkill(item: { value: string }, context?: { start: number; end: number }) {
	if (!context) return;
	const end = value.value[context.end] === " " ? context.end + 1 : context.end;
	senderRef.value?.replaceRange(context.start, end, `/${item.value} `);
}

async function submit(text: string, derived?: string[]) {
	const sent = await props.onSend(text.trim(), derived);
	if (sent && value.value === text) value.value = "";
}
</script>

<template>
	<div>
		<Suggestion
			block
			:items="skillItems"
			:value="value"
			:caret="selection.end"
			trigger="/"
			:filter="(item, query) => item.value.toLowerCase().startsWith(query.toLowerCase()) && !skillInputTokens(value, skillNames).includes(item.value)"
			:on-select="(_value, item, context) => chooseSkill(item, context)"
		>
			<template #default="{ onKeyDown, inputProps }">
				<Sender
					ref="senderRef"
					variant="workspace"
					:auto-size="{ minRows: 2, maxRows: 6 }"
					:value="value"
					:skills="props.skills"
					:loading="turnRunning"
					:submit-disabled="!canSend || sending || processing"
					:disabled="disabled"
					:input-props="inputProps"
					:on-key-down="onKeyDown"
					@update:value="(next) => (value = next)"
					@selection-change="(next) => (selection = next)"
					@submit="submit"
					@cancel="onStop"
					@paste-file="onDrop"
				>
					<template #prefix>
						<Menu>
							<MenuTrigger as-child>
								<button
									type="button"
									:aria-label="t('sender.addAttachment')"
									:disabled="disabled || items.some((item) => item.status === 'uploading')"
									class="inline-flex min-h-10 items-center gap-2 rounded-[var(--kit-radius-sm)] px-3 py-2 text-[length:var(--kit-text-label)] text-[var(--kit-fg-muted)] transition-colors enabled:hover:bg-[var(--kit-bg-subtle)] enabled:hover:text-[var(--kit-fg)] disabled:cursor-not-allowed disabled:opacity-50"
								>
									<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-4">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l8-8m-5 11 8-8"
										/>
									</svg>
									{{ t("sender.attachments") }}
								</button>
							</MenuTrigger>
							<MenuContent>
								<MenuItem @select="pickFile('image/*')">{{ t("sender.uploadImage") }}</MenuItem>
								<MenuItem @select="pickFile('video/*')">{{ t("sender.uploadVideo") }}</MenuItem>
								<MenuItem @select="pickFile()">{{ t("sender.uploadFile") }}</MenuItem>
							</MenuContent>
						</Menu>
					</template>
					<template #suffix="{ components }">
						<span v-if="sending" class="relative grid size-10 place-items-center rounded-full bg-[var(--kit-accent)] text-[var(--kit-accent-fg)] opacity-80">
							<span class="sr-only">{{ t("sender.sendingSr") }}</span>
							<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" class="size-5 motion-safe:animate-spin">
								<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" class="opacity-25" />
								<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
							</svg>
						</span>
						<component :is="turnRunning ? components.LoadingButton : components.SendButton" v-else />
					</template>
					<template #header>
						<SenderHeader :open="items.length > 0" :title="t('sender.attachments')" :closable="false">
							<div class="flex flex-col gap-2">
								<Attachments
									:items="items"
									:disabled="disabled"
									overflow="scrollX"
									:on-pick="() => pickFile()"
									:on-select-files="onDrop"
									:on-remove="(item) => onRemove(item.uid)"
								/>
								<p v-if="items.length > 0" class="text-[length:var(--kit-text-meta)] text-[var(--kit-fg-muted)]">
									{{ t("sender.attachmentNote") }}
								</p>
							</div>
						</SenderHeader>
					</template>
				</Sender>
			</template>
		</Suggestion>
	</div>
</template>
