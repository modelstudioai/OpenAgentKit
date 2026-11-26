import { KitError } from "@openagentkit/sdk/protocol";

export interface AuthStreamBinding {
	signal: AbortSignal;
	assertActive(): void | Promise<void>;
	close(): void;
}

export function expiringAuthStream(
	expiresAt?: string,
	controller: AbortController = new AbortController(),
): AuthStreamBinding {
	const expires = expiresAt ? Date.parse(expiresAt) : undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	function expire() {
		if (expires === undefined) return;
		const remaining = expires - Date.now();
		if (remaining <= 0) controller.abort(new KitError("unauthorized", "登录已过期，请重新登录"));
		else {
			timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
			timer.unref();
		}
	}
	expire();
	return {
		signal: controller.signal,
		assertActive() {
			controller.signal.throwIfAborted();
			if (expires !== undefined && expires <= Date.now()) throw new KitError("unauthorized", "登录已过期，请重新登录");
		},
		close: () => clearTimeout(timer),
	};
}
