import { computed, type MaybeRefOrGetter, onMounted, onScopeDispose, shallowRef, toValue, watch } from "vue";
import type { AttachmentRef, MessageFileAssociation, ToolApprovalDecision } from "../../protocol/index.ts";
import type { ChatProvider } from "../../providers/contract.ts";
import { createKitChatProvider } from "../../providers/kit/provider.ts";
import { useOptionalKitContext } from "../../providers/kit/vue/context.ts";
import { type ChatController, type ChatSnapshot, createChatController } from "../controller.ts";

/** controller 按 sessionId 懒创建：允许「先建会话再发送」的同一闭包内调用。 */
export interface UseChatOptions {
	sessionId: string | null;
	/** 稳定实例；显式提供时无需 KitProvider，且优先于 Context 的 Client。 */
	provider: ChatProvider;
}

interface ControllerEntry {
	sessionId: string;
	provider: ChatProvider;
	controller: ChatController;
}

const EMPTY_SNAPSHOT = {
	sessionId: null,
	providerStatus: null,
	phase: "idle",
	connection: "disconnected",
	canSend: false,
	approvals: [],
	lastCursor: null,
	turnRunning: false,
	messages: [],
	threads: {},
	multiAgent: {
		selectedThreadId: null,
		threads: [],
		loading: false,
		error: null,
		selectThread: () => undefined,
		refreshThreads: async () => undefined,
		loadThreadEvents: async () => undefined,
	},
	artifacts: [],
	lastEventId: null,
	streamError: null,
} as ChatSnapshot;

/**
 * 单会话对话组合式函数：连接、重连、乐观消息、turn 收敛全部在 controller 内。
 * 与 React 版不同，Vue 没有陈旧闭包，`send` 始终读取调用时的会话接入；
 * 因此这里只拒绝「组件已卸载」的调用。
 */
export function useChat(input: MaybeRefOrGetter<string | null | UseChatOptions>) {
	const context = useOptionalKitContext();
	const options = computed(() => {
		const value = toValue(input);
		return typeof value === "object" && value !== null ? value : null;
	});
	const defaultProvider = computed(() =>
		!options.value?.provider && context?.client ? createKitChatProvider(context.client) : null,
	);
	const sessionId = computed<string | null>(() => {
		const value = toValue(input);
		return typeof value === "object" && value !== null ? value.sessionId : value;
	});
	const provider = computed<ChatProvider>(() => {
		const value = options.value?.provider ?? defaultProvider.value;
		if (!value)
			throw new Error("kit-sdk/chat/hooks-vue: 组件必须位于 <KitProvider> 内，或为 useChat 显式提供 provider");
		return value;
	});

	const snapshot = shallowRef<ChatSnapshot>(EMPTY_SNAPSHOT);
	let entry: ControllerEntry | null = null;
	let unsubscribe: (() => void) | null = null;
	let mounted = false;

	function publish() {
		if (entry) snapshot.value = entry.controller.getSnapshot();
	}

	function detach(next: ControllerEntry | null) {
		const previous = entry;
		entry = next;
		unsubscribe?.();
		unsubscribe = null;
		if (previous && previous !== next) {
			const controller = previous.controller;
			// 延迟释放：与 React 版一致，避免同一 tick 内切换/重挂载误杀。
			queueMicrotask(() => {
				if (entry !== previous) controller.dispose();
			});
		}
		if (next) {
			unsubscribe = next.controller.subscribe(publish);
			publish();
		} else {
			snapshot.value = EMPTY_SNAPSHOT;
		}
	}

	function attach(sid: string | null, prov: ChatProvider) {
		if (!sid) {
			detach(null);
			return;
		}
		if (entry?.sessionId === sid && entry.provider === prov) return;
		const next: ControllerEntry = { sessionId: sid, provider: prov, controller: createChatController(prov, sid) };
		detach(next);
		void next.controller.connect().catch(() => undefined);
	}

	function assertActive() {
		if (!mounted) throw new Error("kit-sdk/chat/hooks-vue: 组件已卸载");
	}

	onMounted(() => {
		mounted = true;
		attach(sessionId.value, provider.value);
	});
	watch([sessionId, provider], ([sid, prov]) => {
		attach(sid, prov);
	});
	onScopeDispose(() => {
		mounted = false;
		detach(null);
	});

	async function send(
		text: string,
		sendOptions?: { sessionId?: string; attachments?: AttachmentRef[]; skills?: string[] },
	) {
		assertActive();
		const sid = sendOptions?.sessionId ?? sessionId.value;
		if (!sid) throw new Error("kit-sdk/chat/hooks-vue: useChat 需要 sessionId");
		const prov = provider.value;
		if (!entry || entry.sessionId !== sid || entry.provider !== prov) {
			const next: ControllerEntry = { sessionId: sid, provider: prov, controller: createChatController(prov, sid) };
			detach(next);
		}
		await entry!.controller.send(text, {
			...(sendOptions?.attachments?.length ? { attachments: sendOptions.attachments } : {}),
			...(sendOptions?.skills?.length ? { skills: sendOptions.skills } : {}),
		});
	}

	async function stop() {
		assertActive();
		await entry?.controller.stop();
	}

	function setMessageFiles(entries: MessageFileAssociation[] | null) {
		entry?.controller.store.setMessageFiles(entries ?? []);
	}

	async function refreshApprovals() {
		assertActive();
		await entry?.controller.refreshApprovals();
	}

	async function submitApproval(decision: ToolApprovalDecision) {
		assertActive();
		if (!entry) throw new Error("未选择会话");
		await entry.controller.submitApproval(decision);
	}

	return {
		snapshot,
		sessionId,
		messages: computed(() => snapshot.value.messages),
		threads: computed(() => snapshot.value.threads),
		multiAgent: computed(() => snapshot.value.multiAgent),
		artifacts: computed(() => snapshot.value.artifacts),
		turnRunning: computed(() => snapshot.value.turnRunning),
		streamError: computed(() => snapshot.value.streamError),
		connected: computed(() => snapshot.value.connection === "connected"),
		phase: computed(() => snapshot.value.phase),
		connection: computed(() => snapshot.value.connection),
		canSend: computed(() => snapshot.value.canSend),
		approvals: computed(() => snapshot.value.approvals),
		send,
		stop,
		setMessageFiles,
		refreshApprovals,
		submitApproval,
	};
}
