import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KitError } from "@openagentkit/sdk/protocol";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { ConfirmGate } from "../src/service/shared/confirm-gate.ts";

function gate() {
	const config = loadConfig({
		KIT_GATEWAY: "mock",
		KIT_DATA_DIR: mkdtempSync(join(tmpdir(), "kit-gate-")),
		ADMIN_TOKEN: "x",
	});
	return new ConfirmGate(config);
}

describe("确认令牌闸门", () => {
	it("签发 → 消费成功；重复消费被拒", async () => {
		const g = gate();
		const { confirmToken } = await g.issue({ planId: "p1", action: "project.apply", subject: "admin" });
		await g.consume({ planId: "p1", action: "project.apply", subject: "admin", token: confirmToken });
		await expect(
			g.consume({ planId: "p1", action: "project.apply", subject: "admin", token: confirmToken }),
		).rejects.toMatchObject({
			code: "confirmation_required",
		});
	});

	it("缺令牌 / 错 action 均 confirmation_required", async () => {
		const g = gate();
		const { confirmToken } = await g.issue({ planId: "p1", action: "project.apply", subject: "admin" });
		await expect(
			g.consume({ planId: "p1", action: "project.apply", subject: "admin", token: "" }),
		).rejects.toBeInstanceOf(KitError);
		await expect(
			g.consume({ planId: "p1", action: "project.apply", subject: "admin", token: confirmToken.split(".")[0] + ".!" }),
		).rejects.toMatchObject({ code: "confirmation_required" });
		await expect(
			g.consume({ planId: "p1", action: "project.destroy", subject: "admin", token: confirmToken }),
		).rejects.toMatchObject({
			code: "confirmation_required",
		});
	});

	it("并行消费同一令牌时只允许一笔执行", async () => {
		const g = gate();
		const plan = { planId: "concurrent", action: "session.archive", subject: "member" };
		const { confirmToken } = await g.issue(plan);
		const request = { ...plan, token: confirmToken };
		const results = await Promise.allSettled([g.consume(request), g.consume(request)]);
		expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
		expect(results.find(({ status }) => status === "rejected")).toMatchObject({
			reason: { code: "confirmation_required" },
		});
	});
});
