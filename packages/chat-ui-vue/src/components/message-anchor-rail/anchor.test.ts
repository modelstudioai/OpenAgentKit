import type { ChatMessage } from "@openagentkit/sdk/messages";
import { describe, expect, it } from "vitest";
import { deriveAnchorTurns } from "./index.ts";

const user = (id: string, text: string): ChatMessage => ({
	id,
	role: "user",
	status: "done",
	parts: [{ type: "text", text }],
});
const assistant = (id: string, text: string): ChatMessage => ({
	id,
	role: "assistant",
	status: "done",
	parts: [{ type: "text", text }],
});

describe("锚点回合推导", () => {
	it("每条用户消息一个回合，摘要取助手回复", () => {
		const turns = deriveAnchorTurns([
			user("u1", "第一问"),
			assistant("a1", "第一答"),
			user("u2", "第二问"),
			assistant("a2", "第二答"),
		]);
		expect(turns.map((turn) => turn.label)).toEqual(["第一问", "第二问"]);
		expect(turns[0]?.summary).toBe("第一答");
		expect(turns[1]?.messageIndex).toBe(2);
	});

	it("纯附件回合回退为附件消息", () => {
		const turns = deriveAnchorTurns([
			{ id: "u1", role: "user", status: "done", parts: [{ type: "attachment", file: { file_id: "f1" } }] },
		]);
		expect(turns[0]?.label).toBe("附件消息");
	});
});
