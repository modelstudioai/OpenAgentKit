import { KitError } from "@openagentkit/sdk/protocol";

/** 会话只读链路保留可重试分类，并对外使用固定摘要。 */
export function sessionEventError(error: unknown, messages: { transient: string; permanent: string }): KitError {
	if (error instanceof KitError) return error;
	const detail = error as {
		retryable?: boolean;
		statusCode?: number;
		status?: number;
		code?: string;
		name?: string;
	} | null;
	const status = detail?.statusCode ?? detail?.status;
	let retryable = true;
	if (typeof detail?.retryable === "boolean") retryable = detail.retryable;
	else if (typeof status === "number") retryable = status === 429 || status >= 500;
	else if (
		detail?.code === "BAILIAN_EVENT_PROTOCOL_ERROR" ||
		detail?.code === "protocol" ||
		detail?.name === "UserError"
	)
		retryable = false;
	return new KitError("provider_error", retryable ? messages.transient : messages.permanent, { retryable });
}
