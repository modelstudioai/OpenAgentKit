import { KitError, sessionStatusOf } from "@openagentkit/sdk/protocol";
import { Not } from "typeorm";
import { KitSessionDeletionsEntity } from "../../../entity/tables/kit-session-deletions.entity.ts";
import type { GatewaySessionInfo, ProviderGateway } from "../../../gateway/types.ts";
import type { StoreDatabase } from "../../../store/database.ts";
import type { EventBufferRegistry } from "../../../utils/event-buffer.ts";
import type { MemberUsageService } from "../member-usage.ts";
import type { SessionHistoryService } from "./session-history.ts";
import type { SessionIndexService } from "./session-index.ts";

type DeletionStage = "preparing" | "captured" | "deleting" | "uncertain" | "deleted";
interface SessionDeletion {
	session_id: string;
	subject_id: string;
	stage: DeletionStage;
	updated_at: string;
}

class DeadlineError extends Error {}
async function beforeDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		// 已完成的 Promise 会抢在 0ms timer 之前；显式检查才能终止持续有响应的轮询。
		if (Date.now() >= deadline) {
			void work.catch(() => {});
			throw new DeadlineError();
		}
		return await Promise.race([
			work,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new DeadlineError()), deadline - Date.now());
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}
export interface SessionDeletionDeps {
	gateway: ProviderGateway;
	history: SessionHistoryService;
	buffers: EventBufferRegistry;
	sessionIndex: SessionIndexService;
	memberUsage: MemberUsageService;
	db: StoreDatabase;
	timeoutMs?: number;
	pollMs?: number;
}
interface Attempt {
	sessionId: string;
	subjectId: string;
	deadline: number;
	stage: "stop" | "capture" | "delete" | "finalize";
	executionStopped: boolean;
	remoteStarted: boolean;
	confirmedDeleted: boolean;
	keepWriteProtection: boolean;
}
function failureMessage(attempt: Attempt) {
	if (attempt.confirmedDeleted) return "远端会话已删除，用量快照已保存，本地删除状态待恢复，请重试";
	if (attempt.remoteStarted) return "删除结果尚未确认，用量快照已保存，请重试删除以核实状态";
	if (attempt.stage === "capture") return "执行已停止，用量保存失败，会话未删除，请重试";
	if (attempt.stage === "delete") return "用量快照已保存，删除失败，会话未删除，请重试";
	return "未能确认执行已停止，会话未删除，请重试";
}

/** 已通过确认闸门后调用。只有本次快照落库成功，才会向 Provider 发 DELETE。 */
export class SessionDeletionService {
	private readonly sessionIndex;
	private readonly memberUsage;
	private readonly timeoutMs;
	private readonly gateway;
	private readonly history;
	private readonly db;
	private readonly buffers;
	private readonly pollMs;

	constructor(deps: SessionDeletionDeps) {
		const { gateway, buffers, sessionIndex, memberUsage, db } = deps;
		this.sessionIndex = sessionIndex;
		this.memberUsage = memberUsage;
		this.gateway = gateway;
		this.history = deps.history;
		this.db = db;
		this.buffers = buffers;
		this.timeoutMs = deps.timeoutMs ?? 30_000;
		this.pollMs = deps.pollMs ?? 500;
	}

	async remove(sessionId: string, drain: Promise<unknown>) {
		const row = await this.sessionIndex.get(sessionId);
		if (!row) throw new KitError("not_found", "会话不存在");
		if (!(await this.memberUsage.isMemberSession(sessionId))) {
			await beforeDeadline(drain, Date.now() + this.timeoutMs);
			await this.gateway.deleteSession(sessionId);
			await this.sessionIndex.remove(sessionId);
			return;
		}
		const previous = await this.deletionStage(sessionId);
		const recovering = previous?.stage === "deleting" || previous?.stage === "uncertain";
		const attempt: Attempt = {
			sessionId,
			subjectId: row.subject_id,
			deadline: Date.now() + this.timeoutMs,
			stage: recovering ? "delete" : "stop",
			executionStopped: false,
			remoteStarted: recovering,
			confirmedDeleted: false,
			// 准备/封存阶段可能继承未确认结束的中断；idle 只说明当前状态，不能解锁旧请求。
			keepWriteProtection: previous?.stage === "preparing" || previous?.stage === "captured",
		};
		try {
			await this.execute(attempt, drain);
		} catch {
			await this.fail(attempt);
		}
	}

	private async stopped(info: GatewaySessionInfo, deadline: number) {
		if (["terminated", "archived", "stopped", "completed", "failed"].includes(info.status)) return true;
		if (info.status !== "idle") return false;
		if (info.stop_reason) return info.stop_reason.type !== "requires_action";
		// 详情可能不带停止原因；分页历史中的主线程审批状态仍是必要证据。
		const controller = new AbortController();
		try {
			const snapshot = await beforeDeadline(
				this.history.readApprovalSnapshot(info.session_id, this.buffers, controller.signal),
				deadline,
			);
			// 详情为 idle 但较新的主状态仍 running 时，不能把“无需审批”误认为执行已结束。
			if (snapshot.latestStatus && sessionStatusOf(snapshot.latestStatus) !== "idle") return false;
			return !snapshot.approvals.requires_action;
		} finally {
			controller.abort();
		}
	}

