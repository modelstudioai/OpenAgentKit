import type { SessionEvent } from "@openagentkit/sdk/protocol";
import { describe, expect, it } from "vitest";
import { createEventBufferRegistry } from "../src/services/event-buffer.ts";
import { createLiveEventJournal } from "../src/services/live-event-journal.ts";

const ev = (id: string): SessionEvent => ({ event_id: id, type: "message", content: [{ type: "text", text: id }] });

describe("event buffer", () => {
	it("append 去重且通知订阅者", () => {
		const registry = createEventBufferRegistry();
		const seen: string[] = [];
		registry.subscribe("s1", (change) => {
			if (change) seen.push(change.event.event_id as string);
		});
		registry.append("s1", ev("e1"));
		registry.append("s1", ev("e1"));
		registry.append("s1", ev("e2"));
		expect(registry.get("s1")?.events.map((e) => e.event_id)).toEqual(["e1", "e2"]);
		expect(seen).toEqual(["e1", "e2"]);
	});

	it("seed 幂等（重建路径）", () => {
		const registry = createEventBufferRegistry();
		registry.seed("s1", [ev("e1"), ev("e2")]);
		registry.seed("s1", [ev("e2"), ev("e3")]);
		expect(registry.get("s1")?.events.map((e) => e.event_id)).toEqual(["e1", "e2", "e3"]);
	});
});

describe("快照与传输游标", () => {
	it("同 ID 更新原位置但记录新的变更证据，完整重复幂等", () => {
		const registry = createEventBufferRegistry();
		const first = registry.append("s", ev("e"))!;
		const update = { ...ev("e"), content: [{ type: "text", text: "累计完成" }] };
		const second = registry.append("s", update)!;
		expect(second.cursor).not.toBe(first.cursor);
		expect(registry.get("s")?.events).toEqual([update]);
		expect(registry.get("s")?.changes).toEqual([first, second]);
		expect(registry.append("s", update)).toBeUndefined();
	});
	it("实时日志从有效游标续传，淘汰或换世代后要求独立读取历史", () => {
		const journal = createLiveEventJournal();
		const start = journal.cursor();
		for (let i = 0; i < 1024; i++) journal.append(ev(`e${i}`));
		expect(journal.readAfter(start)).toHaveLength(1024);
		const before = journal.cursor();
		journal.append(ev("latest"));
		expect(journal.readAfter(before)).toEqual([{ event: ev("latest"), cursor: journal.cursor() }]);
		expect(journal.readAfter()).toEqual([]);
		expect(journal.readAfter(start)).toBeUndefined();
		expect(journal.readAfter("latest")).toBeUndefined();
		expect(createLiveEventJournal().readAfter(before)).toBeUndefined();
	});
});

describe("当前状态权威", () => {
	it("旧位置的状态快照更新仍成为当前主状态，子线程不会覆盖它", () => {
		const registry = createEventBufferRegistry();
		registry.append("s", { event_id: "old", type: "session_status", metadata: { status: "running" } });
		registry.append("s", { event_id: "new", type: "session_status", metadata: { status: "idle" } });
		registry.append("s", {
			event_id: "old",
			type: "session_status",
			metadata: {
				status: "idle",
				stop_reason: { type: "requires_action", pending_batch_id: "batch", pending_call_ids: ["call"] },
			},
		});
		registry.append("s", {
			event_id: "child",
			type: "thread_status",
			metadata: { session_thread_id: "sthr_child", status: "running" },
		});
		expect(registry.get("s")?.latestStatus?.event_id).toBe("old");
	});
});
