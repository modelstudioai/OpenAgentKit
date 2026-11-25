// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { useChat } from "../../src/chat/hooks-vue/use-chat.ts";
import type { SendMessageRequest } from "../../src/protocol/index.ts";
import type { ChatProvider, StreamSessionOptions } from "../../src/providers/contract.ts";

interface StreamRecord {
	sessionId: string;
	aborted: boolean;
}

function createFakeProvider() {
	const sent: Array<{ sessionId: string; text: string }> = [];
	const streams: StreamRecord[] = [];
	const provider: ChatProvider = {
		stream: (sessionId: string, options?: StreamSessionOptions) =>
			new Promise<void>((resolve) => {
				const record: StreamRecord = { sessionId, aborted: false };
				streams.push(record);
				queueMicrotask(() => options?.onReady?.({ sessionId, replayed: 0 }));
				options?.signal?.addEventListener(
					"abort",
					() => {
						record.aborted = true;
						resolve();
					},
					{ once: true },
				);
			}),
		sendMessage: async (sessionId: string, body: SendMessageRequest) => {
			sent.push({ sessionId, text: body.text });
			return { session_id: sessionId, accepted: true, event_ids: [] };
		},
		interrupt: async () => ({ interrupted: true }),
		toolApprovals: (async () => {
			throw new Error("unused");
		}) as ChatProvider["toolApprovals"],
		submitToolApproval: (async () => {
			throw new Error("unused");
		}) as ChatProvider["submitToolApproval"],
	};
	return { provider, sent, streams };
}

function mountHarness(provider: ChatProvider) {
	const Harness = defineComponent({
		setup() {
			const sessionId = ref<string | null>(null);
			const chat = useChat(() => ({ sessionId: sessionId.value, provider }));
			return {
				setSession: (id: string | null) => {
					sessionId.value = id;
				},
				chat,
			};
		},
		render: () => null,
	});
	return mount(Harness);
}

describe("useChat（Vue）", () => {
	it("按 sessionId 建立连接，切换会话时中止旧流", async () => {
		const { provider, streams } = createFakeProvider();
		const wrapper = mountHarness(provider);
		wrapper.vm.setSession("s1");
		await nextTick();
		await flushPromises();
		expect(streams.map((stream) => stream.sessionId)).toEqual(["s1"]);

		wrapper.vm.setSession("s2");
		await nextTick();
		await flushPromises();
		await Promise.resolve();
		expect(streams.map((stream) => stream.sessionId)).toEqual(["s1", "s2"]);
		expect(streams[0]?.aborted).toBe(true);
		wrapper.unmount();
	});

	it("setSessionId 后在同一闭包内直接发送到新会话", async () => {
		const { provider, sent } = createFakeProvider();
		const wrapper = mountHarness(provider);
		wrapper.vm.setSession("s-new");
		await wrapper.vm.chat.send("你好", { sessionId: "s-new" });
		expect(sent).toEqual([{ sessionId: "s-new", text: "你好" }]);
		wrapper.unmount();
	});

	it("没有会话时发送报错", async () => {
		const { provider } = createFakeProvider();
		const wrapper = mountHarness(provider);
		await expect(wrapper.vm.chat.send("hello")).rejects.toThrow("需要 sessionId");
		wrapper.unmount();
	});

	it("卸载后拒绝发送", async () => {
		const { provider } = createFakeProvider();
		const wrapper = mountHarness(provider);
		wrapper.vm.setSession("s1");
		await nextTick();
		wrapper.unmount();
		await expect(wrapper.vm.chat.send("hello", { sessionId: "s1" })).rejects.toThrow("已卸载");
	});
});