	private async waitUntilStopped(attempt: Attempt, info: GatewaySessionInfo) {
		if (await this.stopped(info, attempt.deadline)) return;
		// 当前 idle 无法证明此前发出的 interrupt 已不再在途；直到删除完成都保持写保护。
		attempt.keepWriteProtection = true;
		await beforeDeadline(this.gateway.interrupt(attempt.sessionId), attempt.deadline);
		for (;;) {
			const current = await beforeDeadline(this.gateway.getSession(attempt.sessionId), attempt.deadline);
			if (!current) throw new KitError("conflict", "停止执行后会话不可查询");
			if (await this.stopped(current, attempt.deadline)) return;
			await beforeDeadline(new Promise((resolve) => setTimeout(resolve, this.pollMs)), attempt.deadline);
		}
	}

	private async capture(attempt: Attempt, info: GatewaySessionInfo) {
		attempt.stage = "stop";
		await this.waitUntilStopped(attempt, info);
		attempt.executionStopped = true;
		attempt.stage = "capture";
		// 与状态确认分开重新读取；不用中断前或后台刷新缓存代替本次快照。
		const final = await beforeDeadline(this.gateway.getSession(attempt.sessionId), attempt.deadline);
		if (!final || !(await this.stopped(final, attempt.deadline))) throw new KitError("conflict", "会话状态发生变化");
		await this.memberUsage.captureFinal(attempt.sessionId, final);
		// 封存新快照不能覆盖旧请求的不确定性，否则重启会丢失迟到 DELETE / interrupt 的保护。
		if (!attempt.remoteStarted && !attempt.keepWriteProtection)
			await this.setDeletionStage(attempt.sessionId, attempt.subjectId, "captured");
	}

	private async removeRemote(attempt: Attempt) {
		attempt.stage = "delete";
		await this.setDeletionStage(attempt.sessionId, attempt.subjectId, "deleting");
		attempt.remoteStarted = true;
		try {
			await beforeDeadline(this.gateway.deleteSession(attempt.sessionId), attempt.deadline);
			attempt.confirmedDeleted = true;
		} catch (error) {
			await this.setDeletionStage(attempt.sessionId, attempt.subjectId, "uncertain");
			// 超时请求可能仍执行，保持封存与写保护直到下一次确认。
			if (error instanceof DeadlineError) throw error;
			const remaining = await beforeDeadline(this.gateway.getSession(attempt.sessionId), attempt.deadline);
			if (!remaining) {
				attempt.confirmedDeleted = true;
				return;
			}
			// GET 仍存在不代表 DELETE 已失败：连接错误后的远端请求可能稍后才执行。
			throw error;
		}
	}

	private async fail(attempt: Attempt): Promise<never> {
		if (!attempt.remoteStarted && !attempt.keepWriteProtection) {
			try {
				await this.memberUsage.releaseFinal(attempt.sessionId);
				await this.clearDeletionStage(attempt.sessionId);
			} catch {
				/* 数据库不可写时保留持久阶段，恢复后再次确认；不泄露底层错误。 */
			}
		}
		throw new KitError("conflict", failureMessage(attempt), {
			retryable: true,
			details: {
				stage: attempt.stage,
				execution_stopped: attempt.executionStopped,
				deletion_uncertain: attempt.remoteStarted && !attempt.confirmedDeleted,
			},
		});
	}

	private async execute(attempt: Attempt, drain: Promise<unknown>) {
		await this.setDeletionStage(
			attempt.sessionId,
			attempt.subjectId,
			attempt.remoteStarted ? "uncertain" : "preparing",
		);
		await beforeDeadline(drain, attempt.deadline);
		const info = await beforeDeadline(this.gateway.getSession(attempt.sessionId), attempt.deadline);
		if (info) {
			await this.capture(attempt, info);
			await this.removeRemote(attempt);
		} else {
			if (!attempt.remoteStarted || !(await this.memberUsage.hasFinalSnapshot(attempt.sessionId)))
				throw new KitError("conflict", "会话已不可查询且没有可确认的删除快照");
			attempt.confirmedDeleted = true;
		}
		attempt.stage = "finalize";
		await this.memberUsage.markDeleted(attempt.sessionId);
	}

	blocksMutations(sessionId: string): Promise<boolean> {
		return this.db.read((manager) => manager.existsBy(KitSessionDeletionsEntity, { session_id: sessionId }));
	}

	private async deletionStage(sessionId: string) {
		const row = await this.db.read((manager) =>
			manager.findOneBy(KitSessionDeletionsEntity, { session_id: sessionId }),
		);
		return (row ?? undefined) as SessionDeletion | undefined;
	}

	private async setDeletionStage(sessionId: string, subjectId: string, stage: DeletionStage) {
		await this.db.write((manager) =>
			manager
				.createQueryBuilder()
				.insert()
				.into(KitSessionDeletionsEntity)
				.values({ session_id: sessionId, subject_id: subjectId, stage, updated_at: new Date().toISOString() })
				.orUpdate(["stage", "updated_at"], ["session_id"])
				.updateEntity(false)
				.execute(),
		);
	}

	private async clearDeletionStage(sessionId: string) {
		await this.db.write((manager) =>
			manager.delete(KitSessionDeletionsEntity, { session_id: sessionId, stage: Not("deleted") }),
		);
	}
}
