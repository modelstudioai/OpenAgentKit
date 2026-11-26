import { Inject, Injectable } from "@nestjs/common";
import { KitError } from "@openagentkit/sdk/protocol";
import type { ServerConfig } from "../../config.ts";
import { ConfirmationSigner } from "../../utils/confirm-token.ts";
import { KIT_CONFIG } from "../../utils/injection-tokens.ts";

/**
 * 破坏性动作两段式闸门：plan → 一次性确认令牌 → execute。
 * 令牌消费即失效；服务端不代替用户确认，无旁路。见 docs/protocol.md 与 AGENTS.md 红线。
 */
/** 已消费记录的保留期：令牌 TTL 是 5min，两倍之后的条目可以安全遗忘（防重放窗口早已关闭）。 */
const CONSUMED_TTL_MS = 10 * 60_000;
const CONSUMED_PRUNE_THRESHOLD = 1000;
const CONSUMED_HARD_CAP = 50_000;

@Injectable()
export class ConfirmGate {
	private readonly signer: ConfirmationSigner;
	private readonly consumed = new Map<string, number>();

	constructor(@Inject(KIT_CONFIG) config: ServerConfig) {
		this.signer = new ConfirmationSigner(config.confirmSecret);
	}

	private forgetStale(now: number) {
		if (this.consumed.size <= CONSUMED_PRUNE_THRESHOLD) return;
		for (const [key, at] of this.consumed) if (now - at > CONSUMED_TTL_MS) this.consumed.delete(key);
		while (this.consumed.size > CONSUMED_HARD_CAP) {
			const oldest = this.consumed.keys().next().value;
			if (oldest === undefined) break;
			this.consumed.delete(oldest);
		}
	}

	async issue(input: { planId: string; action: string; subject: string }) {
		const { token, expiresAt } = await this.signer.sign(input);
		return { confirmToken: token, expiresAt };
	}

	async consume(input: { planId: string; action: string; subject: string; token: string }) {
		if (!input.token) throw new KitError("confirmation_required", "缺少确认令牌");
		const now = Date.now();
		this.forgetStale(now);
		const key = `${input.planId}:${input.action}:${input.subject}`;
		if (this.consumed.has(key)) throw new KitError("confirmation_required", "确认令牌已使用");
		const result = await this.signer.verify(input.token, input);
		if (!result.ok) throw new KitError("confirmation_required", `确认令牌无效（${result.reason}）`);
		if (this.consumed.has(key)) throw new KitError("confirmation_required", "确认令牌已使用");
		this.consumed.set(key, now);
	}

	/** 测试用：观察已消费条目数。 */
	pendingCount() {
		return this.consumed.size;
	}
}
