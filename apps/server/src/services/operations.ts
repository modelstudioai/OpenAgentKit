import { randomUUID } from "node:crypto";
import type { PublicationReport } from "@openagentkit/sdk/protocol";
import { redactSecrets } from "../config.ts";
import { PublicationError } from "../publication-error.ts";
import type { OperationStore } from "../store/operations.ts";

export interface OperationLogger {
	log(line: string): void;
	progress(value: number, phase?: string): void;
	publication?(report: PublicationReport): void | Promise<void>;
}

/** 长任务执行器：状态与日志落库，进度经 SSE 暴露。见 docs/interfaces.md operations。 */
export function createOperationRunner(store: OperationStore) {
	return {
		async run<T>(input: {
			kind: string;
			subject?: string;
			fn: (logger: OperationLogger) => Promise<T>;
			onCreated?: (operationId: string) => void | Promise<void>;
		}): Promise<string> {
			const operationId = `op_${randomUUID().slice(0, 12)}`;
			await store.create({ operationId, kind: input.kind, ...(input.subject ? { subject: input.subject } : {}) });
			try {
				await input.onCreated?.(operationId);
			} catch (error) {
				await store.update(operationId, { status: "failed", phase: "prepare", error: "操作准备失败，未执行发布" });
				throw error;
			}
			let feedback = Promise.resolve();
			function queue(patch: Parameters<OperationStore["update"]>[1]) {
				const update = feedback.then(async () => {
					await store.update(operationId, patch);
				});
				// 进度或日志写入失败后继续处理队列，发布结果的调用方仍能收到本次写入的结果。
				feedback = update.catch(() => undefined);
				return update;
			}
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
					await store.update(operationId, { status: "running", phase: "start", progress: 0.05 });
					const result = await input.fn(logger);
					await feedback;
					await store.update(operationId, { status: "succeeded", phase: "done", progress: 1, result });
				} catch (error) {
					await feedback;
					await store.update(operationId, {
						status: "failed",
						phase: "error",
						error: redactSecrets(error instanceof Error ? error.message : String(error)),
						...(error instanceof PublicationError ? { error_details: error.errorDetails } : {}),
					});
				}
			})().catch(() => console.error("[kit-server] 保存操作终态失败"));
			return operationId;
		},
	};
}
export type OperationRunner = ReturnType<typeof createOperationRunner>;
