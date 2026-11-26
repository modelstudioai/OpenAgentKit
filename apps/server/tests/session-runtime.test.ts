import type { SessionEvent } from "@openagentkit/sdk/protocol";
import { describe, expect, it } from "vitest";
import { type AcceptedTurn, SessionRuntimeService } from "../src/service/shared/session/session-runtime.ts";
import { createEventBufferRegistry } from "../src/utils/event-buffer.ts";

const runtime = new SessionRuntimeService();

function status(value: string, id = "session-status"): SessionEvent {
	return { event_id: id, type: "session_status", metadata: { status: value, stop_reason: { type: "completed" } } };
}

function echo(clientMessageId: string): SessionEvent {
	return {
		event_id: clientMessageId,
		type: "message",
		role: "user",
		content: [],
		metadata: { client_message_id: clientMessageId },
	};
}

function acceptTurn(
	registry: ReturnType<typeof createEventBufferRegistry>,
	sessionId: string,
	clientMessageId: string,
) {
	const buffer = registry.ensure(sessionId);
	const turn: AcceptedTurn = {
		eventIds: [clientMessageId],
		previousStatus: runtime.statusMarker(buffer.latestStatus, buffer),
		clientMessageId,
		knownUserIds: new Set(
			buffer.events.filter((event) => event.role === "user").map((event) => event.event_id ?? event.type),
		),
		after: buffer.events.length,
		sequence: buffer.sequence + 1,
	};
	return turn;
}

describe("会话回合投影", () => {
	it("重放相同旧 idle 不能结束 pending turn，真实终态才清除它", () => {
		const registry = createEventBufferRegistry();
		const buffer = registry.ensure("s1");
		registry.seed("s1", [status("idle")]);
		const turn = acceptTurn(registry, "s1", "cm-1");
		expect(runtime.project(buffer, turn).status).toBe("running");
		registry.append("s1", echo("cm-1"));
		expect(runtime.project(buffer, turn).status).toBe("running");
		registry.append("s1", status("idle"));
		expect(runtime.project(buffer, turn)).toMatchObject({ status: "running", finished: false });
		registry.append("s1", status("running"));
		expect(runtime.project(buffer, turn).status).toBe("running");
		registry.append("s1", status("idle"));
		expect(runtime.project(buffer, turn)).toMatchObject({ status: "idle", finished: true });
	});

	it("尚无用户回显时旧 idle 也不能伪造本轮完成", () => {
		const registry = createEventBufferRegistry();
		const buffer = registry.ensure("s1");
		registry.seed("s1", [status("idle")]);
		const turn = acceptTurn(registry, "s1", "cm-2");
		registry.append("s1", status("idle"));
		expect(runtime.project(buffer, turn)).toMatchObject({ status: "running", finished: false });
	});

	it("没有 pending turn 时以 Provider 主状态推导，不凭详情 idle 覆盖历史 running", () => {
		const registry = createEventBufferRegistry();
		const buffer = registry.ensure("s1");
		registry.seed("s1", [status("running")]);
		expect(runtime.project(buffer, undefined).status).toBe("running");
	});
});
