import { type OperationView, PublicationErrorDetailsSchema, PublicationReportSchema } from "@openagentkit/sdk/protocol";
import type { StoreDatabase } from "./database.ts";

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

export function createOperationStore(db: StoreDatabase) {
	const listeners = new Map<string, Set<(view: OperationView) => void>>();
	const notify = (view: OperationView) => {
		for (const listener of listeners.get(view.operation_id) ?? []) listener(view);
	};
	return {
		async create(input: { operationId: string; kind: string; subject?: string }) {
			const now = new Date().toISOString();
			await db.run(
				`INSERT INTO kit_operations (operation_id, kind, subject, status, phase, progress, log, created_at, updated_at)
				 VALUES (?,?,?,?,?,?,?,?,?)`,
				input.operationId,
				input.kind,
				input.subject ?? null,
				"pending",
				null,
				0,
				"[]",
				now,
				now,
			);
			return (await this.get(input.operationId)) as OperationView;
		},
		async get(operationId: string): Promise<OperationView | null> {
			const row = (await db.get("SELECT * FROM kit_operations WHERE operation_id = ?", operationId)) as unknown as
				| Row
				| undefined;
			return row ? toView(row) : null;
		},
		async owns(operationId: string, subject: string): Promise<boolean> {
			return Boolean(
				await db.get("SELECT 1 FROM kit_operations WHERE operation_id=? AND subject=?", operationId, subject),
			);
		},
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
			await db.run(
				`UPDATE kit_operations SET status=?, phase=?, progress=?, log=?, result=?, error=?, publication_json=?, error_details_json=?, updated_at=? WHERE operation_id=?`,
				patch.status ?? current.status,
				patch.phase ?? current.phase ?? null,
				patch.progress ?? current.progress,
				JSON.stringify(log),
				storedJson(patch.result, current.result),
				patch.error ?? current.error ?? null,
				storedJson(patch.publication && PublicationReportSchema.parse(patch.publication), current.publication),
				storedJson(
					patch.error_details && PublicationErrorDetailsSchema.parse(patch.error_details),
					current.error_details,
				),
				new Date().toISOString(),
				operationId,
			);
			const view = (await this.get(operationId)) as OperationView;
			notify(view);
			return view;
		},
		async list(options: { sessionId?: string; limit?: number } = {}) {
			const limit = options.limit ?? 50;
			const rows = (await db.all(
				"SELECT * FROM kit_operations ORDER BY created_at DESC LIMIT ?",
				limit,
			)) as unknown as Row[];
			return rows.map(toView);
		},
		subscribe(
			operationId: string,
			listener: (view: OperationView) => void,
			onError: (error: unknown) => void,
		): () => void {
			const set = listeners.get(operationId) ?? new Set();
			let seenUpdate = false;
			const emit = (view: OperationView) => {
				seenUpdate = true;
				listener(view);
			};
			set.add(emit);
			listeners.set(operationId, set);

			// 先订阅再读快照。已有更新抵达时，丢弃可能更早的读取结果。
			void this.get(operationId)
				.then((view) => {
					if (!seenUpdate && view && set.has(emit)) emit(view);
				})
				.catch((error: unknown) => {
					if (set.has(emit)) onError(error);
				});
			return () => {
				if (set.delete(emit) && !set.size) listeners.delete(operationId);
			};
		},
	};
}
export type OperationStore = ReturnType<typeof createOperationStore>;
