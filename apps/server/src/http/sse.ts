import { redactSecrets } from "../config.ts";

export interface SseWriter {
	write(data: string): Promise<void>;
	abort(): void;
	onAbort(callback: () => void): void;
}

/** 由 Fetch Response 承担背压，关闭任一读端都会终止对应订阅。 */
export function streamResponse(
	signal: AbortSignal,
	run: (stream: SseWriter) => Promise<void>,
	onClose?: () => void,
): Response {
	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const writer = writable.getWriter();
	const encoder = new TextEncoder();
	const closed = new AbortController();
	const abort = () => {
		closed.abort();
		void writer.abort(closed.signal.reason).catch(() => undefined);
	};
	signal.addEventListener("abort", abort, { once: true });
	void writer.closed.catch(() => closed.abort());
	if (signal.aborted) abort();
	const start = async () => {
		try {
			// Nest 会等首块字节再发送响应头。使用 SSE 注释让连接先建立，业务帧仍等待鉴权与上游就绪。
			await writer.write(encoder.encode(": connected\n\n"));
			await run({
				write: (data) => writer.write(encoder.encode(data)),
				abort,
				onAbort(callback) {
					if (closed.signal.aborted) callback();
					else closed.signal.addEventListener("abort", callback, { once: true });
				},
			});
		} catch (error) {
			if (!closed.signal.aborted) {
				console.error("[kit-server]", redactSecrets(error instanceof Error ? error.message : String(error)));
			}
		} finally {
			signal.removeEventListener("abort", abort);
			onClose?.();
			await writer.close().catch(() => undefined);
		}
	};
	void start();
	return new Response(readable, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
			"x-accel-buffering": "no",
		},
	});
}
