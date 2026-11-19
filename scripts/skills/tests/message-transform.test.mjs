import assert from "node:assert/strict";
import { test } from "node:test";
import { createChatController } from "@openagentkit/sdk/chat";
import { withDisplayLabel } from "../src/kit-chat-provider/examples/message-transform.ts";

test("the display wrapper keeps a class Provider's subscription and send receiver", async () => {
	class Backend {
		#stream;
		stream(sessionId, options) {
			this.#stream = options;
			options.onReady({ sessionId, replayed: 0 });
			return new Promise((resolve) => options.signal.addEventListener("abort", resolve, { once: true }));
		}
		async sendMessage(sessionId) {
			this.#stream.onEvent({
				event_id: "answer",
				type: "message",
				role: "assistant",
				content: [{ type: "text", text: "[[agent-name]] 已收到你的请求。" }],
			});
			return { session_id: sessionId, accepted: true, event_ids: [] };
		}
		async interrupt() {
			return { interrupted: true };
		}
		async toolApprovals() {
			return { requires_action: false, batch_id: null, pending_call_ids: [], requests: [] };
		}
		async submitToolApproval(sessionId) {
			return { session_id: sessionId, accepted: true, event_ids: [] };
		}
	}
	const controller = createChatController(withDisplayLabel(new Backend()), "session");
	try {
		await controller.send("你好");
		const reply = controller.getSnapshot().messages.find((message) => message.role === "assistant");
		assert.equal(reply.parts[0].text, "客服助手 已收到你的请求。");
		assert.equal(reply.parts[0].id, "answer:content:0");
	} finally {
		controller.dispose();
	}
});
