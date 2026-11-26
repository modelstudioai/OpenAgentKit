import { Injectable } from "@nestjs/common";
import {
	type EventEntry,
	type OptimisticOverlay,
	projectPhase,
	type TurnPhase,
	transportPosition,
} from "@openagentkit/sdk/chat";
import {
	deriveApprovalState,
	type SessionEvent,
	sessionStatusOf,
	stableEventId,
	stopReasonOf,
} from "@openagentkit/sdk/protocol";
import type { EventBuffer } from "../../../utils/event-buffer.ts";

/** 已受理但尚未被 Provider 终态证明完成的回合；只保存 ID 和状态证据，不保存消息正文。 */
export interface AcceptedTurn {
	eventIds: string[];
	previousStatus: string | null;
	clientMessageId?: string;
	knownUserIds: Set<string>;
	after: number;
	sequence: number;
}

export type SessionRuntimeStatus = "running" | "requires_action" | "failed" | "idle";

@Injectable()
export class SessionRuntimeService {
	private readonly endedStatuses = new Set(["idle", "terminated", "archived", "completed", "failed", "stopped"]);

	private isTerminal(status: string | null | undefined, reason: unknown) {
		return this.endedStatuses.has(status ?? "") && reason !== "requires_action";
	}

	detailEnded(info?: { status: string; stop_reason?: { type: string } }) {
		return this.isTerminal(info?.status, info?.stop_reason?.type);
	}

	eventEnded(event?: SessionEvent) {
		return Boolean(event && this.isTerminal(sessionStatusOf(event), stopReasonOf(event)?.type));
	}

	private statusValues(event: SessionEvent) {
		return [event.event_id, sessionStatusOf(event), stopReasonOf(event)?.type];
	}

	private statusValue(event: SessionEvent) {
		return JSON.stringify(this.statusValues(event));
	}

	private statusCursor(event: SessionEvent, buffer?: EventBuffer) {
		if (!buffer?.latestStatus || this.statusValue(buffer.latestStatus) !== this.statusValue(event)) return;
		const position = event.event_id ? buffer.positions.get(event.event_id) : undefined;
		return position === undefined ? undefined : buffer.latest.get(position);
	}

	/** 只持久化状态身份、状态值和内存变更游标，不保存事件正文。 */
	statusMarker(event?: SessionEvent, buffer?: EventBuffer) {
		return event ? JSON.stringify([...this.statusValues(event), this.statusCursor(event, buffer) ?? null]) : "[]";
	}

	private sequenceInEpoch(cursor: unknown, epoch: string) {
		if (typeof cursor !== "string" || !cursor.startsWith(`${epoch}:`)) return null;
		const sequence = Number(cursor.slice(epoch.length + 1));
		return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : null;
	}

	requestFinished(
		events: SessionEvent[],
		status: SessionEvent | undefined,
		request: { event_ids: string | null; previous_status: string | null },
		buffer?: EventBuffer,
	) {
		if (!status || !this.eventEnded(status)) return false;
		const ids = JSON.parse(request.event_ids ?? "[]") as string[];
		if (!ids.every((id) => events.some((event) => event.event_id === id))) return false;
		const previous = request.previous_status === null ? null : (JSON.parse(request.previous_status) as unknown[]);
		// 本轮状态快照可能创建在用户消息之前，再原位更新为结束；数组位置不是更新时间。
		if (previous && JSON.stringify(previous.slice(0, 3)) !== this.statusValue(status)) return true;
		// 旧请求缺少发送前摘要时，仅保留新事件创建顺序能证实的路径，不把旧状态的原位更新当新事件。
		if (!previous && ids.length) {
			const statusPosition = events.findIndex((event) => event.event_id === status.event_id);
			if (ids.every((id) => events.findIndex((event) => event.event_id === id) < statusPosition)) return true;
		}
		if (!buffer || !previous) return false;
		const before = this.sequenceInEpoch(previous[3], buffer.epoch);
		const completed = this.sequenceInEpoch(this.statusCursor(status, buffer), buffer.epoch);
		if (before === null || completed === null || completed <= before) return false;
		// 跨轮完全复用同一状态身份和值时，只接受同一缓冲世代中晚于本轮回显的主状态更新。
		return ids.every((id) => {
			const position = buffer.positions.get(id);
			const accepted = this.sequenceInEpoch(
				position === undefined ? undefined : buffer.latest.get(position),
				buffer.epoch,
			);
			if (accepted !== null && accepted > before && completed > accepted) return true;
			// 用户回显也可能同 ID 更新；结束之后的快照更新不能抹掉已知的首次回显顺序。
			return buffer.changes.some((change) => {
				const sequence = this.sequenceInEpoch(change.cursor, buffer.epoch);
				return change.event.event_id === id && sequence !== null && sequence > before && sequence < completed;
			});
		});
	}

	private entriesOf(buffer: EventBuffer): EventEntry[] {
		return buffer.events.map((event, index) => {
			const transport = transportPosition(buffer.latest.get(index));
			return {
				identity: event.event_id || stableEventId(event),
				event,
				sequence: index + 1,
				updated: transport?.sequence ?? index + 1,
				transport,
				firstTransport: transport,
			};
		});
	}

	private overlayOf(turn: AcceptedTurn): OptimisticOverlay {
		return {
			message: {
				id: `accepted:${turn.sequence}`,
				role: "user",
				parts: [],
				status: "pending",
				...(turn.clientMessageId ? { clientMessageId: turn.clientMessageId } : {}),
			},
			generation: turn.sequence,
			after: turn.after,
			knownUserIds: turn.knownUserIds,
			providerEventIds: new Set(turn.eventIds),
			sequence: turn.sequence,
		};
	}

	private statusOfPhase(phase: TurnPhase): SessionRuntimeStatus {
		if (phase === "running" || phase === "stopping") return "running";
		if (phase === "requires_action") return "requires_action";
		if (phase === "failed") return "failed";
		return "idle";
	}

	/**
	 * 由完整账本和受理中的回合共同推导状态。旧 idle 到达较早不会改变 pending turn；
	 * 只有能证明本轮用户回显及主状态终态的证据才允许清除它。
	 */
	project(buffer: EventBuffer, turn: AcceptedTurn | undefined): { status: SessionRuntimeStatus; finished: boolean } {
		const finished = turn
			? this.requestFinished(
					buffer.events,
					buffer.latestStatus,
					{
						event_ids: turn.eventIds.length ? JSON.stringify(turn.eventIds) : null,
						previous_status: turn.previousStatus,
					},
					buffer,
				)
			: false;
		const projected = projectPhase(this.entriesOf(buffer), turn && !finished ? [this.overlayOf(turn)] : []);
		const approvals = deriveApprovalState(buffer.events, buffer.latestStatus);
		return {
			status: approvals.requires_action ? "requires_action" : this.statusOfPhase(projected.phase),
			finished,
		};
	}
}
