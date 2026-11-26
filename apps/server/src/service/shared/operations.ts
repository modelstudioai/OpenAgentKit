import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
	type OperationView,
	PublicationErrorDetailsSchema,
	type PublicationReport,
	PublicationReportSchema,
} from "@openagentkit/sdk/protocol";
import { redactSecrets } from "../../config.ts";
import { KitOperationsEntity } from "../../entity/tables/kit-operations.entity.ts";
import { PublicationError } from "../../publication-error.ts";
import { StoreDatabase } from "../../store/database.ts";

interface Row {
	operation_id: string;
	kind: string;
	subject: string | null;
	status: string;
	phase: string | null;
	progress: number;
	log: string;
	result: string | null;
	error: string | null;
	publication_json: string | null;
	error_details_json: string | null;
	created_at: string;
	updated_at: string;
}

const storedJson = (value: unknown, current: unknown) => {
	const next = value === undefined ? current : value;
	return next === undefined ? null : JSON.stringify(next);
};

function toView(row: Row): OperationView {
	return {
		operation_id: row.operation_id,
		kind: row.kind,
		status: row.status as OperationView["status"],
		...(row.phase ? { phase: row.phase } : {}),
		progress: row.progress,
		log: JSON.parse(row.log) as string[],
		...(row.result ? { result: JSON.parse(row.result) } : {}),
		...(row.error ? { error: row.error } : {}),
		...(row.publication_json ? { publication: PublicationReportSchema.parse(JSON.parse(row.publication_json)) } : {}),
		...(row.error_details_json
			? { error_details: PublicationErrorDetailsSchema.parse(JSON.parse(row.error_details_json)) }
			: {}),
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

export interface OperationLogger {
	log(line: string): void;
	progress(value: number, phase?: string): void;
	publication?(report: PublicationReport): void | Promise<void>;
}

/** 长任务执行、状态与进度订阅共用同一个应用级实例。 */
@Injectable()
export class OperationService {
	private readonly listeners = new Map<string, Set<(view: OperationView) => void>>();

	constructor(@Inject(StoreDatabase) private readonly db: StoreDatabase) {}

	private notify(view: OperationView) {
		for (const listener of this.listeners.get(view.operation_id) ?? []) listener(view);
	}

	async create(input: { operationId: string; kind: string; subject?: string }) {
		const now = new Date().toISOString();
		await this.db.write((manager) =>
			manager.insert(KitOperationsEntity, {
				operation_id: input.operationId,
				kind: input.kind,
				subject: input.subject ?? null,
				status: "pending",
				phase: null,
				progress: 0,
				log: "[]",
				created_at: now,
				updated_at: now,
			}),
		);
		return (await this.get(input.operationId)) as OperationView;
	}

	async get(operationId: string): Promise<OperationView | null> {
		const row = (await this.db.read((manager) =>
			manager.findOneBy(KitOperationsEntity, { operation_id: operationId }),
		)) as Row | null;
		return row ? toView(row) : null;
	}

	async owns(operationId: string, subject: string): Promise<boolean> {
		return this.db.read((manager) => manager.existsBy(KitOperationsEntity, { operation_id: operationId, subject }));
	}

	async update(
		operationId: string,
		patch: {
			status?: OperationView["status"];
			phase?: string;
			progress?: number;
			result?: unknown;
			error?: string;
			publication?: OperationView["publication"];
			error_details?: OperationView["error_details"];
			logLine?: string;
		},
	) {
		const current = await this.get(operationId);
		if (!current) return null;
		const log = patch.logLine ? [...current.log, patch.logLine] : current.log;
		await this.db.write((manager) =>
			manager.update(
				KitOperationsEntity,
				{ operation_id: operationId },
				{
					status: patch.status ?? current.status,
					phase: patch.phase ?? current.phase ?? null,
					progress: patch.progress ?? current.progress,
					log: JSON.stringify(log),
					result: storedJson(patch.result, current.result),
					error: patch.error ?? current.error ?? null,
					publication_json: storedJson(
						patch.publication && PublicationReportSchema.parse(patch.publication),
						current.publication,
					),
					error_details_json: storedJson(
						patch.error_details && PublicationErrorDetailsSchema.parse(patch.error_details),
						current.error_details,
					),
					updated_at: new Date().toISOString(),
				},
			),
		);
		const view = (await this.get(operationId)) as OperationView;
		this.notify(view);
		return view;
	}

	async list(options: { sessionId?: string; limit?: number } = {}) {
		const limit = options.limit ?? 50;
		const rows = (await this.db.read((manager) =>
			manager.find(KitOperationsEntity, { order: { created_at: "DESC" }, take: limit }),
		)) as Row[];
		return rows.map(toView);
	}

	subscribe(
		operationId: string,
		listener: (view: OperationView) => void,
		onError: (error: unknown) => void,
	): () => void {
		const set = this.listeners.get(operationId) ?? new Set();
		let seenUpdate = false;
		const emit = (view: OperationView) => {
			seenUpdate = true;
			listener(view);
		};
		set.add(emit);
		this.listeners.set(operationId, set);

		// 先订阅再读快照。已有更新抵达时，丢弃可能更早的读取结果。
		void this.get(operationId)
			.then((view) => {
				if (!seenUpdate && view && set.has(emit)) emit(view);
			})
			.catch((error: unknown) => {
				if (set.has(emit)) onError(error);
			});
		return () => {
			if (set.delete(emit) && !set.size) this.listeners.delete(operationId);
		};
	}

	async run<T>(input: {
		kind: string;
		subject?: string;
		fn: (logger: OperationLogger) => Promise<T>;
		onCreated?: (operationId: string) => void | Promise<void>;
	}): Promise<string> {
		const operationId = `op_${randomUUID().slice(0, 12)}`;
		await this.create({ operationId, kind: input.kind, ...(input.subject ? { subject: input.subject } : {}) });
		try {
			await input.onCreated?.(operationId);
		} catch (error) {
			await this.update(operationId, { status: "failed", phase: "prepare", error: "操作准备失败，未执行发布" });
			throw error;
		}
		let feedback = Promise.resolve();
		const queue = (patch: Parameters<OperationService["update"]>[1]) => {
			const update = feedback.then(async () => {
				await this.update(operationId, patch);
			});
			// 进度或日志写入失败后继续处理队列，发布结果的调用方仍能收到本次写入的结果。
			feedback = update.catch(() => undefined);
			return update;
		};
		const logger: OperationLogger = {
			publication: (report) => queue({ publication: report }),
			log(line) {
				void queue({ logLine: redactSecrets(line) });
			},
			progress(value, phase) {
				void queue({ progress: Math.max(0, Math.min(1, value)), ...(phase ? { phase } : {}) });
			},
		};
		void (async () => {
			try {
				await this.update(operationId, { status: "running", phase: "start", progress: 0.05 });
				const result = await input.fn(logger);
				await feedback;
				await this.update(operationId, { status: "succeeded", phase: "done", progress: 1, result });
			} catch (error) {
				await feedback;
				await this.update(operationId, {
					status: "failed",
					phase: "error",
					error: redactSecrets(error instanceof Error ? error.message : String(error)),
					...(error instanceof PublicationError ? { error_details: error.errorDetails } : {}),
				});
			}
		})().catch(() => console.error("[kit-server] 保存操作终态失败"));
		return operationId;
	}
}
